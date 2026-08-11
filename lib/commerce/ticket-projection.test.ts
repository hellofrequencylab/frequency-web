import { describe, it, expect } from 'vitest'
import { ticketFromPriceCents, ticketsSoldOut } from './ticket-projection'

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
