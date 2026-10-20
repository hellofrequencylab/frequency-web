import { beforeEach, describe, expect, it, vi } from 'vitest'
import { checkinLinksResponse, rewardsResponse } from '@/lib/contract'

// /api/v1/rewards and /api/v1/spaces/checkin-links (LIVE-1122): the app's Rewards tab and its NFC
// tag writer.

let authOk = true
const listMyLoyaltyCards = vi.fn()
const loyaltyEnabled = vi.fn()
const listMyCheckinLinks = vi.fn()
const asCaller = vi.fn((_auth: unknown, fn: () => unknown) => fn())

vi.mock('server-only', () => ({}))
vi.mock('@/lib/contract/caller', () => ({
  authorizeCaller: async () =>
    authOk
      ? { ok: true, via: 'bearer', caller: { id: 'p-1' }, profile: { current_season_zaps: 140, current_streak: 3 } }
      : { ok: false, code: 'unauthorized', message: 'Sign in again.' },
  asCaller,
}))
vi.mock('@/lib/rate-limit', () => ({ clientIp: () => '203.0.113.9', rateLimitOk: async () => true }))
vi.mock('@/lib/loyalty/store', () => ({ listMyLoyaltyCards, loyaltyEnabled }))
vi.mock('@/lib/spaces/checkin-links', () => ({ listMyCheckinLinks }))

const card = {
  spaceId: 's-1',
  spaceName: 'Moon Cafe',
  spaceSlug: 'moon-cafe',
  stamps: 4,
  required: 8,
  rewardTitle: 'A free pot of tea',
  rewardValueCents: 600,
  openRewards: [{ id: 'r-1', code: 'TEA-4KQ2', rewardTitle: 'A free pot of tea', rewardValueCents: 600, earnedAt: '2026-10-18T10:00:00Z', redeemedAt: null }],
  standing: { regular: true, streakWeeks: 3 },
  surpriseOdds: 10,
}

beforeEach(() => {
  authOk = true
  loyaltyEnabled.mockReset().mockReturnValue(true)
  listMyLoyaltyCards.mockReset().mockResolvedValue([card])
  listMyCheckinLinks.mockReset().mockResolvedValue([
    { spaceId: 's-1', spaceSlug: 'moon-cafe', spaceName: 'Moon Cafe', nodeId: 'n-1', url: 'https://frequencylocal.com/n/n-1?s=v1.abc.def' },
  ])
  asCaller.mockClear()
})

describe('GET /api/v1/rewards', () => {
  it('answers the caller\'s cards, codes and game counts', async () => {
    const { GET } = await import('./route')
    const json = await (await GET(new Request('https://x/api/v1/rewards'))).json()
    expect(rewardsResponse.safeParse(json).success).toBe(true)
    expect(json.data).toMatchObject({ enabled: true, seasonZaps: 140, streak: 3 })
    expect(json.data.cards[0]).toMatchObject({ spaceSlug: 'moon-cafe', stamps: 4, regular: true, streakWeeks: 3 })
    expect(json.data.cards[0].openRewards[0]).toEqual({ id: 'r-1', code: 'TEA-4KQ2', rewardTitle: 'A free pot of tea', rewardValueCents: 600, earnedAt: '2026-10-18T10:00:00Z' })
    expect(listMyLoyaltyCards).toHaveBeenCalledWith('p-1')
  })

  it('reads no cards while Regulars is switched off', async () => {
    loyaltyEnabled.mockReturnValue(false)
    const { GET } = await import('./route')
    const json = await (await GET(new Request('https://x/api/v1/rewards'))).json()
    expect(json.data).toMatchObject({ enabled: false, cards: [] })
    expect(listMyLoyaltyCards).not.toHaveBeenCalled()
  })

  it('is a 401 signed out', async () => {
    authOk = false
    const { GET } = await import('./route')
    expect((await GET(new Request('https://x/api/v1/rewards'))).status).toBe(401)
  })
})

describe('GET /api/v1/spaces/checkin-links', () => {
  it('lists the door links as the caller', async () => {
    const { GET } = await import('../spaces/checkin-links/route')
    const json = await (await GET(new Request('https://x/api/v1/spaces/checkin-links'))).json()
    expect(checkinLinksResponse.safeParse(json).success).toBe(true)
    expect(json.data.items[0]).toMatchObject({ spaceSlug: 'moon-cafe', nodeId: 'n-1' })
    expect(asCaller).toHaveBeenCalledTimes(1)
    expect(listMyCheckinLinks).toHaveBeenCalledWith('p-1')
  })

  it('is a 401 signed out', async () => {
    authOk = false
    const { GET } = await import('../spaces/checkin-links/route')
    expect((await GET(new Request('https://x/api/v1/spaces/checkin-links'))).status).toBe(401)
  })
})
