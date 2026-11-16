// FH-043: the team rules a screen can state before a tap (the same split and succession the database
// applies), the invite code, the narrowed calls, and a source-shape guard on the migration that carries
// the two "cannot mutate" guarantees. The SQL itself runs under pgTAP in supabase/tests/hunt_teams.test.sql.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  TEAM_LIMITS, allocateAward, allocateTeamAward, applyTeamClaim, createTeam, inviteHash, joinTeam, leaveTeam, lockTeam,
  newInviteCode, nextCaptain, teamMessage, type RosterMember,
} from './teams'

const roster: RosterMember[] = [
  { profileId: 'c', joinedAt: '2026-11-01T10:02:00Z', leftAt: null },
  { profileId: 'a', joinedAt: '2026-11-01T10:00:00Z', leftAt: null },
  { profileId: 'b', joinedAt: '2026-11-01T10:01:00Z', leftAt: null },
  { profileId: 'gone', joinedAt: '2026-11-01T09:00:00Z', leftAt: '2026-11-02T00:00:00Z' },
]

describe('award allocation', () => {
  it('splits evenly and gives the spare units to the longest-standing members', () => {
    expect(allocateAward(5, roster)).toEqual([{ profileId: 'a', units: 2 }, { profileId: 'b', units: 2 }, { profileId: 'c', units: 1 }])
    expect(allocateAward(3, roster).map((s) => s.units)).toEqual([1, 1, 1])
    expect(allocateAward(1, roster)).toEqual([{ profileId: 'a', units: 1 }, { profileId: 'b', units: 0 }, { profileId: 'c', units: 0 }])
  })

  it('is the same whatever order the rows arrive in, and never loses or invents a unit', () => {
    const shuffled = [roster[2], roster[3], roster[0], roster[1]]
    for (const units of [0, 1, 2, 7, 100]) {
      expect(allocateAward(units, shuffled)).toEqual(allocateAward(units, roster))
      expect(allocateAward(units, roster).reduce((n, s) => n + s.units, 0)).toBe(units)
    }
  })

  it('gives a departed member nothing and breaks a tie on the profile id', () => {
    expect(allocateAward(9, roster).some((s) => s.profileId === 'gone')).toBe(false)
    const tie: RosterMember[] = [{ profileId: 'z', joinedAt: '2026-11-01T10:00:00Z', leftAt: null }, { profileId: 'y', joinedAt: '2026-11-01T10:00:00Z', leftAt: null }]
    expect(allocateAward(1, tie)).toEqual([{ profileId: 'y', units: 1 }, { profileId: 'z', units: 0 }])
    expect(allocateAward(4, [])).toEqual([])
    expect(allocateAward(-1, roster)).toEqual([])
  })
})

describe('departure recovery', () => {
  it('passes the captaincy to the longest-standing member left', () => {
    expect(nextCaptain(roster, 'a')).toBe('b')
    expect(nextCaptain(roster, 'c')).toBe('a')
  })

  it('disbands when the last member leaves', () => {
    expect(nextCaptain([roster[0], roster[3]], 'c')).toBeNull()
  })
})

describe('invite codes', () => {
  it('are unambiguous to read aloud and long enough not to guess', () => {
    const code = newInviteCode()
    expect(code).toMatch(/^[A-HJKMNP-Z2-9]{10}$/)
    expect(code).toHaveLength(TEAM_LIMITS.inviteLength)
    expect(newInviteCode()).not.toBe(code)
  })

  it('match however the member types them, and are stored only as a hash', () => {
    expect(inviteHash('abcd-efgh 23')).toBe(inviteHash('ABCDEFGH23'))
    expect(inviteHash('ABCDEFGH23')).toMatch(/^[0-9a-f]{64}$/)
    expect(inviteHash('ABCDEFGH24')).not.toBe(inviteHash('ABCDEFGH23'))
  })
})

const rpcReturning = (data: unknown) => vi.fn(async () => ({ data, error: null }))

describe('the calls', () => {
  it('create sends only the hash of the invite code and hands the code back once', async () => {
    const rpc = rpcReturning({ result: 'created', team_id: 'team-1' })
    const out = await createTeam(rpc, { actorId: 'p1', huntId: 'h1', name: '  The Lanterns  ', maxMembers: 99 })
    const [fn, args] = rpc.mock.calls[0] as unknown as [string, Record<string, unknown>]
    expect(fn).toBe('hunt_team_create')
    expect(args).toMatchObject({ p_actor: 'p1', p_hunt_id: 'h1', p_name: 'The Lanterns', p_max_members: TEAM_LIMITS.sizeMax })
    expect(out).toMatchObject({ result: 'created', teamId: 'team-1' })
    expect(args.p_invite_hash).toBe(inviteHash((out as { inviteCode: string }).inviteCode))
    expect(JSON.stringify(args)).not.toContain((out as { inviteCode: string }).inviteCode)
  })

  it('a refused create carries no invite code', async () => {
    expect(await createTeam(rpcReturning({ result: 'already_on_team' }), { actorId: 'p1', huntId: 'h1', name: 'X' })).toEqual({ result: 'already_on_team' })
  })

  it('join, lock and leave return the database answer', async () => {
    expect(await joinTeam(rpcReturning({ result: 'bad_invite' }), { actorId: 'p2', teamId: 't', inviteCode: 'nope' })).toEqual({ result: 'bad_invite' })
    expect(await lockTeam(rpcReturning({ result: 'locked', run_id: 'run-1' }), { actorId: 'p1', teamId: 't' })).toEqual({ result: 'locked', runId: 'run-1' })
    expect(await leaveTeam(rpcReturning({ result: 'left', disbanded: false, captain: 'p2' }), { actorId: 'p1', teamId: 't' }))
      .toEqual({ result: 'left', disbanded: false, captainId: 'p2' })
  })

  const claim = { actorId: 'p2', teamId: 't', runId: 'run-1', missionKey: 'stop-1', placementId: 'pl', evidenceId: 'node:pl', assurance: 'signed_node' as const, idempotencyKey: 'key-12345678' }

  it('a claim goes through the team door, never straight to the solo command', async () => {
    const rpc = rpcReturning({ result: 'credited', claim_id: 'c1' })
    expect(await applyTeamClaim(rpc, { ...claim, expectedProgressCount: 2 })).toEqual({ result: 'credited', claimId: 'c1', replayed: false })
    const [fn, args] = rpc.mock.calls[0] as unknown as [string, Record<string, unknown>]
    expect(fn).toBe('hunt_team_claim_apply')
    expect(args).toMatchObject({ p_actor: 'p2', p_team_id: 't', p_mission_key: 'stop-1', p_expected_progress_count: 2 })
    expect(args).not.toHaveProperty('p_run_id')
  })

  it.each(['not_on_team', 'roster_not_locked', 'already_credited'] as const)('a claim answered %s is not a credit', async (result) => {
    expect((await applyTeamClaim(rpcReturning({ result }), claim)).result).toBe(result)
  })

  it('an unknown answer or a database error throws rather than reading as success', async () => {
    await expect(applyTeamClaim(rpcReturning({ result: 'sure_why_not' }), claim)).rejects.toThrow(/does not know/)
    await expect(lockTeam(vi.fn(async () => ({ data: null, error: { message: 'boom' } })), { actorId: 'p', teamId: 't' })).rejects.toThrow(/boom/)
  })

  it('an award allocation returns the stored split', async () => {
    const rpc = rpcReturning({ result: 'allocated', replayed: true, shares: [{ profile_id: 'a', units: 3 }, { profile_id: 'b', units: 2 }, { junk: 1 }] })
    expect(await allocateTeamAward(rpc, { actorId: 'a', teamId: 't', awardKey: 'finish', units: 5 }))
      .toEqual({ result: 'allocated', replayed: true, shares: [{ profileId: 'a', units: 3 }, { profileId: 'b', units: 2 }] })
  })
})

describe('the words', () => {
  it('an outsider and a departed member read the same refusal', () => {
    expect(teamMessage('not_on_team')).toBe('You are not on this team.')
    expect(teamMessage('placement_not_valid')).toBe('This stop could not be confirmed.')
  })

  it('carries no em dash', () => {
    for (const r of ['created', 'joined', 'bad_invite', 'locked', 'left', 'credited', 'already_credited', 'roster_not_locked', 'too_few_members'] as const) {
      expect(teamMessage(r)).not.toMatch(/—|–/)
    }
  })
})

// The SQL carries the guarantees; this keeps a later edit from dropping them. pgTAP runs the behaviour.
describe('team migration shape', () => {
  const sql = readFileSync(join('supabase', 'migrations', '20270346082000_hunt_teams_editions.sql'), 'utf8')
  const code = sql.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n').toLowerCase()

  it.each(['hunt_teams', 'hunt_team_members', 'hunt_team_awards'])('%s is service role only', (t) => {
    expect(code).toContain(`create table if not exists public.${t} (`)
    expect(code).toContain(`alter table public.${t} enable row level security;`)
    expect(code).toContain(`revoke all on table public.${t} from public, anon, authenticated;`)
    expect(code).toContain(`grant all on public.${t} to service_role;`)
  })

  it('creates no policy and grants no function to a browser role', () => {
    expect(code).not.toContain('create policy')
    expect(code).not.toMatch(/grant execute[^;]*to (anon|authenticated|public)/)
  })

  it('walls every claim on a team run at the table, not only in the team command', () => {
    expect(code).toContain('before insert on public.hunt_claims')
    expect(code).toContain("if t.state <> 'locked' or not exists (")
    expect(code).toContain('m.left_at is null')
    expect(code).toContain("using errcode = '42501'")
  })

  it('credits through the one claim command and leaves it unchanged', () => {
    expect(code).toContain('answer := public.hunt_claim_apply(')
    expect(code).not.toContain('create or replace function public.hunt_claim_apply')
    expect(code).not.toContain('insert into public.hunt_progress')
  })

  it('keeps one active team per member and Hunt, one captain per team, one split per award', () => {
    expect(code).toContain('on public.hunt_team_members(hunt_id, profile_id) where left_at is null')
    expect(code).toContain("on public.hunt_team_members(team_id) where role = 'captain' and left_at is null")
    expect(code).toContain('primary key (team_id, award_key, profile_id)')
    expect(code).toContain('run_id uuid unique references public.hunt_runs(id)')
  })
})
