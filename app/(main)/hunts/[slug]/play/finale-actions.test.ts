// FH-031T: the finale's taps. A reward on a Hunt with a finale is asked for only when the Event admits the
// player, the database's own seat refusal is shown in finale words, and the Event stop credits through
// hunt_claim_apply with the host's door mark at assurance event_door, never with a self check-in.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FinaleProjection } from '@/lib/hunts/rally-finale'

const mocks = vi.hoisted(() => ({
  getCallerProfile: vi.fn(),
  loadPublishedTrail: vi.fn(),
  loadPlayerRun: vi.fn(),
  loadRallyFinale: vi.fn(),
  loadFinaleStop: vi.fn(),
  rpc: vi.fn(),
  revalidatePath: vi.fn(),
  deferHuntEvent: vi.fn(),
}))
vi.mock('@/lib/auth', () => ({ getCallerProfile: mocks.getCallerProfile }))
vi.mock('@/lib/hunts/run-store', () => ({ loadPublishedTrail: mocks.loadPublishedTrail, loadPlayerRun: mocks.loadPlayerRun }))
vi.mock('@/lib/hunts/rally-finale-store', () => ({ loadRallyFinale: mocks.loadRallyFinale }))
vi.mock('@/lib/hunts/finale-store', () => ({ loadFinaleStop: mocks.loadFinaleStop }))
vi.mock('@/lib/hunts/staff-store', () => ({ huntRpc: () => mocks.rpc }))
vi.mock('@/lib/hunts/analytics', () => ({ deferHuntEvent: mocks.deferHuntEvent, reasonClass: (r: string) => r }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))

import { checkInAtFinaleAction, collectFinaleRewardAction, type FinaleActionState } from './finale-actions'

const idle: FinaleActionState = { status: 'idle', message: '' }
const form = (fields: Record<string, string>) => {
  const f = new FormData()
  for (const [k, v] of Object.entries(fields)) f.set(k, v)
  return f
}

const finale = (over: Partial<Extract<FinaleProjection, { kind: 'finale' }>> = {}): FinaleProjection => ({
  kind: 'finale',
  event: { id: 'ev-1', title: 'Harbor party', slug: 'harbor-party', startsAt: null },
  capacity: { capacity: 10, going: 3, spotsLeft: 7, isFull: false },
  admission: 'rsvp',
  attendance: 'none',
  seat: { kind: 'rsvp', id: 'rsvp-1' },
  access: { allowed: true, via: 'rsvp' },
  ...over,
})

beforeEach(() => {
  vi.stubEnv('HUNTS_ENABLED', 'on')
  vi.stubEnv('HUNTS_CLAIMS_ENABLED', 'on')
  vi.stubEnv('HUNTS_REWARDS_ENABLED', 'on')
  mocks.getCallerProfile.mockResolvedValue({ id: 'player-1' })
  mocks.loadPublishedTrail.mockResolvedValue({ huntId: 'h-1', versionId: 'v-1' })
  mocks.loadPlayerRun.mockResolvedValue({ runId: 'run-1', state: 'completed' })
  mocks.loadRallyFinale.mockResolvedValue(finale())
  mocks.loadFinaleStop.mockResolvedValue({ missionKey: 'finale', placementId: 'pl-ev' })
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetAllMocks()
})

describe('collectFinaleRewardAction', () => {
  it('asks hunt_reward_grant for a seated finisher, for the caller and their run', async () => {
    mocks.rpc.mockResolvedValue({ data: { result: 'granted', grant_id: 'g-1' }, error: null })
    const out = await collectFinaleRewardAction(idle, form({ slug: 'coast-trail', reward: 'finisher' }))
    expect(out).toEqual({ status: 'done', message: 'It is yours.' })
    expect(mocks.rpc).toHaveBeenCalledWith('hunt_reward_grant', expect.objectContaining({ p_actor: 'player-1', p_run_id: 'run-1', p_reward_key: 'finisher' }))
    expect(mocks.loadRallyFinale).toHaveBeenCalledWith('run-1', 'player-1', expect.any(String))
  })

  it('never calls the database for a finisher the Event has not admitted', async () => {
    mocks.loadRallyFinale.mockResolvedValue(finale({ admission: 'none', seat: null, access: { allowed: false, reason: 'event_full' } }))
    const out = await collectFinaleRewardAction(idle, form({ slug: 'coast-trail', reward: 'finisher' }))
    expect(out.status).toBe('error')
    expect(out.message).toContain('The finale is full')
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('shows the database seat refusal in finale words', async () => {
    mocks.rpc.mockResolvedValue({ data: { result: 'not_admitted', reason: 'no_seat' }, error: null })
    const out = await collectFinaleRewardAction(idle, form({ slug: 'coast-trail', reward: 'finisher' }))
    expect(out).toEqual({ status: 'error', message: 'The finale needs its own ticket or RSVP. Get yours on the event page.' })
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it('is dark with the rewards switch off, and refuses a malformed reward key', async () => {
    vi.stubEnv('HUNTS_REWARDS_ENABLED', '')
    expect((await collectFinaleRewardAction(idle, form({ slug: 'coast-trail', reward: 'finisher' }))).status).toBe('error')
    vi.stubEnv('HUNTS_REWARDS_ENABLED', 'on')
    expect((await collectFinaleRewardAction(idle, form({ slug: 'coast-trail', reward: 'Not A Key!' }))).status).toBe('error')
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
})

describe('checkInAtFinaleAction', () => {
  beforeEach(() => mocks.loadPlayerRun.mockResolvedValue({ runId: 'run-1', state: 'active' }))

  it('credits the Event stop with the host door mark at assurance event_door', async () => {
    mocks.loadRallyFinale.mockResolvedValue(finale({ attendance: 'host_marked' }))
    mocks.rpc.mockResolvedValue({ data: { result: 'credited', claim_id: 'c-1' }, error: null })
    const out = await checkInAtFinaleAction(idle, form({ slug: 'coast-trail' }))
    expect(out).toEqual({ status: 'done', message: 'Finale stop confirmed.' })
    expect(mocks.rpc).toHaveBeenCalledWith('hunt_claim_apply', expect.objectContaining({
      p_actor: 'player-1', p_run_id: 'run-1', p_mission_key: 'finale', p_placement_id: 'pl-ev',
      p_evidence_id: 'event-door:ev-1:rsvp:rsvp-1', p_assurance: 'event_door',
    }))
    expect(mocks.loadFinaleStop).toHaveBeenCalledWith({ huntId: 'h-1', versionId: 'v-1' })
  })

  it('a self check-in is not door evidence, so nothing is credited', async () => {
    mocks.loadRallyFinale.mockResolvedValue(finale({ attendance: 'self_checked_in' }))
    const out = await checkInAtFinaleAction(idle, form({ slug: 'coast-trail' }))
    expect(out.status).toBe('error')
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('a Trail with no Event stop credits nothing', async () => {
    mocks.loadRallyFinale.mockResolvedValue(finale({ attendance: 'host_marked' }))
    mocks.loadFinaleStop.mockResolvedValue(null)
    expect(await checkInAtFinaleAction(idle, form({ slug: 'coast-trail' }))).toEqual({ status: 'error', message: 'This Trail has no stop at the finale.' })
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('is dark with the claims switch off', async () => {
    vi.stubEnv('HUNTS_CLAIMS_ENABLED', '')
    mocks.loadRallyFinale.mockResolvedValue(finale({ attendance: 'host_marked' }))
    expect((await checkInAtFinaleAction(idle, form({ slug: 'coast-trail' }))).status).toBe('error')
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
})
