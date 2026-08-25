import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import {
  chunkIds,
  normalizeEventIds,
  tierPricedCents,
  summarizeTierRows,
  foldSummaryRows,
  priceLabelFromSummary,
  usd,
  TIER_ID_CHUNK,
  type TierPriceRow,
} from './tier-prices'

const row = (o: Partial<TierPriceRow> & { event_id: string }): TierPriceRow => ({
  pricing_mode: 'fixed',
  price_cents: null,
  min_cents: null,
  suggested_cents: null,
  ...o,
})

describe('tierPricedCents — one tier’s contribution to the floor', () => {
  it('ignores a free tier entirely, whatever amounts it carries', () => {
    expect(tierPricedCents(row({ event_id: 'e', pricing_mode: 'free', price_cents: 500 }))).toBeNull()
  })
  it('prefers price, then min, then suggested', () => {
    expect(tierPricedCents(row({ event_id: 'e', price_cents: 300, min_cents: 100 }))).toBe(300)
    expect(tierPricedCents(row({ event_id: 'e', min_cents: 100, suggested_cents: 900 }))).toBe(100)
    expect(tierPricedCents(row({ event_id: 'e', suggested_cents: 900 }))).toBe(900)
  })
  it('treats a zero or missing amount as no floor, not as $0', () => {
    expect(tierPricedCents(row({ event_id: 'e', price_cents: 0 }))).toBeNull()
    expect(tierPricedCents(row({ event_id: 'e' }))).toBeNull()
  })
})

describe('summarizeTierRows', () => {
  it('counts tiers per event and keeps the cheapest PRICED one', () => {
    const s = summarizeTierRows([
      row({ event_id: 'a', price_cents: 2500 }),
      row({ event_id: 'a', pricing_mode: 'sliding_scale', min_cents: 1000 }),
      row({ event_id: 'b', price_cents: 700 }),
    ])
    expect(s.a).toEqual({ tierCount: 2, minPricedCents: 1000, hasFlexible: true })
    expect(s.b).toEqual({ tierCount: 1, minPricedCents: 700, hasFlexible: false })
  })

  it('distinguishes "tiers, all free" (null floor) from "no tiers" (absent)', () => {
    const s = summarizeTierRows([row({ event_id: 'a', pricing_mode: 'free' })])
    expect(s.a).toEqual({ tierCount: 1, minPricedCents: null, hasFlexible: true })
    expect(s.zzz).toBeUndefined()
  })

  it('drops rows with no event_id rather than bucketing them together', () => {
    expect(summarizeTierRows([row({ event_id: '  ', price_cents: 1 })])).toEqual({})
  })
})

describe('foldSummaryRows — the RPC path', () => {
  it('produces the SAME shape summarizeTierRows does for the same event', () => {
    const raw = summarizeTierRows([
      row({ event_id: 'a', price_cents: 2500 }),
      row({ event_id: 'a', pricing_mode: 'sliding_scale', min_cents: 1000 }),
    ])
    const rpc = foldSummaryRows([
      { event_id: 'a', tier_count: 2, min_priced_cents: 1000, has_flexible: true },
    ])
    expect(rpc).toEqual(raw)
  })

  it('refuses a row that claims fewer than one tier — it must not invent an event', () => {
    expect(foldSummaryRows([{ event_id: 'a', tier_count: 0, min_priced_cents: 5, has_flexible: false }])).toEqual({})
    expect(foldSummaryRows([{ event_id: 'a', tier_count: null, min_priced_cents: 5, has_flexible: false }])).toEqual({})
  })

  it('reads a null/zero floor as "all free" rather than as $0', () => {
    expect(foldSummaryRows([{ event_id: 'a', tier_count: 1, min_priced_cents: null, has_flexible: true }]).a)
      .toEqual({ tierCount: 1, minPricedCents: null, hasFlexible: true })
    expect(foldSummaryRows([{ event_id: 'a', tier_count: 1, min_priced_cents: 0, has_flexible: false }]).a?.minPricedCents)
      .toBeNull()
  })
})

describe('priceLabelFromSummary', () => {
  it('falls back to the flat price when the event has no tiers', () => {
    expect(priceLabelFromSummary(2000, undefined)).toBe('$20')
    expect(priceLabelFromSummary(null, undefined)).toBe('Free')
    expect(priceLabelFromSummary(0, undefined)).toBe('Free')
  })
  it('says Free for tiers that all cost nothing, even when a flat price is set', () => {
    expect(priceLabelFromSummary(9900, { tierCount: 1, minPricedCents: null, hasFlexible: false })).toBe('Free')
  })
  it('says a bare price for exactly one fixed tier, and From for a choice or a floor', () => {
    expect(priceLabelFromSummary(null, { tierCount: 1, minPricedCents: 2000, hasFlexible: false })).toBe('$20')
    expect(priceLabelFromSummary(null, { tierCount: 2, minPricedCents: 2000, hasFlexible: false })).toBe('From $20')
    expect(priceLabelFromSummary(null, { tierCount: 1, minPricedCents: 2000, hasFlexible: true })).toBe('From $20')
  })
  it('shows cents only when they are non-zero (brand voice: no trailing .00)', () => {
    expect(usd(2000)).toBe('$20')
    expect(usd(2050)).toBe('$20.50')
  })
})

// 🔴 THE ANTI-REGRESSION ORACLE. This is `eventPriceLabel` EXACTLY as it stood before SCAN-211 —
// the function both card surfaces used to call, preserved here verbatim as the reference. It is
// deliberately NOT imported from the app: the point is to pin the new implementation against the
// OLD behaviour, so a copy that can no longer be edited in step is the whole value. If a future
// change to the summary path alters a label, one of these cases goes red and names the case.
function legacyEventPriceLabel(flatCents: number | null, tiers: TierPriceRow[]): string {
  if (tiers.length > 0) {
    const priced = tiers
      .map((t) => (t.pricing_mode === 'free' ? 0 : t.price_cents ?? t.min_cents ?? t.suggested_cents ?? 0))
      .filter((c): c is number => typeof c === 'number' && c > 0)
    if (priced.length === 0) return 'Free'
    const min = Math.min(...priced)
    const isFloor = tiers.length > 1 || tiers.some((t) => t.pricing_mode !== 'fixed')
    return isFloor ? `From ${usd(min)}` : usd(min)
  }
  return flatCents && flatCents > 0 ? usd(flatCents) : 'Free'
}

describe('the new path reproduces the retired one, case by case', () => {
  const cases: { name: string; flat: number | null; tiers: TierPriceRow[] }[] = [
    { name: 'no tiers, flat price', flat: 1500, tiers: [] },
    { name: 'no tiers, no price', flat: null, tiers: [] },
    { name: 'one fixed tier', flat: null, tiers: [row({ event_id: 'x', price_cents: 2000 })] },
    { name: 'two fixed tiers', flat: null, tiers: [row({ event_id: 'x', price_cents: 2000 }), row({ event_id: 'x', price_cents: 3500 })] },
    { name: 'one sliding tier', flat: null, tiers: [row({ event_id: 'x', pricing_mode: 'sliding_scale', min_cents: 1000 })] },
    { name: 'one donation tier, no amount', flat: null, tiers: [row({ event_id: 'x', pricing_mode: 'donation' })] },
    { name: 'all-free tiers over a flat price', flat: 5000, tiers: [row({ event_id: 'x', pricing_mode: 'free' })] },
    { name: 'pwyc with a suggested amount', flat: null, tiers: [row({ event_id: 'x', pricing_mode: 'pwyc', suggested_cents: 1250 })] },
  ]
  it.each(cases)('$name', ({ flat, tiers }) => {
    const viaSummary = priceLabelFromSummary(flat, summarizeTierRows(tiers)['x'])
    expect(viaSummary).toBe(legacyEventPriceLabel(flat, tiers))
  })
})

describe('the id plumbing cannot let a response reach max_rows', () => {
  it('chunks well under PostgREST’s 1,000-row cap', () => {
    expect(TIER_ID_CHUNK).toBeLessThan(1000)
    expect(chunkIds(Array.from({ length: 1201 }, (_, i) => `id-${i}`)).map((c) => c.length))
      .toEqual([500, 500, 201])
  })
  it('de-duplicates and trims ids, preserving order', () => {
    expect(normalizeEventIds([' a ', 'a', null, '', 'b', undefined])).toEqual(['a', 'b'])
  })
})

// The listing must not go back to reading raw tiers: that read is what could truncate, and nothing
// about a raw `.in()` announces when it does. A source-shape arm, because no unit test can observe
// a server-side cap.
describe('no surface reads raw tiers any more', () => {
  const LISTING = readFileSync(path.join(__dirname, '../../app/(main)/events/index-data.ts'), 'utf8')
  const SPACE = readFileSync(path.join(__dirname, '../spaces/content-data.ts'), 'utf8')

  it('the /events listing calls tierSummariesByEvent and never selects event_ticket_types', () => {
    expect(LISTING).toContain('tierSummariesByEvent(eventIds)')
    expect(LISTING).not.toMatch(/from\(['"]event_ticket_types['"]\)/)
  })

  it('the Space card does the same — it was the second instance of the shape', () => {
    expect(SPACE).toContain('tierSummariesByEvent(ids)')
    expect(SPACE).not.toMatch(/from\(['"]event_ticket_types['"]\)/)
  })

  it('both still resolve a label (the read was removed, not the feature)', () => {
    expect(LISTING).toContain('priceLabelFromSummary(e.price_cents, tierSummaries[e.id])')
    expect(SPACE).toContain('priceLabelFromSummary(e.price_cents ?? null, tierSummaries[e.id])')
  })

  // The helper is the only place allowed to touch the table, and it must PAGE when it does.
  it('the helper pages its fallback read rather than issuing one unbounded .in()', () => {
    const HELPER = readFileSync(path.join(__dirname, 'tier-prices.ts'), 'utf8')
    expect(HELPER).toContain('.range(fetched, fetched + TIER_PAGE - 1)')
    expect(HELPER).toContain(".order('id', { ascending: true })")
  })
})
