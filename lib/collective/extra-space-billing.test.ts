import { beforeEach, describe, expect, it, vi } from 'vitest'
interface FixtureSubscription { id: string; status: string; metadata: Record<string, string>; items: { data: ReturnType<typeof line>[] } }
const state = vi.hoisted(() => ({ caller: { id: 'owner' } as { id: string } | null,
  owner: 'owner', billing: true, plan: 'collective', enabled: true, attached: 0, settled: 0,
  sub: {} as FixtureSubscription, retrieve: vi.fn(), update: vi.fn(), price: vi.fn(), resolvePrice: vi.fn(), rpc: vi.fn(), reconcile: vi.fn() }))
vi.mock('@/lib/auth', () => ({ getCallerProfile: async () => state.caller }))
vi.mock('@/lib/pricing/settings', () => ({ billingLive: async () => state.billing }))
vi.mock('@/lib/spaces/functions', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/spaces/functions')>()
  return { ...actual, spaceFunctionAccess: (space: Parameters<typeof actual.spaceFunctionAccess>[0], fn: string, role: Parameters<typeof actual.spaceFunctionAccess>[2]) => state.enabled && actual.spaceFunctionAccess(space, fn, role) }
})
vi.mock('@/lib/billing/pricing-prices', () => ({ resolveStripePriceId: state.resolvePrice }))
vi.mock('@/lib/billing/stripe', () => ({ stripe: { subscriptions: { retrieve: state.retrieve, update: state.update }, prices: { retrieve: state.price } } }))
vi.mock('@/lib/billing/space-subscriptions', () => ({ reconcileSpacePlanSubscription: state.reconcile }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({
  rpc: state.rpc,
  from: (table: string) => ({ select: (_: string, opts?: { head?: boolean }) => {
    if (opts?.head) return { eq: async () => ({ count: state.attached, error: null }) }
    const q = { eq: () => q, maybeSingle: async () => table === 'spaces'
      ? { data: { owner_profile_id: state.owner, stripe_subscription_id: 'sub_1', plan: state.plan, status: 'active', type: 'business' }, error: null }
      : { data: state.settled ? { quantity: state.settled, status: 'active' } : null, error: null } }
    return q
  } }),
}) }))
import { loadExtraSpaceQuote, updateExtraCollectiveSpaces } from './extra-space-billing'
function line(key: string, id: string, quantity = 1, interval = 'month') {
  return { id, quantity, price: { id: key === 'collective_space' || key === 'network_chapter' ? 'price_extra' : 'price_base', recurring: { interval }, metadata: { frequency_pricing_key: `${key}_${interval}` } } }
}
beforeEach(() => {
  vi.clearAllMocks(); state.caller = { id: 'owner' }; state.owner = 'owner'; state.billing = true; state.plan = 'collective'; state.enabled = true
  state.attached = 0; state.settled = 0
  state.sub = { id: 'sub_1', status: 'active', metadata: { kind: 'space_plan', space_id: 'parent' }, items: { data: [line('collective_base', 'si_base')] } }
  state.retrieve.mockImplementation(async () => structuredClone(state.sub))
  state.resolvePrice.mockResolvedValue('price_extra')
  state.price.mockResolvedValue({ id: 'price_extra', active: true, currency: 'usd', unit_amount: 2900, recurring: { interval: 'month' }, metadata: { frequency_pricing_key: 'collective_space_month' } })
  state.rpc.mockImplementation(async (name: string) => ({ error: null, data: name === 'begin_collective_space_change' ? true : null }))
  state.update.mockImplementation(async (_: string, params: { items: { deleted?: boolean; quantity?: number }[] }) => {
    const target = params.items[0].deleted ? 0 : (params.items[0].quantity ?? 0)
    state.settled = target
    state.sub.items.data = [line('collective_base', 'si_base'), ...(target ? [line('collective_space', 'si_extra', target)] : [])]
    return structuredClone(state.sub)
  })
  state.reconcile.mockResolvedValue(undefined)
})
describe('owner-gated extra Space purchases', () => {
  it.each(['anonymous', 'stranger', 'disabled', 'not-collective', 'billing-off', 'foreign-subscription', 'canceled-subscription'])('refuses %s before Stripe mutation', async reason => {
    if (reason === 'anonymous') state.caller = null
    if (reason === 'stranger') state.owner = 'stranger'
    if (reason === 'disabled') state.enabled = false
    if (reason === 'not-collective') state.plan = 'business'
    if (reason === 'billing-off') state.billing = false
    if (reason === 'foreign-subscription') state.sub.metadata.space_id = 'foreign'
    if (reason === 'canceled-subscription') state.sub.status = 'canceled'
    expect(await updateExtraCollectiveSpaces('parent', 2, 'price_extra', 2900)).toHaveProperty('error')
    expect(state.update).not.toHaveBeenCalled()
  })
  it('adds exactly the extra-Space item and reconciles capacity before releasing the reservation', async () => {
    expect(await updateExtraCollectiveSpaces('parent', 2, 'price_extra', 2900)).toEqual({ data: undefined })
    expect(state.update.mock.calls[0][1]).toEqual({ items: [{ price: 'price_extra', quantity: 2 }], proration_behavior: 'create_prorations', payment_behavior: 'error_if_incomplete' })
    expect(state.update.mock.calls[0][2]).toEqual(expect.objectContaining({ timeout: 20000, maxNetworkRetries: 0, idempotencyKey: expect.any(String) }))
    expect(state.reconcile).toHaveBeenCalledOnce()
    expect(state.rpc.mock.calls.map(c => c[0])).toEqual(['begin_collective_space_change', 'finish_collective_space_change'])
  })
  it('updates and removes only the existing extra item, never the base', async () => {
    state.sub.items.data.push(line('collective_space', 'si_extra', 2))
    await updateExtraCollectiveSpaces('parent', 3, 'price_extra', 2900)
    expect(state.update.mock.calls[0][1].items).toEqual([{ id: 'si_extra', quantity: 3 }])
    await updateExtraCollectiveSpaces('parent', 0, 'price_extra', 2900)
    expect(state.update.mock.calls[1][1].items).toEqual([{ id: 'si_extra', deleted: true }])
  })
  it('uses the base yearly interval and its synced price rather than silently billing monthly', async () => {
    state.sub.items.data = [line('collective_base', 'si_base', 1, 'year')]
    state.price.mockResolvedValue({ id: 'price_extra', active: true, currency: 'usd', unit_amount: 29000, recurring: { interval: 'year' }, metadata: { frequency_pricing_key: 'collective_space_year' } })
    expect(await loadExtraSpaceQuote('parent')).toEqual(expect.objectContaining({ interval: 'year', unitCents: 29000 }))
    expect(state.resolvePrice).toHaveBeenCalledWith('collective_space_year')
  })
  it.each([NaN, -1, 1.5])('refuses invalid quantity %s', async target => {
    expect(await updateExtraCollectiveSpaces('parent', target, 'price_extra', 2900)).toHaveProperty('error')
    expect(state.update).not.toHaveBeenCalled()
  })
  it('enforces the attached-Space floor server-side', async () => {
    state.attached = 7
    expect(await updateExtraCollectiveSpaces('parent', 1, 'price_extra', 2900)).toHaveProperty('error')
    expect(state.update).not.toHaveBeenCalled()
  })
  it('refuses unsynced, foreign-item or stale quoted pricing', async () => {
    state.resolvePrice.mockResolvedValue(null)
    expect(await updateExtraCollectiveSpaces('parent', 2, 'price_extra', 2900)).toHaveProperty('error')
    state.resolvePrice.mockResolvedValue('price_extra')
    expect(await updateExtraCollectiveSpaces('parent', 2, 'price_extra', 100)).toHaveProperty('error')
    state.price.mockResolvedValue({ currency: 'usd', unit_amount: 2900, recurring: { interval: 'month' }, metadata: { frequency_pricing_key: 'operator_seat_month' } })
    expect(await updateExtraCollectiveSpaces('parent', 2, 'price_extra', 2900)).toHaveProperty('error')
    expect(state.update).not.toHaveBeenCalled()
  })
  it('refuses an overlapping billing mutation', async () => {
    state.rpc.mockResolvedValue({ data: false, error: null })
    expect(await updateExtraCollectiveSpaces('parent', 2, 'price_extra', 2900)).toHaveProperty('error')
    expect(state.update).not.toHaveBeenCalled()
  })
  it('re-reads the current items after acquiring the reservation so a completed concurrent add is not duplicated', async () => {
    state.retrieve.mockResolvedValueOnce(structuredClone(state.sub)).mockResolvedValueOnce({ ...state.sub, items: { data: [line('collective_base', 'si_base'), line('collective_space', 'si_extra', 1)] } })
    await updateExtraCollectiveSpaces('parent', 2, 'price_extra', 2900)
    expect(state.update.mock.calls[0][1].items).toEqual([{ id: 'si_extra', quantity: 2 }])
  })
  it('retains the capacity reservation when Stripe or reconciliation outcomes are uncertain', async () => {
    state.update.mockRejectedValueOnce(new Error('timeout'))
    expect(await updateExtraCollectiveSpaces('parent', 2, 'price_extra', 2900)).toHaveProperty('error')
    expect(state.rpc.mock.calls.map(c => c[0])).toEqual(['begin_collective_space_change'])
  })
})

// SCAN-1008 (owner ruling 2026-10-19, "Build both"): a Network buys chapters past its ten included the
// same way a Collective buys member Spaces, on the network_chapter item, and stops at 25 in all.
describe('a Network buys extra chapters on network_chapter, up to 25 chapters (SCAN-1008)', () => {
  beforeEach(() => {
    state.plan = 'network'
    state.sub.items.data = [line('network_base', 'si_base')]
    state.price.mockResolvedValue({ id: 'price_extra', active: true, currency: 'usd', unit_amount: 4900, recurring: { interval: 'month' }, metadata: { frequency_pricing_key: 'network_chapter_month' } })
  })
  it('quotes the chapter item with ten included and fifteen more at most', async () => {
    expect(await loadExtraSpaceQuote('parent')).toEqual(expect.objectContaining({ itemKey: 'network_chapter', included: 10, maxQuantity: 15, unitCents: 4900, quantity: 0, minQuantity: 0 }))
    expect(state.resolvePrice).toHaveBeenCalledWith('network_chapter_month')
  })
  it('floors at the chapters attached past the ten included', async () => {
    state.attached = 12
    expect(await loadExtraSpaceQuote('parent')).toEqual(expect.objectContaining({ minQuantity: 2 }))
    expect(await updateExtraCollectiveSpaces('parent', 1, 'price_extra', 4900)).toHaveProperty('error')
    expect(state.update).not.toHaveBeenCalled()
  })
  it('refuses more than fifteen extra chapters: past 25 is a quote', async () => {
    expect(await updateExtraCollectiveSpaces('parent', 16, 'price_extra', 4900)).toHaveProperty('error')
    expect(state.update).not.toHaveBeenCalled()
  })
  it('adds exactly the chapter item and settles on its own row', async () => {
    state.update.mockImplementation(async (_: string, params: { items: { deleted?: boolean; quantity?: number }[] }) => {
      const target = params.items[0].deleted ? 0 : (params.items[0].quantity ?? 0)
      state.settled = target
      state.sub.items.data = [line('network_base', 'si_base'), ...(target ? [line('network_chapter', 'si_extra', target)] : [])]
      return structuredClone(state.sub)
    })
    expect(await updateExtraCollectiveSpaces('parent', 3, 'price_extra', 4900)).toEqual({ data: undefined })
    expect(state.update.mock.calls[0][1].items).toEqual([{ price: 'price_extra', quantity: 3 }])
    expect(state.rpc.mock.calls.map(c => c[0])).toEqual(['begin_collective_space_change', 'finish_collective_space_change'])
  })
  it('a Collective still quotes collective_space with five included and no ceiling', async () => {
    state.plan = 'collective'
    state.sub.items.data = [line('collective_base', 'si_base')]
    state.price.mockResolvedValue({ id: 'price_extra', active: true, currency: 'usd', unit_amount: 2900, recurring: { interval: 'month' }, metadata: { frequency_pricing_key: 'collective_space_month' } })
    expect(await loadExtraSpaceQuote('parent')).toEqual(expect.objectContaining({ itemKey: 'collective_space', included: 5, maxQuantity: null }))
  })
})
