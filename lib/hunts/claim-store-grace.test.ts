// FH-044S (owner decision 2026-11-16, 7 days to finish): a scan credits a run still finishing on a
// replaced edition, against that edition's own rules, until 7 days after the release; then it falls
// through to the current edition, and a player whose only run is on the old edition gets no token.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type Row = Record<string, unknown>
let tables: Record<string, Row[]>
const rpc = vi.fn()

/** A PostgREST stand-in that applies eq / in filters and the exact count. */
function fakeFrom(table: string) {
  let rows = [...(tables[table] ?? [])]
  const result = () => ({ data: rows, count: rows.length, error: null })
  const q = {
    select: () => q,
    eq(column: string, value: unknown) { rows = rows.filter((r) => r[column] === value); return q },
    in(column: string, values: unknown[]) { rows = rows.filter((r) => values.includes(r[column])); return q },
    order: () => q,
    limit: () => q,
    maybeSingle: async () => ({ data: rows.length === 1 ? rows[0] : null, error: null }),
    then: (resolve: (v: ReturnType<typeof result>) => unknown) => resolve(result()),
  }
  return q
}
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: fakeFrom, rpc }) }))

import { claimAsPlayer, openClaim } from './claim-store'

const DAY = 86_400
const NOW = Math.floor(Date.parse('2026-11-16T12:00:00Z') / 1000)
const iso = (epoch: number) => new Date(epoch * 1000).toISOString()

function setup(releasedDaysAgo: number) {
  tables = {
    hunt_placements: [{ id: 'pl-1', hunt_id: 'h-1', revoked_at: null, medium: 'qr' }],
    hunts: [{ id: 'h-1', slug: 'coast', status: 'live', visibility: 'public', current_version_id: 'v-2', revision: 3 }],
    hunt_versions: [
      { id: 'v-1', hunt_id: 'h-1', version_no: 1, status: 'superseded', published_at: iso(NOW - 60 * DAY), trail_title: 'Spring' },
      { id: 'v-2', hunt_id: 'h-1', version_no: 2, status: 'published', published_at: iso(NOW - releasedDaysAgo * DAY), trail_title: 'Summer' },
    ],
    hunt_runs: [
      { id: 'run-old', hunt_id: 'h-1', version_id: 'v-1', subject_profile_id: 'me', state: 'active', attempt_no: 1 },
      { id: 'run-new', hunt_id: 'h-1', version_id: 'v-2', subject_profile_id: 'me', state: 'active', attempt_no: 1 },
    ],
    // The printed code was carried with its place: stop-2 on the old edition is stop-1 on the new one.
    hunt_mission_placements: [
      { hunt_id: 'h-1', version_id: 'v-1', mission_key: 'stop-2', placement_id: 'pl-1', venue_space_id: null },
      { hunt_id: 'h-1', version_id: 'v-2', mission_key: 'stop-1', placement_id: 'pl-1', venue_space_id: null },
    ],
    hunt_missions: [
      { version_id: 'v-1', mission_key: 'stop-1', title: 'Pier', visible_body: null, locked_teaser: null, opens_at: null, closes_at: null },
      { version_id: 'v-1', mission_key: 'stop-2', title: 'Library', visible_body: null, locked_teaser: null, opens_at: null, closes_at: null },
      { version_id: 'v-2', mission_key: 'stop-1', title: 'Library', visible_body: null, locked_teaser: null, opens_at: null, closes_at: null },
    ],
    hunt_rule_groups: [
      { id: 'f-1', version_id: 'v-1', target_mission_key: null, target_finish: true, logic: 'all', min_count: null, group_key: null },
      { id: 'f-2', version_id: 'v-2', target_mission_key: null, target_finish: true, logic: 'all', min_count: null, group_key: null },
    ],
    hunt_rule_group_members: [
      { group_id: 'f-1', version_id: 'v-1', member_mission_key: 'stop-1' },
      { group_id: 'f-1', version_id: 'v-1', member_mission_key: 'stop-2' },
      { group_id: 'f-2', version_id: 'v-2', member_mission_key: 'stop-1' },
    ],
    hunt_progress: [{ run_id: 'run-old', mission_key: 'stop-1', disposition: 'credited' }],
  }
}

const token = (opened: Awaited<ReturnType<typeof openClaim>>) => (opened.ok ? opened.token : '')

beforeEach(() => {
  vi.stubEnv('HUNTS_ENABLED', '1')
  vi.stubEnv('HUNTS_CLAIMS_ENABLED', '1')
  vi.stubEnv('HUNTS_PROOF_SECRET', 'test-proof-secret')
  rpc.mockResolvedValue({ data: { result: 'credited', claim_id: 'c-1' }, error: null })
})
afterEach(() => {
  vi.unstubAllEnvs()
  rpc.mockReset()
})

describe('a run in flight at a release', () => {
  it('inside the 7 days, a code on the old edition credits the old run against the old edition', async () => {
    setup(3)
    const opened = await openClaim('me', 'pl-1', NOW)
    expect(opened).toMatchObject({ ok: true, runId: 'run-old' })
    const out = await claimAsPlayer('me', { placementId: 'pl-1', token: token(opened), idempotencyKey: 'k', nowEpoch: NOW + 1 })
    expect(out, JSON.stringify(out)).toMatchObject({ ok: true, result: 'credited' })
    expect(rpc).toHaveBeenCalledWith('hunt_claim_apply', expect.objectContaining({ p_run_id: 'run-old', p_mission_key: 'stop-2', p_placement_id: 'pl-1' }))
  })

  it('after the 7 days, the same code credits the run on the current edition', async () => {
    setup(8)
    const opened = await openClaim('me', 'pl-1', NOW)
    expect(opened).toMatchObject({ ok: true, runId: 'run-new' })
    await claimAsPlayer('me', { placementId: 'pl-1', token: token(opened), idempotencyKey: 'k', nowEpoch: NOW + 1 })
    expect(rpc).toHaveBeenCalledWith('hunt_claim_apply', expect.objectContaining({ p_run_id: 'run-new', p_mission_key: 'stop-1' }))
  })

  it('a stop the old run already has falls through to the current edition', async () => {
    setup(3)
    tables.hunt_progress.push({ run_id: 'run-old', mission_key: 'stop-2', disposition: 'credited' })
    expect(await openClaim('me', 'pl-1', NOW)).toMatchObject({ ok: true, runId: 'run-new' })
  })

  it('after the 7 days, a player with only the old run gets no token and no credit', async () => {
    setup(8)
    tables.hunt_runs = tables.hunt_runs.filter((r) => r.id === 'run-old')
    expect(await openClaim('me', 'pl-1', NOW)).toEqual({ ok: false, reason: 'no_run' })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('never picks another member\'s old run', async () => {
    setup(3)
    tables.hunt_runs = tables.hunt_runs.map((r) => (r.id === 'run-old' ? { ...r, subject_profile_id: 'someone-else' } : r))
    expect(await openClaim('me', 'pl-1', NOW)).toMatchObject({ ok: true, runId: 'run-new' })
  })
})
