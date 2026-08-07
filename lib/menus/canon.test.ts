import { describe, expect, it } from 'vitest'

import { canonViolation, canonRejection, RETIRED_TERMS } from './canon'

// The live header menu said "Interests" for /discover/topics while docs/NAMING.md retired the
// word by name. Every code path respected the canon; the Menu Manager's label field did not.
// These pin the guard that now sits on the write.

describe('canonViolation', () => {
  it('catches the word that actually shipped', () => {
    expect(canonViolation('Interests')?.use).toBe('Channels')
    expect(canonViolation('interests')?.use).toBe('Channels')
    expect(canonViolation('Your Interests')?.use).toBe('Channels')
    expect(canonViolation('Interest')?.use).toBe('Channels')
  })

  it('catches Marketplace, which canon reserves in favour of Market', () => {
    expect(canonViolation('Marketplace')?.use).toBe('Market')
  })

  it('catches Domains, the mistake most likely made while fixing the first one', () => {
    expect(canonViolation('Domains')?.use).toBe('Pillars')
  })

  it('passes the canon-correct replacements', () => {
    for (const label of ['Channels', 'Market', 'Pillars', 'Circles', 'My Frequency', 'Journal']) {
      expect(canonViolation(label), label).toBeNull()
    }
  })

  it('is word-bounded, so a legitimate label containing the letters is not a false positive', () => {
    // "Market" must never trip the "Marketplace" rule, or the canon-correct name would be
    // unenterable — the worst possible failure for a guard whose whole job is naming.
    expect(canonViolation('Market')).toBeNull()
    expect(canonViolation('Market admin')).toBeNull()
    expect(canonViolation('Supermarket')).toBeNull()
  })
})

describe('canonRejection', () => {
  it('names the word, the replacement, and where the rule is written', () => {
    const msg = canonRejection('Interests')
    expect(msg).toContain('Interests')
    expect(msg).toContain('Channels')
    expect(msg).toContain('NAMING.md')
  })

  it('returns null for a clean label', () => {
    expect(canonRejection('Channels')).toBeNull()
  })

  it('uses no em dashes (CONTENT-VOICE hard rule applies to operator-facing copy too)', () => {
    for (const term of RETIRED_TERMS) {
      expect(canonRejection(term.term)).not.toContain('—')
    }
  })
})
