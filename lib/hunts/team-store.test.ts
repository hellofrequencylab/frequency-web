// FH-043: the team door reads the caller's own membership and nothing else picks the team or the run.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
  loadScanPlacement: vi.fn(),
  loadPublishedTrail: vi.fn(),
  loadUniquePlacementMission: vi.fn(),
}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: mocks.from }) }))
vi.mock('./claim-store', () => ({ loadScanPlacement: mocks.loadScanPlacement }))
vi.mock('./run-store', () => ({ loadPublishedTrail: mocks.loadPublishedTrail }))
vi.mock('./staff-store', () => ({ huntRpc: () => mocks.rpc, loadUniquePlacementMission: mocks.loadUniquePlacementMission }))

import { claimAsTeamMember, joinMyTeam, leaveMyTeam, lockMyTeam, myTeam, startTeam } from './team-store'

const TEAM = '00000000-0000-4000-a043-0000000000aa'
type Row = Record<string, unknown>
let tables: Record<string, Row[]>

/** A tiny PostgREST stand-in: eq / is / in filters, maybeSingle, and an awaited list with an exact count. */
function fakeFrom(table: string) {
  let rows = tables[table] ?? []
  const q = {
    select: () => q,
    eq(column: string, value: unknown) { rows = rows.filter((r) => r[column] === value); return q },
    is(column: string, value: unknown) { rows = rows.filter((r) => (r[column] ?? null) === value); return q },
    in(column: string, values: unknown[]) { rows = rows.filter((r) => values.includes(r[column])); return q },
    maybeSingle: async () => ({ data: rows.length === 1 ? rows[0] : null, error: null }),
    then: (resolve: (v: { data: Row[]; count: number; error: null }) => unknown) => resolve({ data: rows, count: rows.length, error: null }),
  }
  return q
}

const trail = {
  huntId: 'hunt-1', slug: 'coast-trail', versionId: 'v1', revision: 3, title: 'Coast', huntState: 'published',
  graph: {
    missions: [{ mission_key: 'stop-1', rule_groups: [] }, { mission_key: 'stop-2', rule_groups: [{ logic: 'all', members: ['stop-1'] }] }],
    finish: { rule_groups: [{ logic: 'all', members: ['stop-2'] }] },
  },
  content: [],
}
const input = { slug: 'coast-trail', code: 'stop-code-1', idempotencyKey: 'key-12345678', nowEpoch: 1_800_000_000 }

beforeEach(() => {
  vi.stubEnv('HUNTS_ENABLED', '1')
  vi.stubEnv('HUNTS_CLAIMS_ENABLED', '1')
  tables = {
    hunts: [{ id: 'hunt-1', slug: 'coast-trail', status: 'live', visibility: 'unlisted', current_version_id: 'v1' }],
    hunt_teams: [{ id: TEAM, hunt_id: 'hunt-1', version_id: 'v1', name: 'The Lanterns', state: 'locked', run_id: 'team-run' }],
    hunt_team_members: [
      { team_id: TEAM, hunt_id: 'hunt-1', profile_id: 'captain', role: 'captain', left_at: null },
      { team_id: TEAM, hunt_id: 'hunt-1', profile_id: 'member', role: 'member', left_at: null },
      { team_id: TEAM, hunt_id: 'hunt-1', profile_id: 'departed', role: 'member', left_at: '2026-11-02T00:00:00Z' },
    ],
    hunt_progress: [],
  }
  mocks.from.mockImplementation(fakeFrom)
  mocks.loadScanPlacement.mockResolvedValue({ id: 'pl-1', huntId: 'hunt-1', revokedAt: null, huntSlug: 'coast-trail' })
  mocks.loadPublishedTrail.mockResolvedValue(trail)
  mocks.loadUniquePlacementMission.mockResolvedValue('stop-1')
  mocks.rpc.mockResolvedValue({ data: { result: 'credited', claim_id: 'c1' }, error: null })
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetAllMocks()
})

describe('claimAsTeamMember', () => {
  it('credits the team run for a roster member, through the team door', async () => {
    expect(await claimAsTeamMember('member', input)).toEqual({ ok: true, result: 'credited', replayed: false })
    const [fn, args] = mocks.rpc.mock.calls[0]
    expect(fn).toBe('hunt_team_claim_apply')
    expect(args).toMatchObject({ p_actor: 'member', p_team_id: TEAM, p_mission_key: 'stop-1', p_placement_id: 'pl-1', p_expected_progress_count: 0 })
  })

  it.each(['outsider', 'departed'])('refuses %s before any database command', async (who) => {
    expect(await claimAsTeamMember(who, input)).toEqual({ ok: false, reason: 'not_on_team' })
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('refuses until the roster is locked', async () => {
    tables.hunt_teams[0] = { ...tables.hunt_teams[0], state: 'forming', run_id: null }
    expect(await claimAsTeamMember('member', input)).toEqual({ ok: false, reason: 'roster_not_locked' })
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('a stop the team already holds is one credit, and no second command', async () => {
    tables.hunt_progress = [{ run_id: 'team-run', mission_key: 'stop-1', disposition: 'credited' }]
    expect(await claimAsTeamMember('captain', input)).toEqual({ ok: true, result: 'already_credited', replayed: false })
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('does not credit a stop the team has not reached', async () => {
    mocks.loadUniquePlacementMission.mockResolvedValue('stop-2')
    expect(await claimAsTeamMember('member', input)).toEqual({ ok: false, reason: 'mission_not_eligible' })
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('rereads once when a teammate credited in between, then stops', async () => {
    mocks.rpc.mockResolvedValue({ data: { result: 'stale_progress' }, error: null })
    expect(await claimAsTeamMember('member', input)).toEqual({ ok: true, result: 'stale_progress', replayed: false })
    expect(mocks.rpc).toHaveBeenCalledTimes(2)
  })

  it('refuses a code from another Trail, a revoked code and a stop with no single binding', async () => {
    mocks.loadScanPlacement.mockResolvedValueOnce({ id: 'pl-1', huntId: 'hunt-9', revokedAt: null, huntSlug: 'other' })
    expect(await claimAsTeamMember('member', input)).toEqual({ ok: false, reason: 'placement_not_found' })
    mocks.loadScanPlacement.mockResolvedValueOnce({ id: 'pl-1', huntId: 'hunt-1', revokedAt: '2026-11-01T00:00:00Z', huntSlug: 'coast-trail' })
    expect(await claimAsTeamMember('member', input)).toEqual({ ok: false, reason: 'placement_not_found' })
    mocks.loadUniquePlacementMission.mockResolvedValue(null)
    expect(await claimAsTeamMember('member', input)).toEqual({ ok: false, reason: 'mission_binding_unavailable' })
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('a team formed on an earlier edition does not credit against the new one', async () => {
    mocks.loadPublishedTrail.mockResolvedValue({ ...trail, versionId: 'v2' })
    expect(await claimAsTeamMember('member', input)).toEqual({ ok: false, reason: 'eligibility_unavailable' })
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
})

describe('roster commands', () => {
  it('shows a member their own team as a count, never a roster', async () => {
    const team = await myTeam('member', 'coast-trail')
    expect(team).toEqual({ teamId: TEAM, huntId: 'hunt-1', versionId: 'v1', name: 'The Lanterns', state: 'locked', runId: 'team-run', captain: false, size: 2 })
    expect(await myTeam('outsider', 'coast-trail')).toBeNull()
    expect(await myTeam('departed', 'coast-trail')).toBeNull()
  })

  it('starts a team only on a live Trail, with the profile the action derived', async () => {
    mocks.rpc.mockResolvedValue({ data: { result: 'created', team_id: TEAM }, error: null })
    expect(await startTeam('captain', { slug: 'coast-trail', name: 'New' })).toMatchObject({ result: 'created', teamId: TEAM })
    expect(mocks.rpc.mock.calls[0][1]).toMatchObject({ p_actor: 'captain', p_hunt_id: 'hunt-1' })
    expect(await startTeam('captain', { slug: 'no-such-trail', name: 'New' })).toEqual({ result: 'hunt_not_live' })
    expect(mocks.rpc).toHaveBeenCalledTimes(1)
  })

  it('refuses a malformed team id without asking the database', async () => {
    expect(await joinMyTeam('p', { teamId: 'not-a-uuid', inviteCode: 'ABC' })).toEqual({ result: 'bad_invite' })
    expect(await lockMyTeam('p', 'x')).toEqual({ result: 'not_on_team' })
    expect(await leaveMyTeam('p', 'x')).toEqual({ result: 'not_on_team' })
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('passes join, lock and leave to the database, which decides', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { result: 'joined' }, error: null })
    expect(await joinMyTeam('p', { teamId: TEAM, inviteCode: 'ABCDEFGH23' })).toEqual({ result: 'joined' })
    mocks.rpc.mockResolvedValueOnce({ data: { result: 'not_captain' }, error: null })
    expect(await lockMyTeam('p', TEAM)).toMatchObject({ result: 'not_captain' })
    mocks.rpc.mockResolvedValueOnce({ data: { result: 'left', disbanded: true }, error: null })
    expect(await leaveMyTeam('p', TEAM)).toEqual({ result: 'left', disbanded: true, captainId: null })
  })
})

describe('dark', () => {
  it.each(['HUNTS_ENABLED', 'HUNTS_CLAIMS_ENABLED'])('with %s off nothing is read or written', async (flag) => {
    vi.stubEnv(flag, '')
    expect(await claimAsTeamMember('member', input)).toEqual({ ok: false, reason: 'disabled' })
    expect(await startTeam('captain', { slug: 'coast-trail', name: 'New' })).toEqual({ result: 'disabled' })
    expect(await joinMyTeam('p', { teamId: TEAM, inviteCode: 'A' })).toEqual({ result: 'disabled' })
    expect(await lockMyTeam('p', TEAM)).toEqual({ result: 'disabled' })
    expect(await leaveMyTeam('p', TEAM)).toEqual({ result: 'disabled' })
    expect(await myTeam('member', 'coast-trail')).toBeNull()
    expect(mocks.from).not.toHaveBeenCalled()
    expect(mocks.rpc).not.toHaveBeenCalled()
    expect(mocks.loadScanPlacement).not.toHaveBeenCalled()
  })
})
