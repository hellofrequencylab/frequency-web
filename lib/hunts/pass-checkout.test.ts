import { beforeEach, describe, expect, it, vi } from 'vitest'

// THE EXPERIENCE PASS THROUGH THE REAL TICKET CHECKOUT (FH-036S).
//
// lib/hunts/pass-binding.test.ts proves the decision. This file proves the checkout asks it: every case
// below goes through `createTicketCheckout` itself, with only Stripe, Connect, fees and the database
// faked. A wrong tier and a closed sales switch are refused before any Stripe session exists. A forged
// price never reaches Stripe or the stored snapshot, and a ticket that settles for an amount its snapshot
// does not name projects nothing. The control is an ordinary tier, which must sell with no snapshot at all.

const H = vi.hoisted(() => ({
  created: [] as { line_items: { quantity: number; price_data: { unit_amount: number } }[] }[],
  expired: [] as string[],
  tier: {} as Record<string, unknown>,
  bindings: [] as Record<string, unknown>[],
  salesOpen: true,
  updates: [] as { table: string; values: Record<string, unknown>; filters: Record<string, unknown> }[],
  storeFails: false,
}))

vi.mock('@/lib/spaces/benefits-store', () => ({
  listBenefitsForTier: () => Promise.resolve([]),
  usesForMember: () => Promise.resolve({}),
  recordRedemption: () => Promise.resolve(),
}))
vi.mock('@/lib/billing/stripe', () => ({
  appUrl: () => 'https://frequencylocal.com',
  stripe: {
    checkout: {
      sessions: {
        create: (args: (typeof H.created)[number]) => {
          H.created.push(args)
          return Promise.resolve({ id: 'cs_test_1', url: 'https://checkout.stripe.com/c/cs_test_1' })
        },
        expire: (id: string) => {
          H.expired.push(id)
          return Promise.resolve({})
        },
      },
    },
  },
}))
vi.mock('@/lib/billing/connect', () => ({
  payoutsLive: () => Promise.resolve(true),
  getConnectStatus: () => Promise.resolve({ accountId: 'acct_host', ready: true }),
}))
vi.mock('@/lib/billing/fees', () => ({
  platformFeePct: () => 3,
  platformFeeCents: (gross: number) => Math.floor(gross * 0.03),
  memberTakeRateCents: () => Promise.resolve(0),
  resolvedNetworkRate: () => Promise.resolve({ free: 1000, paid: 500, nonprofit: 0, memberFree: 1000, member: 800 }),
  spaceTakeRateCents: (grossCents: number) => Promise.resolve(Math.floor((grossCents * 500) / 10_000)),
  spaceNetworkBps: async () => 500,
}))
vi.mock('@/lib/commerce/order-source', () => ({
  classifyOrderSource: () => Promise.resolve({ source: 'network', attributionRef: 'ref-1' }),
}))
vi.mock('@/lib/spaces/store', () => ({ loadRootSpaceId: () => Promise.resolve('root-space') }))

const EVENT_ROW = {
  id: 'ev-1', title: 'Progressive dinner', slug: 'progressive-dinner', price_cents: null, is_cancelled: false,
  ends_at: '2099-03-19T23:00:00Z', starts_at: '2099-03-19T19:00:00Z', host_id: 'host-1',
  time_zone: 'America/Los_Angeles', space_id: 'space-1', host_space_id: 'space-1',
}

function rowsFor(table: string): Record<string, unknown>[] {
  switch (table) {
    case 'events': return [EVENT_ROW]
    case 'spaces': return [{ id: 'space-1', owner_profile_id: 'owner-1', name: 'Royal Temple', brand_name: null, plan: 'business', network_connected: true, slug: 'royal-temple' }]
    case 'event_ticket_types': return [H.tier]
    case 'profiles': return [{ membership_tier: 'crew' }]
    case 'hunt_pass_bindings': return H.bindings
    case 'hunt_commerce_state': return [{ id: true, sales_open: H.salesOpen }]
    default: return []
  }
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      let rows = rowsFor(table)
      let update: Record<string, unknown> | null = null
      const filters: Record<string, unknown> = {}
      const done = () => {
        if (!update) return { data: null, error: null }
        H.updates.push({ table, values: update, filters })
        if ('hunt_pass' in update && H.storeFails) return { data: null, error: { message: 'column "hunt_pass" does not exist' } }
        return { data: [{ id: 'tk-1' }], error: null }
      }
      const chain: Record<string, unknown> = {}
      chain.select = () => chain
      chain.update = (values: Record<string, unknown>) => { update = values; return chain }
      chain.eq = (col: string, val: unknown) => {
        filters[col] = val
        // Only the Hunt tables are filtered for real: the rest answer as the canonical harness does.
        if (table.startsWith('hunt_')) rows = rows.filter((r) => r[col] === val)
        return chain
      }
      chain.maybeSingle = () => Promise.resolve({ data: rows[0] ?? null, error: null })
      chain.then = (resolve: (v: unknown) => unknown) => resolve(done())
      return chain
    },
    rpc: () => Promise.resolve({ data: { reserved: true }, error: null }),
  }),
}))

import { createTicketCheckout } from '@/lib/billing/tickets'
import { parseStoredPurchase, verifySettledPurchase, type PassBinding } from './pass-binding'
import { passPurchaseRecord } from './pass-checkout'

const PRICE = 4_500

function passTier(overrides: Record<string, unknown> = {}) {
  return {
    id: 'tt-1', event_id: 'ev-1', name: 'Dinner pass', pricing_mode: 'fixed', price_cents: PRICE, min_cents: null,
    suggested_cents: null, quantity: null, sold: 0, member_only: false, space_members_only: false, space_tier_id: null,
    sales_start_at: null, sales_starts_days_before: null, sales_end_at: null, active: true, ...overrides,
  }
}
const bindingRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'b1', hunt_id: 'h1', version_id: 'v1', event_id: 'ev-1', ticket_type_id: 'tt-1', seller_space_id: 'space-1',
  benefit_codes: ['tasting', 'dessert'], revision: 1, status: 'active', ...overrides,
})
const BINDING: PassBinding = {
  id: 'b1', huntId: 'h1', versionId: 'v1', eventId: 'ev-1', ticketTypeId: 'tt-1', sellerSpaceId: 'space-1',
  benefitCodes: ['tasting', 'dessert'], revision: 1, status: 'active',
}

const buy = (extra: Record<string, unknown> = {}) =>
  createTicketCheckout({ buyerProfileId: 'buyer-1', eventId: 'ev-1', ticketTypeId: 'tt-1', qty: 2, ...extra })
const snapshotWrites = () => H.updates.filter((u) => u.table === 'event_tickets' && 'hunt_pass' in u.values)

beforeEach(() => {
  H.created.length = 0
  H.expired.length = 0
  H.updates.length = 0
  H.tier = passTier()
  H.bindings = [bindingRow()]
  H.salesOpen = true
  H.storeFails = false
  vi.stubEnv('HUNTS_ENABLED', '1')
  vi.stubEnv('HUNTS_COMMERCE_ENABLED', '1')
})

describe('a pass bought through the real ticket checkout stores its purchase snapshot', () => {
  it('sells at the canonical price and writes the frozen binding onto the reserved ticket', async () => {
    const r = await buy()
    expect(r.error).toBeUndefined()
    expect(r.url).toContain('cs_test_1')
    expect(H.created[0].line_items[0]).toMatchObject({ quantity: 2, price_data: { unit_amount: PRICE } })
    const [write] = snapshotWrites()
    expect(write.filters).toEqual({ stripe_checkout_session_id: 'cs_test_1', status: 'pending' })
    expect(write.values.hunt_pass).toEqual({
      v: 1,
      snapshot: { bindingId: 'b1', bindingRevision: 1, huntId: 'h1', versionId: 'v1', sellerSpaceId: 'space-1', benefitCodes: ['dessert', 'tasting'] },
      eventId: 'ev-1', ticketTypeId: 'tt-1', qty: 2, unitCents: PRICE, totalCents: 2 * PRICE, chargedCents: 2 * PRICE, currency: 'USD',
    })
    // What was stored reads back, and matches the ticket that settles for the same amount.
    const stored = parseStoredPurchase(write.values.hunt_pass)
    expect(stored && verifySettledPurchase(stored, { eventId: 'ev-1', ticketTypeId: 'tt-1', qty: 2, amountCents: 2 * PRICE, currency: 'usd' }, BINDING)).toEqual({ ok: true })
  })

  it('a forged price never reaches Stripe or the snapshot, and a ticket settled at a forged amount is refused', async () => {
    const r = await buy({ amountCents: 1 })
    expect(r.error).toBeUndefined()
    expect(H.created[0].line_items[0].price_data.unit_amount).toBe(PRICE)
    const stored = parseStoredPurchase(snapshotWrites()[0].values.hunt_pass)
    expect(stored).toMatchObject({ unitCents: PRICE, chargedCents: 2 * PRICE })
    expect(stored && verifySettledPurchase(stored, { eventId: 'ev-1', ticketTypeId: 'tt-1', qty: 2, amountCents: 2, currency: 'usd' }, BINDING))
      .toEqual({ ok: false, reason: 'price_mismatch' })
  })

  it('refuses the wrong tier before any Stripe session is created', async () => {
    // The tier is bound, but to a different Event than the one this checkout asked for.
    H.bindings = [bindingRow({ event_id: 'ev-other' })]
    const r = await buy()
    expect(r).toEqual({ error: 'That ticket type isn’t available.' })
    expect(H.created).toEqual([])
    expect(snapshotWrites()).toEqual([])
  })

  it('refuses a tier that is no longer a fixed-price ticket', async () => {
    H.tier = passTier({ pricing_mode: 'pwyc', price_cents: null, min_cents: 100 })
    const r = await buy({ amountCents: 100 })
    expect(r).toEqual({ error: 'That ticket type isn’t available.' })
    expect(H.created).toEqual([])
  })

  it('refuses while the sales switch is closed, and sells again once it reopens', async () => {
    H.salesOpen = false
    expect(await buy()).toEqual({ error: 'This pass is not on sale right now.' })
    expect(H.created).toEqual([])
    H.salesOpen = true
    expect((await buy()).error).toBeUndefined()
    expect(H.created).toHaveLength(1)
  })

  it('does not sell a pass whose snapshot could not be stored: the session is expired', async () => {
    H.storeFails = true
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {})
    const r = await buy()
    quiet.mockRestore()
    expect(r).toEqual({ error: 'Could not start checkout. Please try again.' })
    expect(H.expired).toEqual(['cs_test_1'])
  })

  it('an ordinary tier sells with no snapshot, and so does every tier while the switch is off', async () => {
    H.bindings = []
    expect((await buy()).error).toBeUndefined()
    expect(snapshotWrites()).toEqual([])

    H.bindings = [bindingRow()]
    H.salesOpen = false
    vi.stubEnv('HUNTS_COMMERCE_ENABLED', '')
    expect((await buy()).error).toBeUndefined()
    expect(snapshotWrites()).toEqual([])
    expect(H.created).toHaveLength(2)
  })
})

describe('the stored snapshot at settlement', () => {
  const resolved = { ok: true as const, unitCents: PRICE, qty: 2, totalCents: 2 * PRICE, currency: 'USD', snapshot: { bindingId: 'b1', bindingRevision: 1, huntId: 'h1', versionId: 'v1', sellerSpaceId: 'space-1', benefitCodes: ['dessert', 'tasting'] } }
  const stored = passPurchaseRecord({ eventId: 'ev-1', ticketTypeId: 'tt-1', resolved }, 2 * PRICE)
  const settled = { eventId: 'ev-1', ticketTypeId: 'tt-1', qty: 2, amountCents: 2 * PRICE, currency: 'usd' }

  it('accepts a member discount, because the charge is recorded beside the canonical price', () => {
    const discounted = passPurchaseRecord({ eventId: 'ev-1', ticketTypeId: 'tt-1', resolved }, 8_000)
    expect(verifySettledPurchase(discounted, { ...settled, amountCents: 8_000 }, BINDING)).toEqual({ ok: true })
    expect(verifySettledPurchase(discounted, settled, BINDING)).toEqual({ ok: false, reason: 'price_mismatch' })
  })

  it('refuses a different tier, Event, quantity, currency or binding', () => {
    expect(verifySettledPurchase(stored, { ...settled, ticketTypeId: 'tt-2' }, BINDING)).toEqual({ ok: false, reason: 'tier_mismatch' })
    expect(verifySettledPurchase(stored, { ...settled, eventId: 'ev-2' }, BINDING)).toEqual({ ok: false, reason: 'event_mismatch' })
    expect(verifySettledPurchase(stored, { ...settled, qty: 1 }, BINDING)).toEqual({ ok: false, reason: 'quantity_mismatch' })
    expect(verifySettledPurchase(stored, { ...settled, currency: 'eur' }, BINDING)).toEqual({ ok: false, reason: 'currency_mismatch' })
    expect(verifySettledPurchase(stored, settled, { ...BINDING, revision: 2 })).toEqual({ ok: false, reason: 'binding_changed' })
    expect(verifySettledPurchase(stored, settled, null)).toEqual({ ok: false, reason: 'binding_changed' })
  })

  it('reads nothing from a value that is not a snapshot', () => {
    for (const bad of [null, 'x', [], {}, { ...stored, v: 2 }, { ...stored, qty: '2' }, { ...stored, snapshot: { ...stored.snapshot, benefitCodes: ['NOT A CODE'] } }]) {
      expect(parseStoredPurchase(bad)).toBeNull()
    }
    expect(parseStoredPurchase(JSON.parse(JSON.stringify(stored)))).toEqual(stored)
  })
})
