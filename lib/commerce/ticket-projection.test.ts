import { describe, it, expect } from 'vitest'
import { ticketFromPriceCents } from './ticket-projection'

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
