import { describe, it, expect } from 'vitest'
import {
  normalizeTag,
  dedupeTags,
  clampBox,
  coerceExtraction,
  coerceContactDetails,
  coerceCardCorners,
  hasAnyContent,
  hasAnyDetails,
  squareCropRect,
} from './normalize'

describe('normalizeTag', () => {
  it('trims, collapses whitespace, and strips leading #', () => {
    expect(normalizeTag('  #Yoga   Teacher ')).toBe('Yoga Teacher')
  })
  it('returns empty for non-strings', () => {
    expect(normalizeTag(42)).toBe('')
    expect(normalizeTag(null)).toBe('')
  })
  it('caps length at 40', () => {
    expect(normalizeTag('a'.repeat(60))).toHaveLength(40)
  })
})

describe('dedupeTags', () => {
  it('dedupes case-insensitively, first spelling wins', () => {
    expect(dedupeTags(['Yoga', 'yoga', 'YOGA', 'surf'])).toEqual(['Yoga', 'surf'])
  })
  it('drops empties and non-array input', () => {
    expect(dedupeTags(['', '  ', 'real'])).toEqual(['real'])
    expect(dedupeTags('nope')).toEqual([])
  })
  it('caps the count', () => {
    const many = Array.from({ length: 30 }, (_, i) => `t${i}`)
    expect(dedupeTags(many, 5)).toHaveLength(5)
  })
})

describe('clampBox', () => {
  it('clamps a box into the unit square', () => {
    expect(clampBox({ x: -0.2, y: 0.5, w: 2, h: 0.3 })).toEqual({ x: 0, y: 0.5, w: 1, h: 0.3 })
  })
  it('rejects degenerate or missing boxes', () => {
    expect(clampBox({ x: 0.5, y: 0.5, w: 0, h: 0.2 })).toBeNull()
    expect(clampBox({ x: 0.1 })).toBeNull()
    expect(clampBox(null)).toBeNull()
  })
  it('accepts numeric strings', () => {
    expect(clampBox({ x: '0.1', y: '0.1', w: '0.5', h: '0.5' })).toEqual({
      x: 0.1, y: 0.1, w: 0.5, h: 0.5,
    })
  })
})

describe('coerceExtraction', () => {
  it('never trusts raw shape — fills safe defaults and lowercases email', () => {
    const e = coerceExtraction({ name: 'Ada Lovelace', email: 'ADA@EXAMPLE.COM', tags: ['Math', 'math'] })
    expect(e.displayName).toBe('Ada Lovelace')
    expect(e.email).toBe('ada@example.com')
    expect(e.tags).toEqual(['Math'])
    expect(e.photo.found).toBe(false)
    expect(e.phone).toBe('')
  })
  it('parses a face box and marks the photo found', () => {
    const e = coerceExtraction({ photo: { found: true, box: { x: 0.2, y: 0.1, w: 0.3, h: 0.4 } } })
    expect(e.photo.box).toEqual({ x: 0.2, y: 0.1, w: 0.3, h: 0.4 })
    expect(e.photo.found).toBe(true)
  })
  it('handles garbage input without throwing', () => {
    expect(() => coerceExtraction(undefined)).not.toThrow()
    expect(coerceExtraction('nope').displayName).toBe('')
  })
  it('fills safe defaults for the new card fields (backward compatible)', () => {
    const e = coerceExtraction({ name: 'Ada' })
    expect(e.logo).toEqual({ found: false, box: null, imageIndex: 0 })
    expect(e.corners).toEqual([])
    expect(e.quality).toEqual({ legible: true, glare: false, skew: false, note: null })
    expect(e.details).toEqual({})
  })
  it('parses a logo box and marks it found', () => {
    const e = coerceExtraction({ logo: { found: true, imageIndex: 1, box: { x: 0.1, y: 0.1, w: 0.2, h: 0.2 } } })
    expect(e.logo.found).toBe(true)
    expect(e.logo.imageIndex).toBe(1)
    expect(e.logo.box).toEqual({ x: 0.1, y: 0.1, w: 0.2, h: 0.2 })
  })
  it('keeps per-image corners only when a quad is fully valid', () => {
    const quad = [
      { x: 0.1, y: 0.1 }, { x: 0.9, y: 0.12 }, { x: 0.88, y: 0.8 }, { x: 0.1, y: 0.82 },
    ]
    const e = coerceExtraction({ corners: [quad, null, [{ x: 2, y: 0 }]] })
    expect(e.corners).toHaveLength(3)
    expect(e.corners[0]).toEqual(quad)
    expect(e.corners[1]).toBeNull()
    expect(e.corners[2]).toBeNull()
  })
  it('passes a poor quality read through with the note', () => {
    const e = coerceExtraction({ quality: { legible: false, glare: true, note: 'Some glare on the front. Try again without the flash.' } })
    expect(e.quality.legible).toBe(false)
    expect(e.quality.glare).toBe(true)
    expect(e.quality.skew).toBe(false)
    expect(e.quality.note).toContain('glare')
  })
})

describe('coerceCardCorners', () => {
  it('returns [] for non-arrays and caps at six images', () => {
    expect(coerceCardCorners('nope')).toEqual([])
    expect(coerceCardCorners(Array.from({ length: 9 }, () => null))).toHaveLength(6)
  })
})

describe('coerceContactDetails', () => {
  it('returns {} for garbage and empty input', () => {
    expect(coerceContactDetails(null)).toEqual({})
    expect(coerceContactDetails({ phones: [], emails: [{}] })).toEqual({})
  })
  it('keeps valid rows, drops empties, lowercases emails', () => {
    const d = coerceContactDetails({
      phones: [{ label: 'Mobile', number: '(555) 123-4567', confidence: 'low' }, { label: 'fax' }],
      emails: [{ label: 'work', address: 'ADA@Example.com' }],
      addresses: ['123 Coast Hwy, Encinitas, CA', ''],
      services: ['sound baths'],
      certifications: ['RYT-500'],
      hours: 'Mon to Fri, 9 to 5',
      links: [{ url: 'studio.com/book', kind: 'booking' }, { kind: 'website' }],
      other: [{ label: 'tagline', value: 'Healing through sound' }, { label: 'no value' }],
    })
    expect(d.phones).toEqual([{ label: 'Mobile', number: '(555) 123-4567', confidence: 'low' }])
    expect(d.emails).toEqual([{ label: 'work', address: 'ada@example.com' }])
    expect(d.addresses).toEqual(['123 Coast Hwy, Encinitas, CA'])
    expect(d.services).toEqual(['sound baths'])
    expect(d.certifications).toEqual(['RYT-500'])
    expect(d.hours).toBe('Mon to Fri, 9 to 5')
    expect(d.links).toEqual([{ label: 'studio.com/book', url: 'studio.com/book', kind: 'booking' }])
    expect(d.other).toEqual([{ label: 'tagline', value: 'Healing through sound' }])
  })
  it('whitelists link kinds and caps every list', () => {
    const d = coerceContactDetails({
      links: [{ url: 'a.com', kind: 'BOGUS' }],
      phones: Array.from({ length: 9 }, (_, i) => ({ number: `${i}` })),
      services: Array.from({ length: 20 }, (_, i) => `s${i}`),
      other: Array.from({ length: 20 }, (_, i) => ({ label: `l${i}`, value: 'v' })),
    })
    expect(d.links![0].kind).toBe('other')
    expect(d.phones).toHaveLength(4)
    expect(d.services).toHaveLength(12)
    expect(d.other).toHaveLength(12)
  })
  it('hasAnyDetails sees content; details count toward hasAnyContent', () => {
    expect(hasAnyDetails({})).toBe(false)
    expect(hasAnyDetails({ hours: 'weekends' })).toBe(true)
    expect(hasAnyContent(coerceExtraction({ details: { services: ['notary'] } }))).toBe(true)
  })
})

describe('hasAnyContent', () => {
  it('is false for an empty harvest, true when anything is present', () => {
    expect(hasAnyContent(coerceExtraction({}))).toBe(false)
    expect(hasAnyContent(coerceExtraction({ company: 'Acme' }))).toBe(true)
  })
})

describe('squareCropRect', () => {
  it('produces an in-bounds square centered on the box', () => {
    const rect = squareCropRect({ x: 0.4, y: 0.4, w: 0.2, h: 0.2 }, 1000, 1000, 0)
    expect(rect.size).toBe(200)
    // centered on (0.5,0.5)*1000 = 500 → sx,sy = 400
    expect(rect.sx).toBe(400)
    expect(rect.sy).toBe(400)
  })
  it('clamps the square inside the image at the edges', () => {
    const rect = squareCropRect({ x: 0.9, y: 0.9, w: 0.2, h: 0.2 }, 1000, 1000, 0)
    expect(rect.sx + rect.size).toBeLessThanOrEqual(1000)
    expect(rect.sy + rect.size).toBeLessThanOrEqual(1000)
  })
  it('never exceeds the image dimensions', () => {
    const rect = squareCropRect({ x: 0, y: 0, w: 1, h: 1 }, 800, 600, 0.5)
    expect(rect.size).toBeLessThanOrEqual(600)
  })
})
