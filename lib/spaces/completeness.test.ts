import { describe, it, expect } from 'vitest'
import { scoreProfileCompleteness } from './completeness'

// PROFILE COMPLETENESS / SEARCH-READINESS scorer contract: a PURE, total scorer over the already-
// resolved SEO-relevant fields. Every tracked field is weighted equally; the score is a whole percent;
// the checklist + missing subset always reflect exactly what is / isn't filled. Fail-safe on missing
// inputs (they count as not-done, never throw).

// The eight fields the scorer tracks — kept in lock-step with lib/spaces/completeness.ts so a change
// to the tracked set trips a test.
const TOTAL = 8

describe('scoreProfileCompleteness', () => {
  it('scores an empty profile as 0 with every item missing', () => {
    const r = scoreProfileCompleteness({})
    expect(r.score).toBe(0)
    expect(r.done).toBe(0)
    expect(r.total).toBe(TOTAL)
    expect(r.items).toHaveLength(TOTAL)
    expect(r.missing).toHaveLength(TOTAL)
    // Every item is not-done.
    expect(r.items.every((i) => i.done === false)).toBe(true)
  })

  it('scores a fully filled profile as 100 with no missing items', () => {
    const r = scoreProfileCompleteness({
      brandName: 'Still Waters Studio',
      tagline: 'Breathwork and sound baths in Austin',
      about: 'A calm room for weekly practice.',
      logoUrl: 'https://example.com/logo.png',
      coverUrl: 'https://example.com/cover.jpg',
      offeringsCount: 3,
      reviewCount: 12,
      socialCount: 2,
    })
    expect(r.score).toBe(100)
    expect(r.done).toBe(TOTAL)
    expect(r.missing).toHaveLength(0)
    expect(r.items.every((i) => i.done)).toBe(true)
  })

  it('treats blank / whitespace strings as not set', () => {
    const r = scoreProfileCompleteness({
      brandName: '   ',
      tagline: '',
      about: '\n\t',
      logoUrl: '  ',
    })
    expect(r.done).toBe(0)
    expect(r.score).toBe(0)
  })

  it('rounds the percentage to a whole number (half the fields = ~50)', () => {
    const r = scoreProfileCompleteness({
      brandName: 'Name',
      tagline: 'A line',
      about: 'A story',
      logoUrl: 'https://example.com/l.png',
      // the remaining four fields are missing
    })
    expect(r.done).toBe(4)
    expect(r.score).toBe(50)
  })

  it('treats zero / negative / NaN counts as not met, positive counts as met', () => {
    const zero = scoreProfileCompleteness({ offeringsCount: 0, reviewCount: 0, socialCount: 0 })
    expect(zero.items.find((i) => i.key === 'offering')?.done).toBe(false)
    expect(zero.items.find((i) => i.key === 'review')?.done).toBe(false)
    expect(zero.items.find((i) => i.key === 'socials')?.done).toBe(false)

    const bad = scoreProfileCompleteness({ offeringsCount: -1, reviewCount: Number.NaN })
    expect(bad.items.find((i) => i.key === 'offering')?.done).toBe(false)
    expect(bad.items.find((i) => i.key === 'review')?.done).toBe(false)

    const good = scoreProfileCompleteness({ offeringsCount: 1, reviewCount: 5, socialCount: 1 })
    expect(good.items.find((i) => i.key === 'offering')?.done).toBe(true)
    expect(good.items.find((i) => i.key === 'review')?.done).toBe(true)
    expect(good.items.find((i) => i.key === 'socials')?.done).toBe(true)
  })

  it('missing is exactly the not-done items, in checklist order', () => {
    const r = scoreProfileCompleteness({ brandName: 'Name', reviewCount: 3 })
    expect(r.missing.every((i) => !i.done)).toBe(true)
    // missing preserves the order items appear in the full checklist
    const missingKeys = r.missing.map((i) => i.key)
    const orderedKeys = r.items.filter((i) => !i.done).map((i) => i.key)
    expect(missingKeys).toEqual(orderedKeys)
    // brandName + reviewCount are filled, so they are NOT in missing
    expect(missingKeys).not.toContain('brandName')
    expect(missingKeys).not.toContain('review')
  })

  it('every item carries a stable key, a label and a hint', () => {
    const r = scoreProfileCompleteness({})
    for (const item of r.items) {
      expect(item.key.length).toBeGreaterThan(0)
      expect(item.label.length).toBeGreaterThan(0)
      expect(item.hint.length).toBeGreaterThan(0)
    }
    // keys are unique
    const keys = r.items.map((i) => i.key)
    expect(new Set(keys).size).toBe(keys.length)
  })
})
