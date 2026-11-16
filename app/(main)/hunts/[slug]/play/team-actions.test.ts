import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getCallerProfile: vi.fn(),
  startTeam: vi.fn(),
  joinMyTeam: vi.fn(),
  lockMyTeam: vi.fn(),
  leaveMyTeam: vi.fn(),
  claimAsTeamMember: vi.fn(),
  revalidatePath: vi.fn(),
}))
vi.mock('@/lib/auth', () => ({ getCallerProfile: mocks.getCallerProfile }))
vi.mock('@/lib/hunts/team-store', () => ({
  startTeam: mocks.startTeam, joinMyTeam: mocks.joinMyTeam, lockMyTeam: mocks.lockMyTeam, leaveMyTeam: mocks.leaveMyTeam,
  claimAsTeamMember: mocks.claimAsTeamMember,
}))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))

import { claimTeamStopAction, joinTeamAction, leaveTeamAction, lockTeamAction, startTeamAction, type TeamActionState } from './team-actions'

const idle: TeamActionState = { status: 'idle', message: '' }
const form = (fields: Record<string, string>) => {
  const f = new FormData()
  for (const [k, v] of Object.entries(fields)) f.set(k, v)
  return f
}
const TEAM = '00000000-0000-4000-a043-0000000000aa'

beforeEach(() => {
  vi.stubEnv('HUNTS_ENABLED', 'on')
  vi.stubEnv('HUNTS_CLAIMS_ENABLED', 'on')
  mocks.getCallerProfile.mockResolvedValue({ id: 'player-1' })
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetAllMocks()
})

describe('team actions', () => {
  it('starting a team shows the invite code once and uses the derived profile', async () => {
    mocks.startTeam.mockResolvedValue({ result: 'created', teamId: TEAM, inviteCode: 'ABCDEFGH23' })
    const out = await startTeamAction(idle, form({ slug: 'coast-trail', name: ' The Lanterns ', profileId: 'someone-else' }))
    expect(out).toMatchObject({ status: 'done', teamId: TEAM, inviteCode: 'ABCDEFGH23' })
    expect(mocks.startTeam).toHaveBeenCalledWith('player-1', { slug: 'coast-trail', name: 'The Lanterns' })
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/hunts/coast-trail/play')
  })

  it('a refusal is an error in plain words and revalidates nothing', async () => {
    mocks.joinMyTeam.mockResolvedValue({ result: 'bad_invite' })
    expect(await joinTeamAction(idle, form({ slug: 'coast-trail', teamId: TEAM, inviteCode: 'nope' })))
      .toEqual({ status: 'error', message: 'That code does not open a team. Check it with your captain.' })
    mocks.lockMyTeam.mockResolvedValue({ result: 'not_captain' })
    expect((await lockTeamAction(idle, form({ slug: 'coast-trail', teamId: TEAM }))).status).toBe('error')
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it('lock and leave pass only the team id from the form', async () => {
    mocks.lockMyTeam.mockResolvedValue({ result: 'locked', runId: 'run-1' })
    expect((await lockTeamAction(idle, form({ slug: 'coast-trail', teamId: TEAM }))).status).toBe('done')
    expect(mocks.lockMyTeam).toHaveBeenCalledWith('player-1', TEAM)
    mocks.leaveMyTeam.mockResolvedValue({ result: 'left', disbanded: false, captainId: null })
    expect((await leaveTeamAction(idle, form({ slug: 'coast-trail', teamId: TEAM }))).status).toBe('done')
    expect(mocks.leaveMyTeam).toHaveBeenCalledWith('player-1', TEAM)
  })

  it('a team stop is claimed with a stable key and no team, run or stop key from the request', async () => {
    mocks.claimAsTeamMember.mockResolvedValue({ ok: true, result: 'credited', replayed: false })
    const fields = { slug: 'coast-trail', code: ' Stop-Code-1 ', teamId: 'forged', runId: 'forged', missionKey: 'stop-9' }
    expect(await claimTeamStopAction(idle, form(fields))).toEqual({ status: 'done', message: 'Stop confirmed for your team.' })
    const [actor, input] = mocks.claimAsTeamMember.mock.calls[0]
    expect(actor).toBe('player-1')
    expect(Object.keys(input).sort()).toEqual(['code', 'idempotencyKey', 'nowEpoch', 'slug'])
    expect(input.code).toBe('stop-code-1')
    await claimTeamStopAction(idle, form(fields))
    expect(mocks.claimAsTeamMember.mock.calls[1][1].idempotencyKey).toBe(input.idempotencyKey)
  })

  it('an outsider or departed member reads the same refusal', async () => {
    mocks.claimAsTeamMember.mockResolvedValue({ ok: false, reason: 'not_on_team' })
    expect(await claimTeamStopAction(idle, form({ slug: 'coast-trail', code: 'stop-code-1' }))).toEqual({ status: 'error', message: 'You are not on this team.' })
  })

  it('refuses when signed out, on a bad slug or code, and while the switch is off', async () => {
    expect((await claimTeamStopAction(idle, form({ slug: 'coast-trail', code: 'x' }))).status).toBe('error')
    expect((await startTeamAction(idle, form({ slug: 'Bad Slug', name: 'X' }))).status).toBe('error')
    mocks.getCallerProfile.mockResolvedValue(null)
    expect((await joinTeamAction(idle, form({ slug: 'coast-trail', teamId: TEAM, inviteCode: 'A' }))).message).toBe('Sign in to play on a team.')
    vi.stubEnv('HUNTS_CLAIMS_ENABLED', '')
    mocks.getCallerProfile.mockClear()
    expect(await leaveTeamAction(idle, form({ slug: 'coast-trail', teamId: TEAM }))).toEqual({ status: 'error', message: 'Teams are not open yet.' })
    expect(mocks.getCallerProfile).not.toHaveBeenCalled()
    for (const m of [mocks.startTeam, mocks.joinMyTeam, mocks.lockMyTeam, mocks.leaveMyTeam, mocks.claimAsTeamMember]) expect(m).not.toHaveBeenCalled()
  })
})
