import { describe, it, expect } from 'vitest'
import {
  COMMERCE_CATEGORIES,
  CATEGORY_VALUES,
  isValidCategory,
  categoryLabel,
  normalizeCategory,
  normalizeTags,
} from './categories'

describe('commerce category taxonomy', () => {
  it('exposes a non-empty, ordered top-level set', () => {
    expect(COMMERCE_CATEGORIES.length).toBeGreaterThan(4)
    expect(COMMERCE_CATEGORIES[0].value).toBe('Handmade')
    expect(COMMERCE_CATEGORIES.at(-1)!.value).toBe('Other')
  })

  it('flattens groups + subcategories into CATEGORY_VALUES with no duplicates', () => {
    const set = new Set(CATEGORY_VALUES)
    expect(set.size).toBe(CATEGORY_VALUES.length)
    expect(CATEGORY_VALUES).toContain('Wellness')
    expect(CATEGORY_VALUES).toContain('Ceramics & Pottery')
  })

  it('has no em or en dashes in any label (voice canon)', () => {
    for (const v of CATEGORY_VALUES) {
      expect(v).not.toMatch(/[–—]/)
    }
  })
})

describe('isValidCategory', () => {
  it('accepts taxonomy values (group + subcategory)', () => {
    expect(isValidCategory('Handmade')).toBe(true)
    expect(isValidCategory('Jewelry')).toBe(true)
  })

  it('rejects blanks and unknown values', () => {
    expect(isValidCategory(null)).toBe(false)
    expect(isValidCategory('')).toBe(false)
    expect(isValidCategory('Nonsense')).toBe(false)
  })
})

describe('categoryLabel', () => {
  it('returns the value for a taxonomy entry and a legacy free-text value alike', () => {
    expect(categoryLabel('Wellness')).toBe('Wellness')
    expect(categoryLabel('Ceramics')).toBe('Ceramics') // legacy free text passes through
  })

  it('returns null for blank', () => {
    expect(categoryLabel(null)).toBeNull()
    expect(categoryLabel('   ')).toBeNull()
  })
})

describe('normalizeCategory', () => {
  it('trims, caps length, and collapses blank to null', () => {
    expect(normalizeCategory('  Handmade  ')).toBe('Handmade')
    expect(normalizeCategory('')).toBeNull()
    expect(normalizeCategory('x'.repeat(100))!.length).toBe(60)
  })
})

describe('normalizeTags', () => {
  it('splits a comma string, trims, and drops blanks', () => {
    expect(normalizeTags('ceramic, , handmade ,mug')).toEqual(['ceramic', 'handmade', 'mug'])
  })

  it('accepts an array and de-dups case-insensitively keeping first casing', () => {
    expect(normalizeTags(['Mug', 'mug', 'MUG', 'cup'])).toEqual(['Mug', 'cup'])
  })

  it('caps the count and each tag length', () => {
    expect(normalizeTags(Array.from({ length: 30 }, (_, i) => `t${i}`)).length).toBe(12)
    expect(normalizeTags(['y'.repeat(80)])[0].length).toBe(30)
  })

  it('collapses inner whitespace and returns [] for empty input', () => {
    expect(normalizeTags('  a   b  ')).toEqual(['a b'])
    expect(normalizeTags(null)).toEqual([])
    expect(normalizeTags([])).toEqual([])
  })
})
