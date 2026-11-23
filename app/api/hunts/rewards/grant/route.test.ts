// FH-031T, the reward half, end to end over a fake service-role client: route -> grantRunReward ->
// the finale reader -> grantFinaleReward. Done when: a finished player with no seat at a full host
// Event is told it is full and holds no RSVP, ticket or reward afterwards. The fake client has no
// insert, update or delete, so any write to an Events table would throw here.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type R = Record<string, unknown>
const tables: Record<string, R[]> = {}
let going = 0
const { caller, rpc } = vi.hoisted(() => ({ caller: vi.fn(), rpc: vi.fn() }))

function query(table: string) {
  const filters: [string, unknown][] = []
  const rows = () => (tables[table] ?? []).filter((r) => filters.every(([c, v]) => r[c] === v))
  const q = {
    select: () => q,
    eq: (c: string, v: unknown) => (filters.push([c, v]), q),
    limit: () => q,
    maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
    then: (res: (v: unknown) => unknown) => Promise.resolve({ data: rows(), error: null }).then(res),
  }
  return q
}
vi.mock('@/lib/auth', () => ({ getCallerProfile: caller }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: (t: string) => query(t), rpc }) }))
vi.mock('@/lib/events/capacity', () => ({ getCapacityInfo: async () => ({ capacity: 2, going, spotsLeft: Math.max(0, 2 - going), isFull: going >= 2 }) }))

import { POST } from './route'

const origin = 'https://frequencylocal.com'
const RUN = '33333333-3333-4333-8333-333333333333'
const EVENT = '11111111-1111-4111-8111-111111111111'
const post = (body: unknown, source: string | null = origin) =>
  POST(new Request(origin + '/api/hunts/rewards/grant', { method: 'POST', headers: source ? { origin: source } : {}, body: JSON.stringify(body) }))
const ask = async (rewardKey = 'finisher') => {
  const res = await post({ runId: RUN, rewardKey })
  return { status: res.status, ...(await res.json()) as { ok: boolean; result?: string; message?: string; reason?: string } }
}

beforeEach(() => {
  vi.stubEnv('HUNTS_ENABLED', 'on')
  vi.stubEnv('HUNTS_CLAIMS_ENABLED', 'on')
  vi.stubEnv('HUNTS_REWARDS_ENABLED', 'on')
  caller.mockResolvedValue({ id: 'player' })
  rpc.mockReset()
  rpc.mockResolvedValue({ data: { result: 'granted', grant_id: 'g1' }, error: null })
  going = 1
  tables.hunt_runs = [{ id: RUN, hunt_id: 'h1', version_id: 'v1', state: 'completed', subject_profile_id: 'player' }]
  tables.hunts = [{ id: 'h1', owner_space_id: 'home' }]
  tables.hunt_versions = [{ id: 'v1', hunt_id: 'h1', policy: { finale: { event_id: EVENT } } }]
  tables.hunt_partners = []
  tables.hunt_rewards = [
    { hunt_id: 'h1', version_id: 'v1', reward_key: 'finisher', eligibility: { run_state: 'completed' } },
    { hunt_id: 'h1', version_id: 'v1', reward_key: 'stop-two', eligibility: { missions: ['stop-2'] } },
  ]
  tables.events = [{ id: EVENT, title: 'Rally night', slug: 'rally-night', starts_at: null, capacity: 2, is_cancelled: false, status: 'published', removed_at: null, host_space_id: 'home', space_id: null }]
  tables.event_rsvps = []
  tables.event_tickets = []
  tables.engagement_events = []
})
afterEach(() => vi.unstubAllEnvs())

describe('POST /api/hunts/rewards/grant', () => {
  it('is not there while rewards are off, and refuses another origin or a signed-out caller', async () => {
    vi.stubEnv('HUNTS_REWARDS_ENABLED', '')
    expect((await post({ runId: RUN, rewardKey: 'finisher' })).status).toBe(404)
    vi.stubEnv('HUNTS_REWARDS_ENABLED', 'on')
    expect((await post({ runId: RUN, rewardKey: 'finisher' }, 'https://elsewhere.example')).status).toBe(403)
    caller.mockResolvedValue(null)
    expect((await post({ runId: RUN, rewardKey: 'finisher' })).status).toBe(401)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('full Event: a finished player with no seat is told it is full and nothing is granted', async () => {
    going = 2
    const before = JSON.stringify(tables)
    const out = await ask()
    expect(out).toMatchObject({ status: 200, ok: false, result: 'not_admitted' })
    expect(out.message).toContain('The finale is full. Finishing the trail does not hold a place')
    expect(rpc).not.toHaveBeenCalled()
    // No RSVP, no ticket and no reward afterwards: nothing was written anywhere.
    expect(JSON.stringify(tables)).toBe(before)
    expect(tables.event_rsvps).toEqual([])
    expect(tables.event_tickets).toEqual([])
  })

  it('absent ticket, refunded ticket and a seat at another Event are each refused before the database', async () => {
    expect((await ask()).result).toBe('not_admitted')
    tables.event_tickets = [{ id: 't1', event_id: EVENT, buyer_profile_id: 'player', status: 'refunded', refunded_at: '2026-11-10T00:00:00Z', attended_at: null }]
    expect((await ask()).message).toContain('refunded')
    tables.event_tickets = [{ id: 't2', event_id: '22222222-2222-4222-8222-222222222222', buyer_profile_id: 'player', status: 'succeeded', refunded_at: null, attended_at: null }]
    expect((await ask()).result).toBe('not_admitted')
    expect(rpc).not.toHaveBeenCalled()
  })

  it('grants the completion reward to a finished player the Event admits', async () => {
    tables.event_rsvps = [{ id: 'r1', event_id: EVENT, profile_id: 'player', status: 'going', approval_status: 'none', attended_at: null }]
    expect(await ask()).toMatchObject({ status: 200, ok: true, result: 'granted', message: 'It is yours.' })
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc.mock.calls[0][0]).toBe('hunt_reward_grant')
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_actor: 'player', p_run_id: RUN, p_reward_key: 'finisher', p_idempotency_key: `reward-grant:${RUN}:finisher` })
  })

  it('reads the database’s own refusal once the seat check is applied there', async () => {
    tables.event_rsvps = [{ id: 'r1', event_id: EVENT, profile_id: 'player', status: 'going', approval_status: 'none', attended_at: null }]
    rpc.mockResolvedValue({ data: { result: 'not_admitted', reason: 'no_seat' }, error: null })
    expect(await ask()).toMatchObject({ ok: false, result: 'not_admitted', message: 'The finale needs its own ticket or RSVP. Get yours on the event page.' })
  })

  it('leaves a reward for named stops to its own rule, and a trail with no finale as it was', async () => {
    expect((await ask('stop-two')).result).toBe('granted')
    tables.hunt_versions[0].policy = {}
    expect((await ask()).result).toBe('granted')
    expect(rpc).toHaveBeenCalledTimes(2)
  })

  it('answers not found for a run that is not the caller’s and for an unknown reward', async () => {
    caller.mockResolvedValue({ id: 'someone-else' })
    expect(await ask()).toMatchObject({ status: 404, reason: 'not_found' })
    caller.mockResolvedValue({ id: 'player' })
    expect(await ask('nope')).toMatchObject({ status: 404, reason: 'not_found' })
    expect((await post({ runId: 'not-a-run', rewardKey: 'finisher' })).status).toBe(400)
    expect(rpc).not.toHaveBeenCalled()
  })
})
