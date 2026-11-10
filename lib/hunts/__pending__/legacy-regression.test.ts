import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { listTicketedEventProjections } from '@/lib/commerce/ticket-projection'
import { recordLoyaltyVisit } from '@/lib/loyalty/visit'
import { grantConnectorOutcome } from '@/lib/rewards/connector'
import { HUNT_SWITCH_KEYS, huntSwitchOn, type HuntSwitch } from '../flags'

const fake = vi.hoisted(() => ({
  rpc: vi.fn(),
  insertReward: vi.fn(),
  awardCheckIn: vi.fn(async () => ({ awarded: true, amount: 25 })),
  awardConnector: vi.fn(async () => ({ awarded: true, amount: 4 })),
  reads: [] as string[],
}))

vi.mock('@/lib/loyalty/store', () => ({
  loyaltyEnabled: () => true,
  getLoyaltyProgram: async () => ({ status: 'on', rewardTitle: 'Free coffee' }),
}))
vi.mock('@/lib/zaps', () => ({
  awardZapsForAction: fake.awardCheckIn,
  awardZaps: fake.awardConnector,
}))
vi.mock('@/lib/gems', () => ({ awardGems: vi.fn() }))
vi.mock('@/lib/achievements', () => ({ processGamificationEvent: vi.fn(async () => undefined) }))
vi.mock('@/lib/notifications/router', () => ({ routeNotification: vi.fn() }))
vi.mock('@/lib/events/poster-media', () => ({ posterSignedUrlMap: vi.fn() }))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    rpc: fake.rpc,
    from(table: string) {
      fake.reads.push(table)
      if (table === 'reward_grants') {
        const count = {
          select: () => count,
          eq: () => count,
          like: () => count,
          gte: async () => ({ count: 0, error: null }),
        }
        return { ...count, insert: fake.insertReward }
      }

      let data
      if (table === 'events') {
        data = [{
          id: 'event-1', slug: 'legacy-ticket', title: 'Legacy ticket', currency: 'usd',
          starts_at: '2099-01-01T00:00:00Z', theme: null, organizer_name: 'Legacy host',
        }]
      } else if (table === 'event_ticket_types') {
        data = [{
          event_id: 'event-1', pricing_mode: 'fixed', price_cents: 1250,
          min_cents: null, suggested_cents: null,
        }]
      } else {
        throw new Error(`Unexpected fixture table: ${table}`)
      }

      const read = {
        select: () => read, eq: () => read, or: () => read,
        order: () => read, limit: () => read, in: () => read,
        returns: async () => ({ data, error: null }),
      }
      return read
    },
  }),
}))

describe('legacy behavior with Frequency Hunts dark', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fake.reads.length = 0
    for (const key of Object.values(HUNT_SWITCH_KEYS)) vi.stubEnv(key, '')
    const switches: HuntSwitch[] = ['enabled', 'claims', 'rewards', 'authoring', 'worker']
    expect(switches.map(huntSwitchOn)).toEqual([false, false, false, false, false])
  })
  afterEach(() => vi.unstubAllEnvs())

  it('keeps the Regulars stamp and its one check-in award on a same-day retry', async () => {
    const visit = { stamps: 2, required: 6, earned: false }
    fake.rpc
      .mockResolvedValueOnce({ data: { ...visit, stamped: true }, error: null })
      .mockResolvedValueOnce({ data: { ...visit, stamped: false }, error: null })

    const args = ['space-1', 'member-1', '2026-11-10'] as const
    await expect(recordLoyaltyVisit(...args)).resolves.toMatchObject({
      outcome: { stamps: 2, required: 6, rewardTitle: 'Free coffee' }, zapsAwarded: 25,
    })
    await expect(recordLoyaltyVisit(...args)).resolves.toMatchObject({
      outcome: { stamps: 2 }, zapsAwarded: 0,
    })
    expect(fake.rpc.mock.calls).toEqual(Array.from({ length: 2 }, () => [
      'loyalty_record_visit', { _space: 'space-1', _profile: 'member-1', _day: '2026-11-10', _kind: 'visit' },
    ]))
    expect(fake.awardCheckIn.mock.calls).toEqual([['member-1', 'space_checkin']])
  })

  it('keeps the Connector grant and skips a duplicate award', async () => {
    fake.insertReward
      .mockResolvedValueOnce({ error: null })
      .mockResolvedValueOnce({ error: { code: '23505' } })

    const input = { inviterProfileId: 'inviter-1', guestKey: 'guest-1', outcome: 'rsvp' as const }
    await expect(grantConnectorOutcome(input)).resolves.toEqual({ granted: true, zaps: 4, gems: 0 })
    await expect(grantConnectorOutcome(input)).resolves.toEqual({
      granted: false, duplicate: true, zaps: 0, gems: 0,
    })
    expect(fake.insertReward).toHaveBeenCalledWith(expect.objectContaining({
      rule_key: 'connector:rsvp:inviter-1:guest-1', profile_id: 'inviter-1', amount: 4,
    }))
    expect(fake.awardConnector).toHaveBeenCalledTimes(1)
    expect(fake.awardConnector).toHaveBeenCalledWith('inviter-1', 4, expect.anything())
  })

  it('keeps the legacy Market ticket listing and its event link and price', async () => {
    await expect(listTicketedEventProjections()).resolves.toEqual([
      expect.objectContaining({
        id: 'event:event-1', href: '/events/legacy-ticket', productKind: 'ticket',
        priceCents: 1250, currency: 'usd', projected: true,
      }),
    ])
    expect(fake.reads).toEqual(['events', 'event_ticket_types'])
    expect(fake.rpc).not.toHaveBeenCalled()
  })
})
