import { describe, it, expect } from 'vitest'
import { normalizeEin, formatEin, validateSubmission } from './nonprofit-verification'

// Pure-helper unit tests for the Non Profit (501(c)(3)) verification flow (ADR-552, AUDIT #6). Only the
// no-IO helpers are exercised here; the gated reads/writes live behind the admin client.

describe('normalizeEin', () => {
  it('keeps a clean 9-digit EIN', () => {
    expect(normalizeEin('123456789')).toBe('123456789')
  })

  it('strips the conventional dash', () => {
    expect(normalizeEin('12-3456789')).toBe('123456789')
  })

  it('strips spaces and stray punctuation', () => {
    expect(normalizeEin(' 12 3456789 ')).toBe('123456789')
  })

  it('rejects a value that is not 9 digits', () => {
    expect(normalizeEin('1234')).toBeNull()
    expect(normalizeEin('1234567890')).toBeNull()
    expect(normalizeEin('')).toBeNull()
  })

  it('rejects non-strings', () => {
    expect(normalizeEin(null)).toBeNull()
    expect(normalizeEin(123456789)).toBeNull()
    expect(normalizeEin(undefined)).toBeNull()
  })
})

describe('formatEin', () => {
  it('formats 9 digits as XX-XXXXXXX', () => {
    expect(formatEin('123456789')).toBe('12-3456789')
  })

  it('passes through anything that is not clean 9 digits', () => {
    expect(formatEin('1234')).toBe('1234')
    expect(formatEin(null)).toBe('')
  })
})

describe('validateSubmission', () => {
  it('accepts a valid EIN + legal name and returns the normalized value', () => {
    const res = validateSubmission({ ein: '12-3456789', orgLegalName: '  Bright Futures Inc  ' })
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.value.ein).toBe('123456789')
      expect(res.value.orgLegalName).toBe('Bright Futures Inc')
    }
  })

  it('rejects an invalid EIN first', () => {
    const res = validateSubmission({ ein: 'nope', orgLegalName: 'Bright Futures Inc' })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toMatch(/EIN/)
  })

  it('rejects an empty legal name', () => {
    const res = validateSubmission({ ein: '123456789', orgLegalName: '   ' })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toMatch(/organization/)
  })
})
