import { describe, it, expect, beforeEach, vi } from 'vitest'

// ADR-880 — ONE PLAN, ONE PRICE.
//
// THE DEFECT. There were TWO live checkouts for the same Space plan. The legacy createSpacePlanCheckout
// billed the `<plan>_<period>` product syncPricingProductsToStripe mints from `pricing_settings.plan.*`
// (Business monthly = 1900, the BETA amount, with no cutover), while the loadout checkout bills the
// catalog item and switches to the LIST price key on 2026-09-01. After the cutover the same Business
// plan cost $19 through one button and $29 through the other. The legacy path is now a thin adapter
// over the loadout checkout, so there is exactly one price for a plan at any instant.

const { created, beta, flags } = vi.hoisted(() => ({
  created: [] as { line_items: { price: string; quantity: number }[]; metadata: Record<string, string> }[],
  beta: { active: true },
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

// No grandfathered lock in these cases (a locked price is its own, already-tested path).
vi.mock('./space-subscription-items', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./space-subscription-items')>()),
  readLockedPriceId: () => Promise.resolve(null),
}))

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
