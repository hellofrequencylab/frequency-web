import { describe, it, expect, beforeEach, vi } from 'vitest'
import { SPOTLIGHT_BLOCKS_MESSAGE } from '@/lib/spotlight/caps'

// SPL-11 (LIVE-1884): a save refused for the block cap keeps its error string AND returns the typed
// `capReached` signal the builder draws its calm panel from. Every figure is read, never typed.

const { getUser, maybeSingle, rpc, within, catalog } = vi.hoisted(() => ({
  getUser: vi.fn(),
  maybeSingle: vi.fn(),
  rpc: vi.fn(),
  within: vi.fn(),
  catalog: vi.fn(),
}))

vi.mock('@/lib/platform-flags', () => ({ renderPathEnabled: async () => false }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: () => ({}) }) }))
vi.mock('@/lib/pricing/member-leadership', () => ({ memberWithinLeadershipAllowance: within }))
vi.mock('@/lib/pricing/catalog-config', async (orig) => ({ ...(await orig<object>()), loadCatalogConfig: catalog }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser },
    rpc,
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }),
  }),
}))

import { saveMemberGridLayout } from './spotlight-actions'

const grow = { rows: [{ id: 'r0', columns: 1, slots: ['about'] }] }

beforeEach(() => {
  vi.clearAllMocks()
  getUser.mockResolvedValue({ data: { user: { id: 'auth-1' } } })
  rpc.mockResolvedValue({ data: {}, error: null })
  within.mockResolvedValue(false)
  catalog.mockResolvedValue({ pwyw: { minCents: 499, suggestedCents: 1000, maxCents: 50000, presetCents: [500, 1000, 2500] } })
  maybeSingle.mockResolvedValue({ data: { id: 'prof-1', handle: 'ada', meta: {}, membership_tier: 'free' } })
})

describe('saveMemberGridLayout - block cap signal', () => {
  it('keeps the error string and adds the typed signal for a Member', async () => {
    const res = await saveMemberGridLayout(grow)
    expect(res.error).toBe(SPOTLIGHT_BLOCKS_MESSAGE)
    expect(res.capReached).toEqual({
      used: 0,
      allowed: 12,
      crewAllowed: 40,
      presetCents: [500, 1000, 2500],
      suggestedCents: 1000,
      minCents: 499,
    })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('names Crew its own allowance, so the panel can tell there is no higher rung', async () => {
    maybeSingle.mockResolvedValue({ data: { id: 'prof-1', handle: 'ada', meta: {}, membership_tier: 'crew' } })
    const res = await saveMemberGridLayout(grow)
    expect(res.capReached).toMatchObject({ allowed: 40, crewAllowed: 40 })
  })

  it('still names the cap when the catalog cannot be read', async () => {
    catalog.mockRejectedValue(new Error('down'))
    const res = await saveMemberGridLayout(grow)
    expect(res.capReached).toMatchObject({ allowed: 12, crewAllowed: 40, presetCents: [], minCents: 0 })
  })

  it('returns no signal when the save is allowed', async () => {
    within.mockResolvedValue(true)
    const res = await saveMemberGridLayout(grow)
    expect(res).toEqual({})
  })
})
