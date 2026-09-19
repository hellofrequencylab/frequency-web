import { describe, it, expect, beforeEach, vi } from 'vitest'

// 🔴 THE ONE RULE THAT COSTS REAL MONEY (ADR-1372 §2, backlog LIVE-091).
//
// A member benefit is applied to the ticket price BEFORE the platform take-rate is computed, so
// `spaceTakeRateCents` receives the DISCOUNTED amount. Computing the application fee on the LIST
// price bills the Space a percentage of money nobody paid — the Space's payout is short by the fee
// on a discount it granted itself, on every sale, forever.
//
// That defect is invisible to every test that only checks the buyer's total: the buyer is charged
// correctly either way. It is only visible in the number handed to the fee function, which is what
// this file asserts on — the ARGUMENT, not just the outcome.
//
// THE NUMBERS, chosen so the right answer and the wrong one can never be confused:
//   list           10000 (a $100 ticket)
//   benefit         1500 bps = 15% off  → payable 8500
//   take-rate        500 bps = 5% (Business plan, network-sourced)
//   fee on 8500  =   425   ← correct
//   fee on 10000 =   500   ← the bug this file exists to catch
// 425 ≠ 500 ≠ 0, so neither a reorder nor a silently-zeroed fee can pass.
//
// The positive control is the other half: with NO benefit the fee must be 500 on the full 10000. A
// test that always read a discounted number would pass by reading zero; this one cannot.
//
// The benefits STORE (lib/spaces/benefits-store.ts) is mocked, so this file locks the ORDER of the
// calls in the checkout rather than re-testing the store's own reads.

const LIST_UNIT_CENTS = 10_000
const BENEFIT_BPS = 1_500
const BUSINESS_BPS = 500

const H = vi.hoisted(() => ({
  /** Every Stripe Checkout session this run created. */
  created: [] as {
    line_items: { quantity: number; price_data: { unit_amount: number; product_data: { name: string } } }[]
    payment_intent_data: { application_fee_amount: number; metadata: Record<string, string> }
    metadata: Record<string, string>
  }[],
  /** Every gross amount handed to the platform take-rate. THE assertion surface. */
  takeRateCalls: [] as { grossCents: number; plan: string | null; source: string }[],
  /** What the (mocked) benefits store returns for the buyer's tier. */
  benefits: [] as Record<string, unknown>[],
  /** The redemption ledger the store reports for this buyer, by benefit id. */
  uses: {} as Record<string, number>,
  /** The buyer's ACTIVE membership in the hosting Space. */
  membership: { tier_id: 'mt-1' } as { tier_id: string } | null,
  /** The ticket tier being bought. */
  tier: {} as Record<string, unknown>,
  reserved: true,
}))

vi.mock('@/lib/spaces/benefits-store', () => ({
  listBenefitsForTier: (_spaceId: string, _tierId: string) => Promise.resolve(H.benefits),
  usesForMember: () => Promise.resolve(H.uses),
  recordRedemption: () => Promise.resolve(),
}))

vi.mock('./stripe', () => ({
  appUrl: () => 'https://frequencylocal.com',
  stripe: {
    checkout: {
      sessions: {
        create: (args: (typeof H.created)[number]) => {
          H.created.push(args)
          return Promise.resolve({ id: 'cs_test_1', url: 'https://checkout.stripe.com/c/cs_test_1' })
        },
        expire: () => Promise.resolve({}),
      },
    },
  },
}))

vi.mock('./connect', () => ({
  payoutsLive: () => Promise.resolve(true),
  getConnectStatus: () => Promise.resolve({ accountId: 'acct_host', ready: true }),
}))

// The take-rate, standing in for the operator-configured rungs with ONE arithmetic rule so the
// expected fee is readable in the test body. It records what it was GIVEN, which is the whole point.
vi.mock('./fees', () => ({
  platformFeePct: () => 3,
  platformFeeCents: (gross: number) => Math.floor(gross * 0.03),
  memberTakeRateCents: () => Promise.resolve(0),
  resolvedNetworkRate: () =>
    Promise.resolve({
      free: 1000,
      paid: BUSINESS_BPS,
      nonprofit: 0,
      memberFree: 1000,
      member: 800,
    }),
  spaceTakeRateCents: (grossCents: number, plan: string | null, source: string) => {
    H.takeRateCalls.push({ grossCents, plan, source })
    if (source === 'self') return Promise.resolve(0)
    return Promise.resolve(Math.floor((grossCents * BUSINESS_BPS) / 10_000))
  },
}))

// A NETWORK-sourced sale, so the fee is non-zero and the order is observable at all. (On a sale the
// Space brought itself the rate is 0% by rule, and 0 is 0 whichever amount you multiply.)
vi.mock('@/lib/commerce/order-source', () => ({
  classifyOrderSource: () => Promise.resolve({ source: 'network', attributionRef: 'ref-1' }),
}))

vi.mock('@/lib/spaces/store', () => ({
  loadRootSpaceId: () => Promise.resolve('root-space'),
}))

const FUTURE = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

const EVENT_ROW = {
  id: 'ev-1',
  title: 'Full Moon Circle',
  slug: 'full-moon-circle',
  price_cents: null,
  is_cancelled: false,
  ends_at: FUTURE,
  starts_at: FUTURE,
  host_id: 'host-1',
  space_id: 'space-1',
  host_space_id: 'space-1',
}

// One row per table, wide enough to answer every `select` the checkout makes of it.
function rowFor(table: string): unknown {
  switch (table) {
    case 'events':
      return EVENT_ROW
    case 'spaces':
      return {
        id: 'space-1',
        owner_profile_id: 'owner-1',
        name: 'Royal Temple',
        brand_name: null,
        plan: 'business',
        network_connected: true,
        slug: 'royal-temple',
      }
    case 'event_ticket_types':
      return H.tier
    case 'space_memberships':
      return H.membership
    case 'profiles':
      return { membership_tier: 'crew' }
    default:
      return null
  }
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const chain: Record<string, unknown> = {}
      chain.select = () => chain
      chain.update = () => chain
      chain.eq = () => chain
      chain.maybeSingle = () => Promise.resolve({ data: rowFor(table), error: null })
      // The fee-receipt patch awaits `.update().eq()` directly — make the chain awaitable too.
      chain.then = (resolve: (v: unknown) => unknown) => resolve({ data: null, error: null })
      return chain
    },
    rpc: (_name: string, _args: unknown) =>
      Promise.resolve({ data: { reserved: H.reserved }, error: null }),
  }),
}))

import { createTicketCheckout, benefitAdjustedUnitCents } from './tickets'

/** A 15%-off benefit assigned to the tier the buyer holds. */
function percentBenefit(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ben-1',
    spaceId: 'space-1',
    kind: 'percent',
    value: BENEFIT_BPS,
    scope: 'space_events',
    label: 'Temple Member, 15% off',
    maxUses: null,
    period: null,
    startsAt: null,
    endsAt: null,
    isActive: true,
    tierIds: ['mt-1'],
    ...overrides,
  }
}

function fixedTier(overrides: Record<string, unknown> = {}) {
  return {
    id: 'tt-1',
    event_id: 'ev-1',
    name: 'General',
    pricing_mode: 'fixed',
    price_cents: LIST_UNIT_CENTS,
    min_cents: null,
    suggested_cents: null,
    quantity: null,
    sold: 0,
    member_only: false,
    // The ADR-823 gate is ON, so every case below also proves a benefit changes PRICE without
    // touching ADMISSION.
    space_members_only: true,
    space_tier_id: 'mt-1',
    active: true,
    ...overrides,
  }
}

function buy(opts: { qty?: number; amountCents?: number | null } = {}) {
  return createTicketCheckout({
    buyerProfileId: 'buyer-1',
    eventId: 'ev-1',
    ticketTypeId: 'tt-1',
    qty: opts.qty ?? 1,
    amountCents: opts.amountCents ?? null,
  })
}

beforeEach(() => {
  H.created.length = 0
  H.takeRateCalls.length = 0
  H.benefits = []
  H.uses = {}
  H.membership = { tier_id: 'mt-1' }
  H.tier = fixedTier()
  H.reserved = true
})

describe('the platform fee is computed on the DISCOUNTED amount (ADR-1372 §2)', () => {
  it('hands the take-rate the discounted gross, not the list price', async () => {
    H.benefits = [percentBenefit()]

    const r = await buy()
    expect(r.url).toBeTruthy()

    // THE ASSERTION. 8500 is the discounted gross; 10000 is the list price the fee must never see.
    expect(H.takeRateCalls).toHaveLength(1)
    expect(H.takeRateCalls[0].grossCents).toBe(8_500)
    expect(H.takeRateCalls[0].grossCents).not.toBe(LIST_UNIT_CENTS)

    // …and the fee that reached Stripe is the rate applied to THAT number: 5% of 8500 = 425.
    // Applying the same rate to the list price would be 500, so this cannot pass reordered.
    expect(H.created[0].payment_intent_data.application_fee_amount).toBe(425)
    expect(H.created[0].payment_intent_data.application_fee_amount).not.toBe(500)

    // The buyer is charged the discounted unit (the half that IS visible without this test).
    expect(H.created[0].line_items[0].price_data.unit_amount).toBe(8_500)
  })

  it('POSITIVE CONTROL: with no benefit the fee is the rate on the FULL list price', async () => {
    H.benefits = []

    const r = await buy()
    expect(r.url).toBeTruthy()

    // If this read 8500/425 the suite would be measuring nothing: it would mean the test passes by
    // always discounting rather than by the order being right.
    expect(H.takeRateCalls[0].grossCents).toBe(LIST_UNIT_CENTS)
    expect(H.created[0].payment_intent_data.application_fee_amount).toBe(500)
    expect(H.created[0].line_items[0].price_data.unit_amount).toBe(LIST_UNIT_CENTS)
  })

  it('holds across quantity: the discount is per ticket and the fee follows the gross', async () => {
    H.benefits = [percentBenefit()]

    await buy({ qty: 3 })

    // 3 × 8500 = 25500 payable; 5% = 1275. On the list gross (30000) it would be 1500.
    expect(H.takeRateCalls[0].grossCents).toBe(25_500)
    expect(H.created[0].payment_intent_data.application_fee_amount).toBe(1_275)
    expect(H.created[0].line_items[0].quantity).toBe(3)
  })

  it('a buyer holding no membership pays the list price and the fee on it', async () => {
    H.benefits = [percentBenefit()]
    H.membership = null
    H.tier = fixedTier({ space_members_only: false, space_tier_id: null })

    await buy()

    expect(H.takeRateCalls[0].grossCents).toBe(LIST_UNIT_CENTS)
    expect(H.created[0].payment_intent_data.application_fee_amount).toBe(500)
  })

  it('stamps the benefit on the session so a completion can redeem it, and names it for the buyer', async () => {
    H.benefits = [percentBenefit()]

    await buy()

    expect(H.created[0].metadata.benefit_id).toBe('ben-1')
    expect(H.created[0].metadata.benefit_discount_cents).toBe('1500')
    expect(H.created[0].payment_intent_data.metadata.benefit_id).toBe('ben-1')
    expect(H.created[0].line_items[0].price_data.product_data.name).toContain(
      'Temple Member, 15% off',
    )
  })
})

describe('a benefit that covers the whole ticket takes the free-claim path', () => {
  it('returns the claim instead of opening a zero-amount Stripe session', async () => {
    H.benefits = [percentBenefit({ id: 'ben-all', kind: 'included', value: 0, label: 'Members included' })]

    const r = await buy()

    expect(r).toEqual({ free: true })
    // No session, no destination charge, and no fee on nothing.
    expect(H.created).toHaveLength(0)
    expect(H.takeRateCalls).toHaveLength(0)
  })

  it('does the same when amount_off exceeds the list price', async () => {
    H.benefits = [percentBenefit({ kind: 'amount_off', value: 999_999 })]

    expect(await buy()).toEqual({ free: true })
    expect(H.created).toHaveLength(0)
  })
})

describe('a capped benefit is resolved against the redemption ledger', () => {
  it('applies while the member is under the cap, and prices the fee on the discount', async () => {
    H.benefits = [percentBenefit({ maxUses: 1, period: 'month' })]
    H.uses = { 'ben-1': 0 }

    await buy()

    expect(H.takeRateCalls[0].grossCents).toBe(8_500)
    expect(H.created[0].payment_intent_data.application_fee_amount).toBe(425)
  })

  it('charges the list price once the cap is spent', async () => {
    H.benefits = [percentBenefit({ maxUses: 1, period: 'month' })]
    H.uses = { 'ben-1': 1 }

    await buy()

    expect(H.takeRateCalls[0].grossCents).toBe(LIST_UNIT_CENTS)
    expect(H.created[0].payment_intent_data.application_fee_amount).toBe(500)
    expect(H.created[0].metadata.benefit_id).toBeUndefined()
  })
})

describe('the ADR-823 admission gate still decides WHO may buy', () => {
  it('refuses a non-member even when a benefit would have priced the ticket', async () => {
    H.benefits = [percentBenefit()]
    H.membership = null

    const r = await buy()

    expect(r.error).toContain('members')
    expect(H.created).toHaveLength(0)
    expect(H.takeRateCalls).toHaveLength(0)
  })

  it('refuses a member of the WRONG tier, benefit or not', async () => {
    H.benefits = [percentBenefit()]
    H.membership = { tier_id: 'mt-2' }

    const r = await buy()

    expect(r.error).toContain('different')
    expect(H.created).toHaveLength(0)
  })
})

describe('buyer-chosen pricing keeps its floor semantics (no benefit applies)', () => {
  it('leaves a pwyc amount alone: there is no list price to take a percentage of', async () => {
    H.benefits = [percentBenefit()]
    H.tier = fixedTier({ pricing_mode: 'pwyc', price_cents: null, min_cents: 5_000 })

    await buy({ amountCents: LIST_UNIT_CENTS })

    // The buyer NAMED 10000. A benefit here would either break the Space's stated floor or be
    // clamped back up to it and read as broken, so it does not apply at all.
    expect(H.created[0].line_items[0].price_data.unit_amount).toBe(LIST_UNIT_CENTS)
    expect(H.takeRateCalls[0].grossCents).toBe(LIST_UNIT_CENTS)
    expect(H.created[0].metadata.benefit_id).toBeUndefined()
  })

  it('still enforces min_cents below the floor', async () => {
    H.benefits = [percentBenefit()]
    H.tier = fixedTier({ pricing_mode: 'sliding_scale', price_cents: null, min_cents: 5_000 })

    const r = await buy({ amountCents: 4_000 })

    expect(r.error).toContain('Minimum')
    expect(H.created).toHaveLength(0)
  })
})

// The pure half, asserted directly so the rules survive a refactor of the checkout around them.
describe('benefitAdjustedUnitCents (pure)', () => {
  const benefits = [percentBenefit()] as unknown as Parameters<
    typeof benefitAdjustedUnitCents
  >[0]['benefits']

  it('applies a percent benefit to a fixed price', () => {
    const out = benefitAdjustedUnitCents({
      mode: 'fixed',
      listUnitCents: LIST_UNIT_CENTS,
      benefits,
      tierId: 'mt-1',
    })
    expect(out.unitCents).toBe(8_500)
    expect(out.applied?.benefitId).toBe('ben-1')
  })

  it('never applies to a buyer-chosen mode', () => {
    for (const mode of ['pwyc', 'sliding_scale', 'donation'] as const) {
      const out = benefitAdjustedUnitCents({
        mode,
        listUnitCents: LIST_UNIT_CENTS,
        benefits,
        tierId: 'mt-1',
      })
      expect(out.unitCents).toBe(LIST_UNIT_CENTS)
      expect(out.applied).toBeNull()
    }
  })

  it('drops a CAPPED benefit whose cap was never resolved (never over-discount)', () => {
    const capped = [percentBenefit({ maxUses: 1, period: 'month' })] as unknown as typeof benefits
    // No `usesByBenefitId` entry: the resolver would read that as zero uses and apply the benefit
    // every time, turning "one guest pass a month" into an unlimited one.
    const out = benefitAdjustedUnitCents({
      mode: 'fixed',
      listUnitCents: LIST_UNIT_CENTS,
      benefits: capped,
      tierId: 'mt-1',
    })
    expect(out.unitCents).toBe(LIST_UNIT_CENTS)
    expect(out.applied).toBeNull()
  })

  it('spends a CAPPED benefit that is under its cap, and refuses it at the cap', () => {
    const capped = [percentBenefit({ maxUses: 1, period: 'month' })] as unknown as typeof benefits
    const under = benefitAdjustedUnitCents({
      mode: 'fixed',
      listUnitCents: LIST_UNIT_CENTS,
      benefits: capped,
      tierId: 'mt-1',
      usesByBenefitId: { 'ben-1': 0 },
    })
    expect(under.unitCents).toBe(8_500)

    const spent = benefitAdjustedUnitCents({
      mode: 'fixed',
      listUnitCents: LIST_UNIT_CENTS,
      benefits: capped,
      tierId: 'mt-1',
      usesByBenefitId: { 'ben-1': 1 },
    })
    expect(spent.unitCents).toBe(LIST_UNIT_CENTS)
    expect(spent.applied).toBeNull()
  })

  it('needs a membership tier: no tier, no benefit', () => {
    const out = benefitAdjustedUnitCents({
      mode: 'fixed',
      listUnitCents: LIST_UNIT_CENTS,
      benefits,
      tierId: null,
    })
    expect(out.unitCents).toBe(LIST_UNIT_CENTS)
    expect(out.applied).toBeNull()
  })

  it('respects the benefit date window', () => {
    const expired = [
      percentBenefit({ endsAt: '2020-01-01T00:00:00.000Z' }),
    ] as unknown as typeof benefits
    expect(
      benefitAdjustedUnitCents({
        mode: 'fixed',
        listUnitCents: LIST_UNIT_CENTS,
        benefits: expired,
        tierId: 'mt-1',
        now: '2026-09-15T00:00:00.000Z',
      }).unitCents,
    ).toBe(LIST_UNIT_CENTS)
  })
})
