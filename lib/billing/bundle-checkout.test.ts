import { describe, it, expect, beforeEach, vi } from 'vitest'

// HOUSEHOLD / CIRCLE BUNDLE CHECKOUT (ADR-370) — the money half. What is locked here:
//
//   1. THE GATE. Nothing charges while billing is off or the operator has not turned the bundle on,
//      and nothing charges before the bundle's Price is synced to Stripe. This is the ABSOLUTE
//      INVARIANT for a path that takes real money from members.
//   2. THE STAMP. The session AND the subscription carry the kind, the owner, the seat roster, and the
//      TERMS (seats + granted tier) the buyer actually bought on. The webhook seats off the
//      subscription, so a stamp on the session alone would seat nobody; and reading the live config at
//      seating time would let an operator's later edit re-size a bundle already sold.
//   3. DEFAULT-DENY ON SEATS. One seat too many, or one seat id that is not a real profile, refuses the
//      whole checkout. Charging for a seat the webhook can never fill is the failure this pairing
//      exists to prevent.

const H = vi.hoisted(() => ({
  created: [] as { metadata: Record<string, string>; subscription_data: { metadata: Record<string, string> } }[],
  sellable: true,
  price: 'price_household_monthly' as string | null,
  config: { seats: 4, monthly_cents: 2400, annual_cents: 24000, tier: 'crew' },
  existingProfiles: [] as string[],
}))

vi.mock('./stripe', () => ({
  appUrl: () => 'https://frequencylocal.com',
  stripe: {
    checkout: {
      sessions: {
        create: (args: {
          metadata: Record<string, string>
          subscription_data: { metadata: Record<string, string> }
        }) => {
          H.created.push(args)
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
        eq: () => ({ maybeSingle: () => Promise.resolve({ data: { stripe_customer_id: 'cus_1' } }) }),
        in: (_col: string, ids: string[]) =>
          Promise.resolve({
            data: ids.filter((id) => H.existingProfiles.includes(id)).map((id) => ({ id })),
            error: null,
          }),
      }),
    }),
    rpc: async () => ({ data: null, error: null }),
  }),
}))

vi.mock('@/lib/pricing/settings', () => ({
  bundleSellable: () => Promise.resolve(H.sellable),
  getHouseholdBundle: () => Promise.resolve(H.config),
}))

vi.mock('./pricing-prices', () => ({ resolveStripePriceId: () => Promise.resolve(H.price) }))

import { createBundleCheckout } from './bundle-checkout'

const OWNER = '11111111-1111-4111-8111-111111111111'
const SEAT_A = '22222222-2222-4222-8222-222222222222'
const SEAT_B = '33333333-3333-4333-8333-333333333333'
const SEAT_C = '44444444-4444-4444-8444-444444444444'
const SEAT_D = '55555555-5555-4555-8555-555555555555'

const last = () => H.created.at(-1)!

beforeEach(() => {
  H.created.length = 0
  H.sellable = true
  H.price = 'price_household_monthly'
  H.config = { seats: 4, monthly_cents: 2400, annual_cents: 24000, tier: 'crew' }
  H.existingProfiles = [OWNER, SEAT_A, SEAT_B, SEAT_C, SEAT_D]
})

describe('createBundleCheckout — the gate', () => {
  it('creates no session while the bundle is not sellable', async () => {
    H.sellable = false
    expect(await createBundleCheckout({ profileId: OWNER })).toBeNull()
    expect(H.created).toHaveLength(0)
  })

  it('creates no session when the bundle Price has not been synced to Stripe', async () => {
    H.price = null
    expect(await createBundleCheckout({ profileId: OWNER })).toBeNull()
    expect(H.created).toHaveLength(0)
  })
})

describe('createBundleCheckout — what the webhook will read back', () => {
  it('stamps the kind, owner, seats and terms on BOTH the session and the subscription', async () => {
    const url = await createBundleCheckout({ profileId: OWNER, seatProfileIds: [SEAT_A, SEAT_B] })
    expect(url).toBe('https://checkout.stripe.com/session')

    const expected = {
      kind: 'household_bundle',
      owner_id: OWNER,
      billing_period: 'monthly',
      bundle_seats: '4',
      bundle_tier: 'crew',
      seat_ids: `${SEAT_A},${SEAT_B}`,
    }
    expect(last().metadata).toEqual(expected)
    // Seating runs off subscription events, so the same stamp has to ride the subscription.
    expect(last().subscription_data.metadata).toEqual(expected)
  })

  it('omits the seat list when the buyer takes the bundle alone (the rest of the seats stay open)', async () => {
    await createBundleCheckout({ profileId: OWNER })
    expect(last().metadata.seat_ids).toBeUndefined()
    expect(last().metadata.owner_id).toBe(OWNER)
  })

  it('carries the annual period through to the terms it stamps', async () => {
    await createBundleCheckout({ profileId: OWNER, period: 'annual' })
    expect(last().metadata.billing_period).toBe('annual')
  })

  it('stamps the tier the operator configured, so a later config edit cannot re-tier what was sold', async () => {
    H.config = { ...H.config, tier: 'supporter', seats: 6 }
    await createBundleCheckout({ profileId: OWNER, seatProfileIds: [SEAT_A] })
    expect(last().metadata).toMatchObject({ bundle_tier: 'supporter', bundle_seats: '6' })
  })
})

describe('createBundleCheckout — default-deny on seats', () => {
  it('refuses to charge for more seats than the bundle has', async () => {
    // Four co-seats plus the buyer is five, and the bundle seats four.
    expect(
      await createBundleCheckout({ profileId: OWNER, seatProfileIds: [SEAT_A, SEAT_B, SEAT_C, SEAT_D] }),
    ).toBeNull()
    expect(H.created).toHaveLength(0)
  })

  it('refuses a seat id that is not a real profile, rather than charging for a seat nobody can fill', async () => {
    H.existingProfiles = [OWNER, SEAT_A]
    expect(await createBundleCheckout({ profileId: OWNER, seatProfileIds: [SEAT_A, SEAT_B] })).toBeNull()
    expect(H.created).toHaveLength(0)
  })

  it('does not count the buyer twice when they list themselves', async () => {
    const url = await createBundleCheckout({
      profileId: OWNER,
      seatProfileIds: [OWNER, SEAT_A, SEAT_B, SEAT_C],
    })
    expect(url).toBe('https://checkout.stripe.com/session')
    expect(last().metadata.seat_ids).toBe(`${SEAT_A},${SEAT_B},${SEAT_C}`)
  })
})
