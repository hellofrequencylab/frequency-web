import { describe, it, expect } from 'vitest'
import { redactContacts, hasContact } from './redact'

describe('redactContacts — phones', () => {
  it('redacts a US phone in parens-dash form and captures it', () => {
    const { redacted, contacts } = redactContacts('Call me at (555) 123-4567 about the room')
    expect(redacted).toBe('Call me at [number removed] about the room')
    expect(contacts).toEqual(['(555) 123-4567'])
  })

  it('redacts an international +country number', () => {
    const { redacted, contacts } = redactContacts('text +1 555-123-4567 anytime')
    expect(redacted).toContain('[number removed]')
    expect(contacts[0]).toContain('+1')
  })

  it('redacts a run of digits with no separators', () => {
    expect(redactContacts('reach me 5551234567').redacted).toBe('reach me [number removed]')
  })
})

describe('redactContacts — does not eat non-phone numbers', () => {
  it('leaves a price alone', () => {
    const { redacted, contacts } = redactContacts('Rent is $1200/mo, utilities included')
    expect(redacted).toBe('Rent is $1200/mo, utilities included')
    expect(contacts).toEqual([])
  })

  it('leaves a short date alone', () => {
    expect(redactContacts('available 1/15/2024').redacted).toBe('available 1/15/2024')
  })

  it('leaves bedroom counts alone', () => {
    expect(redactContacts('2 bed 1 bath').redacted).toBe('2 bed 1 bath')
  })
})

describe('redactContacts — emails', () => {
  it('redacts an email and captures it', () => {
    const { redacted, contacts } = redactContacts('email sara@example.com to apply')
    expect(redacted).toBe('email [email removed] to apply')
    expect(contacts).toEqual(['sara@example.com'])
  })

  it('handles an email and a phone together', () => {
    const { contacts } = redactContacts('sara@example.com or 555-123-4567')
    expect(contacts).toContain('sara@example.com')
    expect(contacts.some((c) => c.includes('555'))).toBe(true)
  })
})

describe('redactContacts — properties', () => {
  it('dedupes repeated contacts', () => {
    const { contacts } = redactContacts('call 5551234567 or 5551234567')
    expect(contacts).toEqual(['5551234567'])
  })

  it('is idempotent — a second pass changes nothing', () => {
    const once = redactContacts('reach me at 555-123-4567').redacted
    expect(redactContacts(once).redacted).toBe(once)
    expect(redactContacts(once).contacts).toEqual([])
  })

  it('handles empty input', () => {
    expect(redactContacts('')).toEqual({ redacted: '', contacts: [] })
  })
})

describe('hasContact', () => {
  it('is true for a phone and false for a price', () => {
    expect(hasContact('call 555-123-4567')).toBe(true)
    expect(hasContact('rent $1200')).toBe(false)
  })

  it('is true for an email', () => {
    expect(hasContact('sara@example.com')).toBe(true)
  })

  it('is stateless across repeated calls (global regex lastIndex reset)', () => {
    expect(hasContact('sara@example.com')).toBe(true)
    expect(hasContact('sara@example.com')).toBe(true)
  })
})
