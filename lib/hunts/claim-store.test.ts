import { afterEach, describe, expect, it, vi } from 'vitest'

const rows: Record<string, unknown> = {}
const failures = new Set<string>()
const counts = new Map<string, number>()
const filters = vi.fn()
const rpc = vi.fn()
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const q: Record<string, unknown> = {}
      for (const method of ['select', 'eq', 'in', 'order', 'limit']) {
        q[method] = (...args: unknown[]) => {
          filters(table, method, ...args)
          return q
        }
      }
      const result = () => {
        const data = rows[table] ?? null
        return { data, count: counts.get(table) ?? (Array.isArray(data) ? data.length : null), error: failures.has(table) ? { message: 'read failed' } : null }
      }
      q.maybeSingle = async () => result()
      q.then = (resolve: (response: ReturnType<typeof result>) => unknown) => resolve(result())
      return q
    },
    rpc,
  }),
}))

import { signingSecret } from '@/lib/signing-secret'
import { claimAsPlayer, loadScanPlacement, openClaim } from './claim-store'
import { issueClaimToken } from './placement'

afterEach(() => {
  vi.unstubAllEnvs()
  for (const k of Object.keys(rows)) delete rows[k]
  failures.clear()
  counts.clear()
  filters.mockClear()
  rpc.mockReset()
})

const on = () => {
  vi.stubEnv('HUNTS_ENABLED', '1')
  vi.stubEnv('HUNTS_CLAIMS_ENABLED', '1')
  vi.stubEnv('HUNTS_PROOF_SECRET', 'test-proof-secret')
}
const NOW = 1_800_000_000

function scanFacts(missionKey = 'm1') {
  on()
  rows.hunt_placements = { id: 'pl-1', hunt_id: 'h-1', revoked_at: null }
  rows.hunts = { id: 'h-1', slug: 'north-county', status: 'live', current_version_id: 'v-1', revision: 1 }
  rows.hunt_versions = { id: 'v-1', trail_title: 'Trail', trail_hook: 'Explore' }
  rows.hunt_runs = { id: 'run-1', hunt_id: 'h-1', subject_profile_id: 'me', state: 'active' }
  rows.hunt_mission_placements = [{ mission_key: missionKey }]
  rows.hunt_missions = ['m1', 'm2'].map((key) => ({ mission_key: key, title: key, visible_body: null, locked_teaser: null, opens_at: null, closes_at: null }))
  rows.hunt_rule_groups = [
    { id: 'g1', target_mission_key: 'm2', target_finish: false, logic: 'all', min_count: null, group_key: null },
    { id: 'g2', target_mission_key: null, target_finish: true, logic: 'all', min_count: null, group_key: null },
  ]
  rows.hunt_rule_group_members = [{ group_id: 'g1', member_mission_key: 'm1' }, { group_id: 'g2', member_mission_key: 'm2' }]
  rows.hunt_progress = []
}

function claimInput(runId = 'run-1') {
  const secret = signingSecret('hunt-claim-proof', ['HUNTS_PROOF_SECRET'])
  const token = issueClaimToken({ secret, scope: { runId, placementId: 'pl-1' }, now: NOW })
  return { placementId: 'pl-1', token, idempotencyKey: 'test-key', nowEpoch: NOW + 1 }
}

describe('claim adapter', () => {
  it('answers disabled while the claims switch is off, and touches nothing', async () => {
    expect(await openClaim('me', 'pl-1', NOW)).toEqual({ ok: false, reason: 'disabled' })
    expect(await claimAsPlayer('me', { placementId: 'pl-1', missionKey: 'm1', token: 't', idempotencyKey: 'k', nowEpoch: NOW })).toEqual({ ok: false, reason: 'disabled' })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('reads a placement with its Hunt slug, and null for none', async () => {
    expect(await loadScanPlacement('pl-1')).toBeNull()
    rows.hunt_placements = { id: 'pl-1', hunt_id: 'h-1', revoked_at: null }
    rows.hunts = { slug: 'north-county' }
    expect(await loadScanPlacement('pl-1')).toEqual({ id: 'pl-1', huntId: 'h-1', revokedAt: null, huntSlug: 'north-county' })
  })

  it('opens a claim for the actor\'s own active run and credits it through the database', async () => {
    scanFacts()
    const opened = await openClaim('me', 'pl-1', NOW)
    expect(opened).toMatchObject({ ok: true, runId: 'run-1' })
    expect(rpc).not.toHaveBeenCalled()
    rpc.mockResolvedValue({ data: { result: 'credited', claim_id: 'c-1' }, error: null })
    const token = opened.ok ? opened.token : ''
    const out = await claimAsPlayer('me', { placementId: 'pl-1', missionKey: 'untrusted-override', token, idempotencyKey: 'test-key', nowEpoch: NOW + 1 })
    expect(out).toEqual({ ok: true, result: 'credited', claimId: 'c-1', replayed: false })
    expect(rpc).toHaveBeenCalledWith('hunt_claim_apply', expect.objectContaining({ p_actor: 'me', p_run_id: 'run-1', p_placement_id: 'pl-1', p_mission_key: 'm1', p_assurance: 'signed_node' }))
    expect(filters).toHaveBeenCalledWith('hunt_placements', 'in', 'medium', ['qr', 'nfc'])
    expect(filters).toHaveBeenCalledWith('hunts', 'eq', 'status', 'live')
    expect(filters).toHaveBeenCalledWith('hunts', 'in', 'visibility', ['public', 'unlisted'])
    expect(filters).toHaveBeenCalledWith('hunt_runs', 'eq', 'version_id', 'v-1')
    expect(filters).toHaveBeenCalledWith('hunt_mission_placements', 'eq', 'version_id', 'v-1')
    expect(filters).toHaveBeenCalledWith('hunt_mission_placements', 'limit', 2)
  })

  it('refuses another player\'s run and a bad token before calling the database', async () => {
    scanFacts()
    rows.hunt_runs = { id: 'run-1', hunt_id: 'h-1', subject_profile_id: 'someone-else', state: 'active' }
    expect(await claimAsPlayer('me', claimInput())).toEqual({ ok: false, reason: 'no_run' })
    rows.hunt_runs = { id: 'run-1', hunt_id: 'h-1', subject_profile_id: 'me', state: 'active' }
    expect(await claimAsPlayer('me', { ...claimInput(), token: 'x.y' })).toEqual({ ok: false, reason: 'bad_token' })
    expect(await claimAsPlayer('me', claimInput('another-run'))).toEqual({ ok: false, reason: 'bad_token' })
    expect(filters).not.toHaveBeenCalledWith('hunt_progress', expect.anything(), expect.anything(), expect.anything())
    expect(rpc).not.toHaveBeenCalled()
  })

  it.each([
    { label: 'unbound', bindings: [], count: 0 },
    { label: 'ambiguous', bindings: [{ mission_key: 'm1' }, { mission_key: 'm2' }], count: 2 },
    { label: 'truncated ambiguous', bindings: [{ mission_key: 'm1' }], count: 2 },
  ])('refuses a $label placement without one unique current-version mission', async ({ bindings, count }) => {
    scanFacts()
    rows.hunt_mission_placements = bindings
    counts.set('hunt_mission_placements', count)
    expect(await openClaim('me', 'pl-1', NOW)).toEqual({ ok: false, reason: 'mission_binding_unavailable' })
    expect(await claimAsPlayer('me', claimInput())).toEqual({ ok: false, reason: 'mission_binding_unavailable' })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('rechecks placement revocation and refuses a previously issued token', async () => {
    scanFacts()
    const input = claimInput()
    rows.hunt_placements = { id: 'pl-1', hunt_id: 'h-1', revoked_at: '2026-11-10T00:00:00Z' }
    expect(await claimAsPlayer('me', input)).toEqual({ ok: false, reason: 'placement_revoked' })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('refuses an unmet prerequisite, then credits through the RPC once the prerequisite is earned', async () => {
    scanFacts('m2')
    const input = claimInput()
    expect(await claimAsPlayer('me', input)).toEqual({ ok: false, reason: 'mission_not_eligible' })
    expect(rpc).not.toHaveBeenCalled()

    rows.hunt_progress = [{ mission_key: 'm1' }]
    rpc.mockResolvedValue({ data: { result: 'credited', claim_id: 'c-2' }, error: null })
    expect(await claimAsPlayer('me', input)).toMatchObject({ ok: true, result: 'credited' })
    expect(rpc).toHaveBeenCalledOnce()
    expect(rpc).toHaveBeenCalledWith('hunt_claim_apply', expect.objectContaining({ p_mission_key: 'm2' }))
  })

  it.each(['hunt_missions', 'hunt_rule_groups', 'hunt_rule_group_members', 'hunt_progress'])('fails closed on a %s read error', async (table) => {
    scanFacts()
    failures.add(table)
    expect(await claimAsPlayer('me', claimInput())).toEqual({ ok: false, reason: 'eligibility_unavailable' })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('fails closed when a graph relation is missing or cannot form a valid graph', async () => {
    scanFacts()
    delete rows.hunt_rule_groups
    expect(await claimAsPlayer('me', claimInput())).toEqual({ ok: false, reason: 'eligibility_unavailable' })
    rows.hunt_rule_groups = []
    expect(await claimAsPlayer('me', claimInput())).toEqual({ ok: false, reason: 'eligibility_unavailable' })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('refuses a truncated group read even when the returned graph omits the entire prerequisite', async () => {
    scanFacts('m2')
    rows.hunt_rule_groups = [{ id: 'g2', target_mission_key: null, target_finish: true, logic: 'all', min_count: null, group_key: null }]
    rows.hunt_rule_group_members = [{ group_id: 'g2', member_mission_key: 'm2' }]
    counts.set('hunt_rule_groups', 2)
    expect(await claimAsPlayer('me', claimInput())).toEqual({ ok: false, reason: 'eligibility_unavailable' })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('refuses a truncated member read even when the returned part of an all-group has credit', async () => {
    scanFacts('m2')
    rows.hunt_missions = [...(rows.hunt_missions as unknown[]), { mission_key: 'm0', title: 'm0', visible_body: null, locked_teaser: null, opens_at: null, closes_at: null }]
    rows.hunt_progress = [{ mission_key: 'm1' }]
    counts.set('hunt_rule_group_members', 3)
    expect(await claimAsPlayer('me', claimInput())).toEqual({ ok: false, reason: 'eligibility_unavailable' })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('acknowledges a retry with the same scoped token after credit without calling the RPC again', async () => {
    scanFacts()
    const input = claimInput()
    rpc.mockResolvedValue({ data: { result: 'credited', claim_id: 'c-1' }, error: null })
    expect(await claimAsPlayer('me', input)).toMatchObject({ ok: true, result: 'credited' })

    rows.hunt_progress = [{ mission_key: 'm1' }]
    expect(await claimAsPlayer('me', input)).toEqual({ ok: true, result: 'already_credited', replayed: false })
    expect(rpc).toHaveBeenCalledOnce()
  })
})
