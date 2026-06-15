import { describe, it, expect } from 'vitest'
import { escapeLike, sanitizeOrTerm } from './search-sanitize'

describe('escapeLike', () => {
  it('escapes LIKE wildcards so input is a literal substring', () => {
    expect(escapeLike('50%')).toBe('50\\%')
    expect(escapeLike('a_b')).toBe('a\\_b')
    expect(escapeLike('c\\d')).toBe('c\\\\d')
    expect(escapeLike('plain text')).toBe('plain text')
  })
})

describe('sanitizeOrTerm', () => {
  it('strips PostgREST or() grammar characters that could inject conditions', () => {
    // `),` would otherwise break out of an ilike branch and append filters; the `_` in the
    // injected payload is also escaped as a LIKE wildcard.
    expect(sanitizeOrTerm('x),is_active.eq.false')).toBe('x  is\\_active.eq.false')
    expect(sanitizeOrTerm('a(b)c')).toBe('a b c')
  })

  it('also escapes LIKE wildcards and trims', () => {
    expect(sanitizeOrTerm('  a%b  ')).toBe('a\\%b')
  })

  it('caps the length', () => {
    expect(sanitizeOrTerm('a'.repeat(200))).toHaveLength(80)
  })
})
