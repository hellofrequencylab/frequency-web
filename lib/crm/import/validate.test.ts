import { describe, it, expect } from 'vitest'
import { suggestEmailDomain, normalizePhone, phoneIsPlausible } from './validate'

describe('suggestEmailDomain', () => {
  it('suggests a fix for an obvious domain typo', () => {
    expect(suggestEmailDomain('sarah@gmial.com')).toBe('sarah@gmail.com')
    expect(suggestEmailDomain('jo@hotnail.com')).toBe('jo@hotmail.com')
  })
  it('returns null for a known-good domain', () => {
    expect(suggestEmailDomain('sarah@gmail.com')).toBeNull()
    expect(suggestEmailDomain('a@acmecorp.com')).toBeNull() // not close to any common domain
  })
  it('returns null for junk or empty input', () => {
    expect(suggestEmailDomain('not-an-email')).toBeNull()
    expect(suggestEmailDomain('')).toBeNull()
  })
})

describe('normalizePhone', () => {
  it('assumes +1 for a 10-digit number', () => {
    expect(normalizePhone('(555) 123-4567')).toBe('+15551234567')
  })
  it('keeps a leading +country', () => {
    expect(normalizePhone('+44 20 7946 0000')).toBe('+442079460000')
  })
  it('collapses a US 1-prefixed 11-digit number', () => {
    expect(normalizePhone('1-555-123-4567')).toBe('+15551234567')
  })
  it('returns the trimmed original when it cannot make sense of it', () => {
    expect(normalizePhone('call me')).toBe('call me')
    expect(normalizePhone('')).toBe('')
  })
})

describe('phoneIsPlausible', () => {
  it('accepts 7..15 digit numbers', () => {
    expect(phoneIsPlausible('555-1234')).toBe(true)
    expect(phoneIsPlausible('+15551234567')).toBe(true)
  })
  it('rejects too-short or too-long', () => {
    expect(phoneIsPlausible('12345')).toBe(false)
    expect(phoneIsPlausible('1234567890123456')).toBe(false)
  })
})
