import { describe, it, expect, beforeEach, vi } from 'vitest'

// ADR-880 — ONE PLAN, ONE PRICE.
//
// THE DEFECT. There were TWO live checkouts for the same Space plan. The legacy createSpacePlanCheckout
// billed the `<plan>_<period>` product syncPricingProductsToStripe mints from `pricing_settings.plan.*`
// (Business monthly = 1900, the BETA amount, with no cutover), while the loadout checkout bills the
// catalog item and switches to the LIST price key on 2026-09-01. After the cutover the same Business
// plan cost $19 through one button and $29 through the other. The legacy path is now a thin adapter
// over the loadout checkout, so there is exactly one price for a plan at any instant.

const { created, beta, flags, grant, lock } = vi.hoisted(() => ({
  created: [] as { line_items: { price: string; quantity: number }[]; metadata: Record<string, string> }[],
  beta: { active: true },
  /** ADR-1061: does THIS Space carry the private per-Space beta price grant? */
  grant: { granted: false },
  /** The Space's grandfathered locked price id for the item, or null. */
  lock: { priceId: null as string | null },
  flags: {
    plan_business_enabled: true,
    plan_collective_enabled: true,
    plan_nonprofit_enabled: true,
    plan_independent_enabled: true,
    catalog_operator_seat_active: false,
  } as Record<string, boolean>,
}))

vi.mock('./stripe', () => ({
  appUrl: () => 'https://frequencylocal.com',
  stripe: {
    checkout: {
      sessions: {
        create: (args: { line_items: { price: string; quantity: number }[]; metadata: Record<string, string> }) => {
          created.push(args)
          return Promise.resolve({ url: 'https://checkout.stripe.com/session' })
        },
      },
    },
  },
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () =>
            Promise.resolve({
              data: { id: 'space-1', owner_profile_id: 'p-1', slug: 'aset', stripe_customer_id: 'cus_1', seat_quantity: 0 },
            }),
        }),
      }),
    }),
  }),
}))

vi.mock('@/lib/pricing/settings', () => ({
  billingLive: () => Promise.resolve(true),
  loadPricingFlags: () => Promise.resolve(flags),
  getPricingValues: () => Promise.resolve({ trial: { days: 14 } }),
}))

// The synced price map: every key resolves to a price id NAMED after the key, so the assertion below
// reads as "which catalog key did the checkout charge".
vi.mock('./pricing-prices', () => ({ resolveStripePriceId: (key: string) => Promise.resolve(`price_${key}`) }))

// The grandfathered lock, controllable per test (null in every pre-ADR-1061 case).
vi.mock('./space-subscription-items', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./space-subscription-items')>()),
  readLockedPriceId: () => Promise.resolve(lock.priceId),
}))

// THE PRIVATE BETA PRICE GRANT (ADR-1061). Mocked at the IO seam, so these tests exercise the REAL
// wiring in resolveLoadoutPriceId rather than the pure decision (which lib/pricing/beta-grant.test.ts
// covers on its own). Default FALSE, which is what every Space carries.
vi.mock('./space-beta-grant', () => ({ spaceHasBetaPriceGrant: () => Promise.resolve(grant.granted) }))

vi.mock('@/lib/pricing/beta', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/pricing/beta')>()),
  isBetaPricingActive: () => beta.active,
}))

vi.mock('@/lib/profiles/account-email', () => ({ profileAccountEmail: () => Promise.resolve('owner@example.com') }))

import { createSpacePlanCheckout, createSpaceLoadoutCheckout } from './space-plan-checkout'

const prices = () => created.at(-1)!.line_items.map((l) => l.price)

beforeEach(() => {
  created.length = 0
  beta.active = true
  grant.granted = false
  lock.priceId = null
})

describe('the legacy plan checkout charges the SAME price as the loadout checkout', () => {
  it('Business monthly, during beta: the catalog founding price, not the legacy business_monthly product', async () => {
    await createSpacePlanCheckout('space-1', 'business', 'monthly')
    expect(prices()).toEqual(['price_business_base_month'])
    expect(prices().join()).not.toContain('business_monthly')
  })

  it('Business monthly, AFTER the cutover: the LIST price key, exactly like the loadout path', async () => {
    beta.active = false
    await createSpacePlanCheckout('space-1', 'business', 'monthly')
    const legacy = prices()
    await createSpaceLoadoutCheckout('space-1', { plan: 'business', interval: 'month' })
    expect(legacy).toEqual(['price_business_base_month_list'])
    expect(legacy).toEqual(prices())
  })

  it('annual maps to the year interval on both sides of the cutover', async () => {
    await createSpacePlanCheckout('space-1', 'nonprofit', 'annual')
    expect(prices()).toEqual(['price_nonprofit_seat_year'])
    beta.active = false
    await createSpacePlanCheckout('space-1', 'nonprofit', 'annual')
    expect(prices()).toEqual(['price_nonprofit_seat_year_list'])
  })

  it('stamps the metadata the webhook reconciles on', async () => {
    await createSpacePlanCheckout('space-1', 'business', 'monthly')
    expect(created.at(-1)!.metadata).toMatchObject({ kind: 'space_plan', space_id: 'space-1', plan: 'business' })
  })

  it('an unknown or unsold plan is a clean no-op, never a checkout', async () => {
    expect(await createSpacePlanCheckout('space-1', 'whitelabel', 'monthly')).toBeNull()
    expect(created).toEqual([])
  })

  it('a plan whose switch is OFF does not sell, through either door', async () => {
    flags.plan_business_enabled = false
    expect(await createSpacePlanCheckout('space-1', 'business', 'monthly')).toBeNull()
    expect(await createSpaceLoadoutCheckout('space-1', { plan: 'business', interval: 'month' })).toBeNull()
    expect(created).toEqual([])
    flags.plan_business_enabled = true
  })
})

// ADR-1061 — THE PRIVATE BETA PRICE GRANT, at the wiring, not at the decision.
//
// lib/pricing/beta-grant.test.ts proves the pure three-armed rule and proves no public surface moves.
// These tests prove the OTHER half: that the checkout actually asks, and that the answer reaches the
// Stripe line item. The price map mock names each price id after its catalog key, so the assertion
// reads as "which key did the checkout charge".
describe('a granted Space checks out at the founding rate while everyone else pays list', () => {
  beforeEach(() => {
    beta.active = false // the window is SHUT, which is the only world the grant exists for
  })

  it('WITHOUT the grant: Business and Collective resolve the LIST key, monthly and yearly', async () => {
    await createSpaceLoadoutCheckout('space-1', { plan: 'business', interval: 'month' })
    expect(prices()).toEqual(['price_business_base_month_list'])
    await createSpaceLoadoutCheckout('space-1', { plan: 'collective', interval: 'year' })
    expect(prices()).toEqual(['price_collective_base_year_list'])
  })

  it('WITH the grant: the same calls resolve the FOUNDING key instead', async () => {
    grant.granted = true
    await createSpaceLoadoutCheckout('space-1', { plan: 'business', interval: 'month' })
    expect(prices()).toEqual(['price_business_base_month'])
    await createSpaceLoadoutCheckout('space-1', { plan: 'collective', interval: 'year' })
    expect(prices()).toEqual(['price_collective_base_year'])
  })

  it('the grant reaches EVERY item in the loadout, not only the base', async () => {
    grant.granted = true
    await createSpaceLoadoutCheckout('space-1', { plan: 'collective', interval: 'month', addons: ['ai'] })
    expect(prices()).toEqual(['price_collective_base_month', 'price_addon_ai_month'])
  })

  it('the legacy plan checkout goes through the same door, so there is still ONE price per plan', async () => {
    grant.granted = true
    await createSpacePlanCheckout('space-1', 'business', 'annual')
    expect(prices()).toEqual(['price_business_base_year'])
  })

  it('A LOCK STILL WINS. A Space holding a locked price re-bills it, grant or no grant', async () => {
    lock.priceId = 'price_locked_from_a_real_subscription'
    for (const granted of [true, false]) {
      grant.granted = granted
      await createSpaceLoadoutCheckout('space-1', { plan: 'collective', interval: 'month' })
      expect(prices(), `granted=${granted}`).toEqual(['price_locked_from_a_real_subscription'])
    }
  })

  it('with the window OPEN the grant changes nothing, because everyone already gets founding', async () => {
    beta.active = true
    await createSpaceLoadoutCheckout('space-1', { plan: 'collective', interval: 'month' })
    const ungranted = prices()
    grant.granted = true
    await createSpaceLoadoutCheckout('space-1', { plan: 'collective', interval: 'month' })
    expect(ungranted).toEqual(['price_collective_base_month'])
    expect(prices()).toEqual(ungranted)
  })
})
