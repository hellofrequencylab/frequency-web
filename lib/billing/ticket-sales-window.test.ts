import { describe, it, expect, beforeEach, vi } from 'vitest'

// THE SALES WINDOW IS ENFORCED AT THE CHECKOUT (ADR-1373, backlog LIVE-352).
//
// `lib/events/sales-window.test.ts` proves the DECISION. This file proves the checkout actually
// asks it, which is the half that silently regresses: a pure module with a perfect test suite and
// no call site is a feature the buyer never meets. The event page's rendering of the same state is
// a hint; this is the gate.
//
// It also pins the COMPOSITION. A window sits beside the ADR-823 admission gate and the ADR-1372
// benefit pricing, and the order between them is a product decision, not an accident: a buyer the
// gate refuses must be told about the membership, never handed a date to come back on, because the
// date is not what is stopping them.
//
// THE DATES, fixed so nothing here depends on the wall clock:
//   event start   2027-03-19 19:00 in the event's own zone (America/Los_Angeles)
//   window        opens 14 days before -> 2027-03-05 18:00 PST (exact elapsed time; see the DST
//                 note in lib/events/sales-window.ts)
// The clock is faked per test rather than derived, so a failure names a date rather than an offset.
//
// The positive control is the row shape every ticket in production has TODAY: three NULL window
// columns. If that ever stops selling, this feature has taken the whole catalog offline.

const LIST_UNIT_CENTS = 2_200

const H = vi.hoisted(() => ({
  created: [] as { line_items: { quantity: number }[] }[],
  tier: {} as Record<string, unknown>,
  membership: null as { tier_id: string } | null,
}))

vi.mock('@/lib/spaces/benefits-store', () => ({
  listBenefitsForTier: () => Promise.resolve([]),
  usesForMember: () => Promise.resolve({}),
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

vi.mock('./fees', () => ({
  platformFeePct: () => 3,
  platformFeeCents: (gross: number) => Math.floor(gross * 0.03),
  memberTakeRateCents: () => Promise.resolve(0),
  resolvedNetworkRate: () =>
    Promise.resolve({
      free: 1000,
      paid: 500,
      nonprofit: 0,
      memberFree: 1000,
      member: 800,
    }),
  spaceTakeRateCents: (grossCents: number) => Promise.resolve(Math.floor((grossCents * 500) / 10_000)),
}))

vi.mock('@/lib/commerce/order-source', () => ({
  classifyOrderSource: () => Promise.resolve({ source: 'network', attributionRef: 'ref-1' }),
}))

vi.mock('@/lib/spaces/store', () => ({
  loadRootSpaceId: () => Promise.resolve('root-space'),
}))

// The event: 7:00 PM on 2027-03-19 in Los Angeles, stored the house way (wall-clock kept as UTC
// parts, read back through the event's own `time_zone`). `ends_at` is the same instant, so the
// checkout's existing "already ended" refusal never fires on any case below.
const EVENT_ROW = {
  id: 'ev-1',
  title: 'Meld',
  slug: 'meld',
  price_cents: null,
  is_cancelled: false,
  ends_at: '2027-03-19T23:00:00Z',
  starts_at: '2027-03-19T19:00:00Z',
  host_id: 'host-1',
  time_zone: 'America/Los_Angeles',
  space_id: 'space-1',
  host_space_id: 'space-1',
}

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
      chain.then = (resolve: (v: unknown) => unknown) => resolve({ data: null, error: null })
      return chain
    },
    rpc: () => Promise.resolve({ data: { reserved: true }, error: null }),
  }),
}))

import { createTicketCheckout } from './tickets'

/** The public Day pass: ungated, fixed price, and open fourteen days out unless told otherwise. */
function dayPass(overrides: Record<string, unknown> = {}) {
  return {
    id: 'tt-1',
    event_id: 'ev-1',
    name: 'Day pass',
    pricing_mode: 'fixed',
    price_cents: LIST_UNIT_CENTS,
    min_cents: null,
    suggested_cents: null,
    quantity: null,
    sold: 0,
    member_only: false,
    space_members_only: false,
    space_tier_id: null,
    sales_start_at: null,
    sales_starts_days_before: null,
    sales_end_at: null,
    active: true,
    ...overrides,
  }
}

function buy() {
  return createTicketCheckout({
    buyerProfileId: 'buyer-1',
    eventId: 'ev-1',
    ticketTypeId: 'tt-1',
    qty: 1,
  })
}

/** Run one purchase with the clock frozen at `iso`. */
async function buyAt(iso: string) {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(iso))
  try {
    return await buy()
  } finally {
    vi.useRealTimers()
  }
}

beforeEach(() => {
  H.created.length = 0
  H.tier = dayPass()
  H.membership = null
})

describe('a ticket outside its sales window is refused at checkout (ADR-1373)', () => {
  it('refuses BEFORE the window opens, and names the moment it does', async () => {
    H.tier = dayPass({ sales_starts_days_before: 14 })

    // A month out. The window opens 2027-03-05 18:00 PST.
    const r = await buyAt('2027-02-19T12:00:00Z')

    expect(r.url).toBeUndefined()
    expect(r.free).toBeUndefined()
    expect(r.error).toBe('This ticket goes on sale Fri, Mar 5 at 6:00 PM PST.')
    // No Stripe session was created for a sale that must not happen.
    expect(H.created).toHaveLength(0)
  })

  it('allows the SAME tier once the window has opened', async () => {
    H.tier = dayPass({ sales_starts_days_before: 14 })

    // Ten days out, comfortably inside the fourteen-day runway.
    const r = await buyAt('2027-03-09T12:00:00Z')

    expect(r.error).toBeUndefined()
    expect(r.url).toBe('https://checkout.stripe.com/c/cs_test_1')
    expect(H.created).toHaveLength(1)
  })

  it('refuses AFTER the window closes', async () => {
    H.tier = dayPass({ sales_end_at: '2027-03-17T00:00:00.000Z' })

    const r = await buyAt('2027-03-18T12:00:00Z')

    expect(r.url).toBeUndefined()
    expect(r.error).toBe('Sales for this ticket are closed.')
    expect(H.created).toHaveLength(0)
  })

  it('POSITIVE CONTROL: a tier with no window is unaffected at every one of those instants', async () => {
    // The row shape of every ticket in production today. If this ever fails, the feature has not
    // added a window, it has removed the catalog.
    for (const at of ['2027-02-19T12:00:00Z', '2027-03-09T12:00:00Z', '2027-03-18T12:00:00Z']) {
      H.created.length = 0
      H.tier = dayPass()
      const r = await buyAt(at)
      expect(r.error).toBeUndefined()
      expect(r.url).toBe('https://checkout.stripe.com/c/cs_test_1')
      expect(H.created).toHaveLength(1)
    }
  })

  it('lets the absolute open time override the relative one at the checkout too', async () => {
    // The per-occurrence override (ADR-1373): opens a fortnight earlier than the series rule says.
    H.tier = dayPass({
      sales_starts_days_before: 14,
      sales_start_at: '2027-02-19T00:00:00.000Z',
    })

    const r = await buyAt('2027-02-19T12:00:00Z')

    expect(r.error).toBeUndefined()
    expect(r.url).toBeTruthy()
  })
})

describe('the window composes with the ADR-823 admission gate rather than replacing it', () => {
  it('refuses an unadmitted buyer on MEMBERSHIP, not on the date', async () => {
    // A members ticket that is also not open yet. The buyer holds no membership, so the honest
    // refusal is the one they can act on. Handing them a date would send them back to the same wall.
    H.tier = dayPass({
      space_members_only: true,
      space_tier_id: 'mt-1',
      sales_starts_days_before: 14,
    })
    H.membership = null

    const r = await buyAt('2027-02-19T12:00:00Z')

    expect(r.error).toContain('Royal Temple')
    expect(r.error).not.toContain('goes on sale')
  })

  it('refuses an ADMITTED member on the date, once the gate has let them through', async () => {
    H.tier = dayPass({
      space_members_only: true,
      space_tier_id: 'mt-1',
      sales_starts_days_before: 14,
    })
    H.membership = { tier_id: 'mt-1' }

    const r = await buyAt('2027-02-19T12:00:00Z')

    expect(r.error).toBe('This ticket goes on sale Fri, Mar 5 at 6:00 PM PST.')
  })

  it('MEMBERS FIRST: the members tier sells while the public tier is still closed', async () => {
    // The whole point of the feature, on one date. Same event, same instant, two rows.
    const membersTier = dayPass({
      space_members_only: true,
      space_tier_id: 'mt-1',
      sales_starts_days_before: 21,
    })
    const publicTier = dayPass({ sales_starts_days_before: 14 })
    const at = '2027-03-01T12:00:00Z' // inside 21 days, outside 14

    H.tier = membersTier
    H.membership = { tier_id: 'mt-1' }
    const forMember = await buyAt(at)
    expect(forMember.error).toBeUndefined()
    expect(forMember.url).toBeTruthy()

    H.tier = publicTier
    H.membership = null
    const forGuest = await buyAt(at)
    expect(forGuest.error).toBe('This ticket goes on sale Fri, Mar 5 at 6:00 PM PST.')
  })
})
