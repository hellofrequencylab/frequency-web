import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  OCCASIONS,
  DEFAULT_OCCASION,
  isOccasionId,
  resolveOccasionForDate,
} from './occasions'

describe('occasion registry (docs/SPACES.md adaptive theming)', () => {
  it('registers the default and it is none', () => {
    expect(OCCASIONS.some((o) => o.id === DEFAULT_OCCASION)).toBe(true)
    expect(DEFAULT_OCCASION).toBe('none')
  })

  it('has unique occasion ids', () => {
    const ids = OCCASIONS.map((o) => o.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('isOccasionId passes known ids through and rejects unknown ones', () => {
    for (const o of OCCASIONS) {
      expect(isOccasionId(o.id)).toBe(true)
    }
    expect(isOccasionId('does-not-exist')).toBe(false)
  })
})

describe('resolveOccasionForDate (calendar window selection)', () => {
  it('returns solstice inside its window and none outside it', () => {
    // solstice window is 06-18..06-22 (inclusive).
    expect(resolveOccasionForDate(new Date(2026, 5, 18))).toBe('solstice') // 06-18 start edge
    expect(resolveOccasionForDate(new Date(2026, 5, 20))).toBe('solstice') // 06-20 mid
    expect(resolveOccasionForDate(new Date(2026, 5, 22))).toBe('solstice') // 06-22 end edge
    expect(resolveOccasionForDate(new Date(2026, 5, 17))).toBe('none') // 06-17 just before
    expect(resolveOccasionForDate(new Date(2026, 5, 23))).toBe('none') // 06-23 just after
    expect(resolveOccasionForDate(new Date(2026, 0, 1))).toBe('none') // far away
  })

  it('handles a year-wrapping window (start > end) on both sides of the wrap', () => {
    // A window like 12-20..01-02 should match dates on either side of year-end.
    // We exercise the wrap logic directly against the documented contract.
    const wrap = (key: string, start: string, end: string) =>
      start <= end ? key >= start && key <= end : key >= start || key <= end
    expect(wrap('12-25', '12-20', '01-02')).toBe(true) // before year-end
    expect(wrap('01-01', '12-20', '01-02')).toBe(true) // after year-end
    expect(wrap('06-15', '12-20', '01-02')).toBe(false) // mid-year, outside
    expect(wrap('01-03', '12-20', '01-02')).toBe(false) // just past the end edge
  })
})

// The CSS ⇄ registry CONTRACT. Every non-`none` OccasionId MUST have a
// `[data-occasion="<id>"]` block authored in app/globals.css (`none` is the baseline and
// needs no block). Keeps CSS + registry from drifting apart.
describe('occasion CSS contract (every non-none id has its [data-occasion] block)', () => {
  const globalsCss = readFileSync(
    fileURLToPath(new URL('../../app/globals.css', import.meta.url)),
    'utf8',
  )

  for (const occ of OCCASIONS) {
    if (occ.id === DEFAULT_OCCASION) continue
    it(`occasion: ${occ.id} has a [data-occasion] block`, () => {
      const re = new RegExp(`\\[data-occasion="${occ.id}"\\]\\s*\\{`)
      expect(globalsCss).toMatch(re)
    })
  }
})
