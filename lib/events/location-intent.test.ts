import { describe, it, expect } from 'vitest'
import { withholdsAddress, stripWithholdingNote } from './location-intent'

// The pair of functions that exist because production had this row:
//
//   hide_address : false
//   location     : "The Royal Temple (RSVP to see location)"
//
// The host said the address is withheld in the field they were looking at; the flag said otherwise.
// It had no pin because the note broke its geocode — and if the geocode had worked, the map would
// have published the exact address. A bug prevented by a second bug is not prevented.

describe('reading the host as meaning what they wrote', () => {
  const WITHHELD = [
    'The Royal Temple (RSVP to see location)',
    'Royal Temple - RSVP for Address',
    'RSVP for address',
    'Address shared on RSVP',
    'Location revealed upon registration',
    'Venue on request',
    'Exact address sent after you book',
    'Secret location',
    'A private location in North Park',
    'Location shared after you sign up',
  ]

  for (const text of WITHHELD) {
    it(`treats "${text}" as withheld`, () => {
      expect(withholdsAddress(text)).toBe(true)
    })
  }

  const ORDINARY = [
    'Encinitas Viewpoint Park',
    '56 East D Street, Encinitas',
    'The Royal Temple',
    '123 Address Lane',
    'Community Center, Room 4',
    'Balboa Park, near the fountain',
    'Meet at the north entrance',
  ]

  for (const text of ORDINARY) {
    it(`leaves "${text}" alone`, () => {
      expect(withholdsAddress(text)).toBe(false)
    })
  }

  it('is false for nothing at all', () => {
    expect(withholdsAddress(null)).toBe(false)
    expect(withholdsAddress(undefined)).toBe(false)
    expect(withholdsAddress('   ')).toBe(false)
  })

  it('🔴 the false-negative is the expensive one, so borderline phrasings count as withheld', () => {
    // A false positive costs a member some precision on a map. A false negative publishes an address
    // a host meant to keep. Those are not symmetric, and this test records which way the module is
    // tuned so a later "tidy up the regexes" pass has to argue with it.
    expect(withholdsAddress('address provided upon rsvp')).toBe(true)
    expect(withholdsAddress('Full location given on signup')).toBe(true)
  })
})

describe('cleaning the note off before the geocoder sees it', () => {
  it('strips the parenthetical that broke the real row', () => {
    expect(stripWithholdingNote('The Royal Temple (RSVP to see location)')).toBe('The Royal Temple')
  })

  it('strips a trailing clause after a dash', () => {
    expect(stripWithholdingNote('Royal Temple - RSVP for Address')).toBe('Royal Temple')
  })

  it('leaves an ordinary line untouched', () => {
    expect(stripWithholdingNote('56 East D Street, Encinitas')).toBe('56 East D Street, Encinitas')
  })

  it('returns null when the note was the whole line', () => {
    // "" would waste a provider round-trip on a guaranteed miss, so the caller gets null and skips.
    expect(stripWithholdingNote('RSVP for address')).toBeNull()
    expect(stripWithholdingNote('Secret location')).toBeNull()
  })

  it('returns null for nothing at all', () => {
    expect(stripWithholdingNote(null)).toBeNull()
    expect(stripWithholdingNote('  ')).toBeNull()
  })

  it('does not leave dangling punctuation behind', () => {
    for (const input of ['The Barn, (address on request)', 'The Barn — RSVP for address']) {
      const out = stripWithholdingNote(input) ?? ''
      expect(out).not.toMatch(/[,;:.\-–—]\s*$/)
      expect(out).toContain('The Barn')
    }
  })

  it('🔴 stripping is for the GEOCODER only, never for display', () => {
    // Documented here because the tempting reuse is to render the cleaned string to a member. The
    // note is the host telling them HOW to get the address, which is the one thing they need to read.
    const raw = 'The Royal Temple (RSVP to see location)'
    expect(stripWithholdingNote(raw)).not.toContain('RSVP')
    expect(withholdsAddress(raw)).toBe(true)
  })
})
