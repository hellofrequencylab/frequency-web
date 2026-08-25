import { describe, it, expect } from 'vitest'
import { generateSlug, normalizeSlug, isValidSlug, isValidTargetUrl, slugCharForByte, SLUG_UNBIASED_CEILING } from './codes'

describe('qr code slugs', () => {
  it('generates valid, unambiguous slugs of the requested length', () => {
    const slug = generateSlug(7)
    expect(slug).toHaveLength(7)
    expect(isValidSlug(slug)).toBe(true)
    expect(slug).not.toMatch(/[01oil]/) // no visually confusable chars
  })

  it('generates distinct slugs', () => {
    const slugs = new Set(Array.from({ length: 100 }, () => generateSlug()))
    expect(slugs.size).toBeGreaterThan(95) // collisions astronomically unlikely
  })

  it('normalizes custom slugs to the allowed shape', () => {
    expect(normalizeSlug('  Spring Flyer! ')).toBe('spring-flyer')
    expect(normalizeSlug('a//b__c')).toBe('abc')
    expect(normalizeSlug('--Lead--')).toBe('lead')
  })

  it('validates slug shape', () => {
    expect(isValidSlug('spring-flyer')).toBe(true)
    expect(isValidSlug('ab')).toBe(false) // too short
    expect(isValidSlug('has space')).toBe(false)
  })

  it('accepts only http(s) or site-relative targets', () => {
    expect(isValidTargetUrl('https://example.com/x')).toBe(true)
    expect(isValidTargetUrl('http://example.com')).toBe(true)
    expect(isValidTargetUrl('/circles')).toBe(true)
    expect(isValidTargetUrl('javascript:alert(1)')).toBe(false)
    expect(isValidTargetUrl('not a url')).toBe(false)
  })

  it('rejects protocol-relative and backslash-tricked open redirects', () => {
    expect(isValidTargetUrl('//evil.com')).toBe(false)
    expect(isValidTargetUrl('/\\evil.com')).toBe(false)
    // normal site-relative paths and absolute http(s) URLs still pass
    expect(isValidTargetUrl('/path')).toBe(true)
    expect(isValidTargetUrl('https://x.com')).toBe(true)
  })
})

// ── Slug uniformity (CodeQL "Creating biased random numbers from a cryptographically secure source")
//
// These ENUMERATE the byte space rather than sample the output, so they are a proof rather than a
// statistical hint and they cannot flake. The old implementation — `SLUG_ALPHABET[b % len]` with no
// rejection — fails the second one outright, which is what makes this a discriminating test rather
// than a restatement of the code.
describe('generateSlug is unbiased', () => {
  it('rejects exactly at the boundary, and 248 is that boundary for a 31-character alphabet', () => {
    expect(SLUG_UNBIASED_CEILING).toBe(248)
    expect(SLUG_UNBIASED_CEILING % 31).toBe(0)
    expect(slugCharForByte(247)).not.toBeNull()
    expect(slugCharForByte(248)).toBeNull()
    expect(slugCharForByte(255)).toBeNull()
  })

  it('maps every ACCEPTED byte to the alphabet with exactly equal frequency', () => {
    const counts = new Map<string, number>()
    for (let b = 0; b < 256; b++) {
      const ch = slugCharForByte(b)
      if (ch === null) continue
      counts.set(ch, (counts.get(ch) ?? 0) + 1)
    }
    // Every character present, and every one drawn the same number of times. Under the old
    // modulo fold, eight characters would score 9 here and the rest 8.
    expect(counts.size).toBe(31)
    expect([...new Set(counts.values())]).toEqual([8])
  })

  it('still returns the requested length using only alphabet characters', () => {
    for (const len of [3, 7, 12, 48]) {
      const s = generateSlug(len)
      expect(s).toHaveLength(len)
      expect(s).toMatch(/^[23456789abcdefghjkmnpqrstuvwxyz]+$/)
    }
  })
})
