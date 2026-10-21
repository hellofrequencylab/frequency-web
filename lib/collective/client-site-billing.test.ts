import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  owned: null as null | { sub: unknown; ownerId: string; plan: string },
  sites: [] as { entitlements: unknown }[],
  site: null as null | { id: string; entitlements: unknown },
  priceId: 'price_site' as string | null,
  price: {} as Record<string, unknown>,
  update: vi.fn(), retrieve: vi.fn(), reconcile: vi.fn(), written: [] as unknown[],
}))
vi.mock('./extra-space-billing', () => ({ ownedSubscription: async () => state.owned }))
vi.mock('@/lib/billing/stripe', () => ({ stripe: { subscriptions: { update: state.update }, prices: { retrieve: state.retrieve } } }))
vi.mock('@/lib/billing/pricing-prices', () => ({ resolveStripePriceId: async () => state.priceId }))
vi.mock('@/lib/billing/space-subscriptions', () => ({ reconcileSpacePlanSubscription: state.reconcile }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: (cols: string) => {
        const q = {
          eq: () => q,
          maybeSingle: async () => ({ data: state.site, error: null }),
          then: (res: (v: unknown) => void) => res({ data: state.sites, error: null }),
        }
        void cols
        return q
      },
      update: (v: { entitlements: unknown }) => ({ eq: async () => { state.written.push(v.entitlements); return { error: null } } }),
    }),
  }),
}))
import { clientSiteMonthlyCents, setClientSiteBadgeRemoval, siteLineQuantities, syncClientSiteBilling } from './client-site-billing'

const line = (key: string, id: string, quantity: number) => ({ id, quantity, price: { id: `price_${key}`, recurring: { interval: 'month' }, metadata: { frequency_pricing_key: `${key}_month` } } })
const subWith = (...lines: ReturnType<typeof line>[]) => ({ id: 'sub_1', items: { data: [line('network_base', 'si_base', 1), ...lines] } })

describe('siteLineQuantities', () => {
  it.each([
    [0, 0, { network_site: 0, network_site_mid: 0, network_site_high: 0, network_site_unbranded: 0 }],
    [1, 0, { network_site: 1, network_site_mid: 0, network_site_high: 0, network_site_unbranded: 0 }],
    [10, 0, { network_site: 10, network_site_mid: 0, network_site_high: 0, network_site_unbranded: 0 }],
    [11, 0, { network_site: 10, network_site_mid: 1, network_site_high: 0, network_site_unbranded: 0 }],
    [25, 3, { network_site: 10, network_site_mid: 15, network_site_high: 0, network_site_unbranded: 3 }],
    [26, 99, { network_site: 10, network_site_mid: 15, network_site_high: 1, network_site_unbranded: 26 }],
    [-4, -1, { network_site: 0, network_site_mid: 0, network_site_high: 0, network_site_unbranded: 0 }],
  ])('%i sites, %i badge-free', (sites, unbranded, expected) => {
    expect(siteLineQuantities(sites, unbranded)).toEqual(expected)
  })
  it('prices the ladder graduated: site 11 costs $29, site 1 stays $39', () => {
    expect(clientSiteMonthlyCents(siteLineQuantities(10, 0))).toBe(39_000)
    expect(clientSiteMonthlyCents(siteLineQuantities(11, 0))).toBe(39_000 + 2_900)
    expect(clientSiteMonthlyCents(siteLineQuantities(26, 0))).toBe(39_000 + 15 * 2_900 + 1_900)
    expect(clientSiteMonthlyCents(siteLineQuantities(2, 1))).toBe(2 * 3_900 + 1_500)
  })
})

describe('syncClientSiteBilling', () => {
  beforeEach(() => {
    vi.clearAllMocks(); state.written = []
    state.owned = { sub: subWith(), ownerId: 'owner', plan: 'network' }
    state.sites = [{ entitlements: {} }, { entitlements: { badge_removal: true } }]
    state.priceId = 'price_site'
    state.retrieve.mockImplementation(async () => state.price)
    state.price = { id: 'price_site', active: true, currency: 'usd', unit_amount: 3900, recurring: { interval: 'month' }, metadata: { frequency_pricing_key: 'network_site_month' } }
    state.update.mockResolvedValue({ id: 'sub_1' })
  })
  it('refuses a Space that is not an owned Network', async () => {
    state.owned = null
    expect(await syncClientSiteBilling('n')).toHaveProperty('error')
    state.owned = { sub: subWith(), ownerId: 'o', plan: 'collective' }
    expect(await syncClientSiteBilling('n')).toHaveProperty('error')
    expect(state.update).not.toHaveBeenCalled()
  })
  it('adds the lines the live sites call for', async () => {
    state.retrieve.mockImplementation(async () => ({ ...state.price, unit_amount: state.priceId === 'price_site' ? 3900 : 0 }))
    // the unbranded line has a different price: answer per call order (site line first, then unbranded)
    state.retrieve.mockResolvedValueOnce(state.price).mockResolvedValueOnce({ ...state.price, unit_amount: 1500, metadata: { frequency_pricing_key: 'network_site_unbranded_month' } })
    const result = await syncClientSiteBilling('n')
    expect(result).toEqual({ data: undefined })
    const params = state.update.mock.calls[0][1] as { items: unknown[] }
    expect(params.items).toEqual([{ price: 'price_site', quantity: 2 }, { price: 'price_site', quantity: 1 }])
    expect(state.reconcile).toHaveBeenCalled()
  })
  it('does nothing when the subscription already matches', async () => {
    state.owned = { sub: subWith(line('network_site', 'si_1', 2), line('network_site_unbranded', 'si_2', 1)), ownerId: 'o', plan: 'network' }
    expect(await syncClientSiteBilling('n')).toEqual({ data: undefined })
    expect(state.update).not.toHaveBeenCalled()
  })
  it('changes and removes existing lines in place', async () => {
    state.sites = []
    state.owned = { sub: subWith(line('network_site', 'si_1', 2), line('network_site_unbranded', 'si_2', 1)), ownerId: 'o', plan: 'network' }
    await syncClientSiteBilling('n')
    expect((state.update.mock.calls[0][1] as { items: unknown[] }).items).toEqual([{ id: 'si_1', deleted: true }, { id: 'si_2', deleted: true }])
  })
  it('refuses while the Stripe price is not created, and when it is the wrong amount', async () => {
    state.priceId = null
    expect(await syncClientSiteBilling('n')).toHaveProperty('error')
    state.priceId = 'price_site'
    state.price = { ...state.price, unit_amount: 100 }
    expect(await syncClientSiteBilling('n')).toHaveProperty('error')
    expect(state.update).not.toHaveBeenCalled()
  })
})

describe('setClientSiteBadgeRemoval', () => {
  beforeEach(() => {
    vi.clearAllMocks(); state.written = []
    state.owned = { sub: subWith(), ownerId: 'owner', plan: 'network' }
    state.site = { id: 's1', entitlements: { crm: true } }
    state.sites = [{ entitlements: { crm: true, badge_removal: true } }]
    state.priceId = null // the bill cannot change yet
  })
  it('puts the grant back when the bill cannot change', async () => {
    const result = await setClientSiteBadgeRemoval('n', 's1', true)
    expect(result).toHaveProperty('error')
    expect(state.written).toEqual([{ crm: true, badge_removal: true }, { crm: true }])
  })
  it('refuses a site the Network does not resell', async () => {
    state.site = null
    expect(await setClientSiteBadgeRemoval('n', 'x', true)).toHaveProperty('error')
    expect(state.written).toEqual([])
  })
  it('is a no-op when the site is already in that state', async () => {
    state.site = { id: 's1', entitlements: { badge_removal: true } }
    expect(await setClientSiteBadgeRemoval('n', 's1', true)).toEqual({ data: undefined })
    expect(state.written).toEqual([])
  })
})
