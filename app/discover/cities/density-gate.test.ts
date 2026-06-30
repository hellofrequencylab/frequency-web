import { describe, it, expect } from 'vitest'
import { cityClearsGate, CITY_PAGE_MIN_SCORE } from './_data'
import {
  scorePlace,
  GROWING_SCORE,
  READY_SCORE,
  type DensityCityRow,
} from '@/lib/analytics/density'

// The density gate (GE11-2): a city earns a programmatic landing page (and a
// sitemap URL) only once it clears CITY_PAGE_MIN_SCORE. Thin/empty city pages
// hurt SEO, so a low-density "seed" city must NOT get a page. These tests lock
// that the gate predicate matches the read-model's own stage thresholds.

const row = (over: Partial<DensityCityRow> = {}): DensityCityRow => ({
  city: 'Testville',
  circles: 0,
  active_circles: 0,
  circle_members: 0,
  capacity: 0,
  residents: 0,
  new_residents_30d: 0,
  listings: 0,
  ...over,
})

describe('city density gate', () => {
  it('uses the read-model GROWING_SCORE as the publish threshold', () => {
    // The gate is honest thinness: it mirrors the 'growing' stage boundary, so a
    // city is published exactly when the read-model says it has real momentum.
    expect(CITY_PAGE_MIN_SCORE).toBe(GROWING_SCORE)
  })

  it('keeps an empty "seed" city OUT (no thin page, no sitemap URL)', () => {
    const place = scorePlace(row())
    expect(place.stage).toBe('seed')
    expect(place.score).toBeLessThan(CITY_PAGE_MIN_SCORE)
    expect(cityClearsGate(place)).toBe(false)
  })

  it('publishes a "growing" city (population + momentum, pre-Lab)', () => {
    // Lots of residents arriving fast, even with no circles yet → 'growing'.
    const place = scorePlace(row({ residents: 200, new_residents_30d: 200 }))
    expect(place.stage).toBe('growing')
    expect(place.score).toBeGreaterThanOrEqual(CITY_PAGE_MIN_SCORE)
    expect(place.score).toBeLessThan(READY_SCORE)
    expect(cityClearsGate(place)).toBe(true)
  })

  it('publishes a "ready" (Lab-threshold) city', () => {
    const place = scorePlace(
      row({
        circles: 3,
        active_circles: 3,
        circle_members: 95,
        capacity: 100,
        residents: 120,
        new_residents_30d: 30,
      }),
    )
    expect(place.stage).toBe('ready')
    expect(cityClearsGate(place)).toBe(true)
  })

  it('excludes a city whose normalized name is blank, even above threshold', () => {
    // A high score with no resolvable name can never become a slug, so it must
    // never advertise a page (it would 404 / be a dead sitemap entry).
    expect(cityClearsGate({ score: 100, city: '   ' })).toBe(false)
    expect(cityClearsGate({ score: 100, city: '' })).toBe(false)
  })

  it('treats the exact threshold score as clearing the gate (boundary)', () => {
    expect(cityClearsGate({ score: CITY_PAGE_MIN_SCORE, city: 'Encinitas' })).toBe(true)
    expect(cityClearsGate({ score: CITY_PAGE_MIN_SCORE - 1, city: 'Encinitas' })).toBe(false)
  })
})
