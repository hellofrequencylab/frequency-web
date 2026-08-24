import { describe, it, expect, vi, beforeEach } from 'vitest'

// LIVE-069. The host's "List this event publicly" opt-out (ADR-844) was honoured on the /events
// browse surface and NOWHERE ELSE, so an opted-out ticketed event still surfaced on the Market
// Tickets rail — the exact listing the host had said no to. This file's own docstring claimed it
// returned "listable" events while never applying the rule.
//
// The DB fake below is deliberately minimal: enough PostgREST to answer the four reads the
// projection makes, and it records the events `limit` so the wide-read-then-cap ordering is
// checked too. A filter applied AFTER the limit lets an opted-out event eat a visible card's slot.
const db: { events: Record<string, unknown>[]; tiers: Record<string, unknown>[] } = { events: [], tiers: [] }
const seen: { eventsLimit: number | null } = { eventsLimit: null }

function builder(table: string) {
  const api: Record<string, unknown> = {}
  const self = () => api
  Object.assign(api, {
    select: self,
    eq: self,
    or: self,
    in: self,
    order: self,
    returns: self,
    limit(n: number) {
      // Stays CHAINABLE: the real call is .limit(n).returns<EventRow[]>(), and .returns() is a
      // type-only helper that hands the builder back. A limit() that resolved here would make
      // .returns() throw into the function's own try/catch and every test pass against an empty
      // list — which is exactly what the first draft of this fake did.
      if (table === 'events') seen.eventsLimit = n
      return api
    },
    then(res: (v: { data: unknown[]; error: null }) => unknown) {
      // The tiers read ends in .returns() and is awaited with no .limit(); spaces / profiles
      // resolve straight off .in(...). Each has to answer with ITS OWN table or the projection
      // sees no active tier and returns nothing, which would make these tests pass vacuously.
      const rows = table === 'events' ? db.events : table === 'event_ticket_types' ? db.tiers : []
      return Promise.resolve({ data: rows, error: null }).then(res)
    },
  })
  return api
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (t: string) => builder(t),
    storage: { from: () => ({ getPublicUrl: () => ({ data: { publicUrl: null } }) }) },
  }),
}))
vi.mock('@/lib/events/poster-media', () => ({ posterSignedUrlMap: async () => new Map<string, string>() }))

import { ticketFromPriceCents, ticketsSoldOut, listTicketedEventProjections } from './ticket-projection'

const ev = (over: Record<string, unknown>) => ({
  id: 'e1', slug: 'e1', title: 'An event', description: null, currency: 'usd',
  starts_at: '2099-01-01T00:00:00.000Z', is_demo: false, cover_image_path: null, poster_path: null,
  space_id: null, host_id: null, organizer_name: null, theme: null, ...over,
})
const activeTier = (eventId: string) => ({
  event_id: eventId, pricing_mode: 'fixed', price_cents: 1000, min_cents: null, suggested_cents: null,
})

describe('listTicketedEventProjections honours the market-listing opt-out (LIVE-069)', () => {
  beforeEach(() => {
    db.events = []
    db.tiers = []
    seen.eventsLimit = null
  })

  it('drops an event whose host opted out of public listing', async () => {
    db.events = [ev({ id: 'listed' }), ev({ id: 'opted-out', theme: { marketListed: false } })]
    db.tiers = [activeTier('listed'), activeTier('opted-out')]
    const out = await listTicketedEventProjections()
    expect(out.map((p) => p.id)).toEqual(['event:listed'])
  })

  it('keeps an event that never touched the control, and one that explicitly opted IN', async () => {
    // Listed is the DEFAULT: the key is only written on opt-out, so a null theme must still list.
    db.events = [ev({ id: 'untouched', theme: null }), ev({ id: 'opted-in', theme: { marketListed: true } })]
    db.tiers = [activeTier('untouched'), activeTier('opted-in')]
    const out = await listTicketedEventProjections()
    expect(out.map((p) => p.id).sort()).toEqual(['event:opted-in', 'event:untouched'])
  })

  it('fails OPEN on a malformed theme bag rather than hiding a host’s event', async () => {
    db.events = [ev({ id: 'weird', theme: { marketListed: 'nope' } })]
    db.tiers = [activeTier('weird')]
    expect((await listTicketedEventProjections()).map((p) => p.id)).toEqual(['event:weird'])
  })

  it('reads WIDE so an opted-out event cannot eat a visible card’s slot', async () => {
    db.events = [ev({ id: 'a' })]
    db.tiers = [activeTier('a')]
    await listTicketedEventProjections({ limit: 40 })
    expect(seen.eventsLimit).toBeGreaterThan(40)
  })

  it('still caps the result at the caller’s limit', async () => {
    db.events = Array.from({ length: 10 }, (_, i) => ev({ id: `e${i}`, slug: `e${i}` }))
    db.tiers = db.events.map((e) => activeTier(e.id as string))
    expect((await listTicketedEventProjections({ limit: 3 })).length).toBe(3)
  })
})

// The "from" price is the minimum POSITIVE effective price across a ticketed event's active tiers:
// fixed uses price_cents; buyer-chosen modes (pwyc/sliding_scale/donation) use suggested then min; a
// free tier contributes nothing. All-free / no-priced-tier events read as null ("Free" on the card).
const tier = (over: Partial<Parameters<typeof ticketFromPriceCents>[0][number]> = {}) => ({
  event_id: 'e1',
  pricing_mode: 'fixed',
  price_cents: null,
  min_cents: null,
  suggested_cents: null,
  ...over,
})

describe('ticketFromPriceCents', () => {
  it('returns null for no tiers', () => {
    expect(ticketFromPriceCents([])).toBeNull()
  })

  it('treats a free tier as no price (null)', () => {
    expect(ticketFromPriceCents([tier({ pricing_mode: 'free' })])).toBeNull()
  })

  it('uses a fixed tier price', () => {
    expect(ticketFromPriceCents([tier({ pricing_mode: 'fixed', price_cents: 2000 })])).toBe(2000)
  })

  it('takes the cheapest across fixed tiers', () => {
    expect(
      ticketFromPriceCents([
        tier({ pricing_mode: 'fixed', price_cents: 3000 }),
        tier({ pricing_mode: 'fixed', price_cents: 1500 }),
      ]),
    ).toBe(1500)
  })

  it('prefers suggested then min for buyer-chosen modes', () => {
    expect(ticketFromPriceCents([tier({ pricing_mode: 'pwyc', suggested_cents: 1000, min_cents: 500 })])).toBe(1000)
    expect(ticketFromPriceCents([tier({ pricing_mode: 'sliding_scale', min_cents: 800 })])).toBe(800)
  })

  it('reads a donation with no floor as free (null)', () => {
    expect(ticketFromPriceCents([tier({ pricing_mode: 'donation' })])).toBeNull()
  })

  it('ignores free tiers when a paid tier exists', () => {
    expect(
      ticketFromPriceCents([tier({ pricing_mode: 'free' }), tier({ pricing_mode: 'fixed', price_cents: 2500 })]),
    ).toBe(2500)
  })
})

// Sold-out is the availability half of the same tier authority. It exists because the event page
// rendered "Sold out." while its own schema.org Offer published InStock — the one outright
// page-vs-schema contradiction the fan-out audit found, on the entity type answer engines quote
// most. The stakes are asymmetric: a WRONG SoldOut suppresses the rich result's ticket action
// entirely, so every ambiguous input below must resolve to `false`.
const stock = (quantity: number | null, sold: number | null = 0) => ({ quantity, sold })

describe('ticketsSoldOut', () => {
  it('is false for no active tiers', () => {
    // An untiered event is not "sold out", it is un-ticketed — its capacity lives on
    // events.capacity and only a caller holding the RSVP count can speak to it.
    expect(ticketsSoldOut([])).toBe(false)
  })

  it('is false while an uncapped tier exists, however many capped ones ran out', () => {
    // quantity === null is UNLIMITED in event_ticket_types, NOT zero. Reading null as 0 would
    // publish SoldOut for the common uncapped case, which is the expensive direction to be wrong.
    expect(ticketsSoldOut([stock(null, 0)])).toBe(false)
    expect(ticketsSoldOut([stock(null, 9999)])).toBe(false)
    expect(ticketsSoldOut([stock(10, 10), stock(null, 500)])).toBe(false)
  })

  it('is false while any capped tier has stock left', () => {
    expect(ticketsSoldOut([stock(10, 3)])).toBe(false)
    expect(ticketsSoldOut([stock(10, 10), stock(5, 4)])).toBe(false)
  })

  it('is true only when every capped tier is exhausted', () => {
    expect(ticketsSoldOut([stock(10, 10)])).toBe(true)
    expect(ticketsSoldOut([stock(10, 10), stock(5, 5)])).toBe(true)
  })

  it('treats an oversold tier as exhausted rather than flipping back to available', () => {
    // `sold > quantity` is reachable through a refund/adjust race; `>=` keeps it sold out, where
    // a `===` comparison would report the event buyable again at the worst possible moment.
    expect(ticketsSoldOut([stock(10, 12)])).toBe(true)
  })

  it('reads a null sold as zero sold, not as unknown', () => {
    // `sold` is NOT NULL in the schema; the coercion is for callers holding a partial projection,
    // and it must mean "none sold" — the same reading app/(main)/events/[slug] uses for its badges.
    expect(ticketsSoldOut([stock(10, null)])).toBe(false)
    expect(ticketsSoldOut([stock(0, null)])).toBe(true)
  })
})
