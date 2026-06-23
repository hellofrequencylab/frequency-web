import { describe, it, expect } from 'vitest'
import { generateSlug, normalizeSlug, isValidSlug, isValidTargetUrl } from './codes'

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
