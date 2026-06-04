import { describe, it, expect } from 'vitest'
import {
  normalizeTag,
  dedupeTags,
  clampBox,
  coerceExtraction,
  hasAnyContent,
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
