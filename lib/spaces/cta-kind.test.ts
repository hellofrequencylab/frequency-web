import { describe, expect, it } from 'vitest'
import { bookPageKind, ctaKindFor, hasBookableServices } from './cta-kind'

// BOOK-002: the Book page leads with booking on a Space that takes bookings, whatever its Focus says.
describe('hasBookableServices', () => {
  it('needs both an active service and a weekly window', () => {
    expect(hasBookableServices({ serviceCount: 2, windowCount: 3 })).toBe(true)
    expect(hasBookableServices({ serviceCount: 2, windowCount: 0 })).toBe(false)
    expect(hasBookableServices({ serviceCount: 0, windowCount: 3 })).toBe(false)
    expect(hasBookableServices({ serviceCount: 0, windowCount: 0 })).toBe(false)
  })
})

describe('bookPageKind', () => {
  it('leads with booking on a bookable Space whatever the Focus says', () => {
    expect(bookPageKind('membership', true)).toBe('booking')
    expect(bookPageKind('donate', true)).toBe('booking')
    expect(bookPageKind('tickets', true)).toBe('booking')
    expect(bookPageKind(undefined, true)).toBe('booking')
  })

  it('keeps the Focus surface when nothing is bookable', () => {
    for (const kind of ['membership', 'donate', 'enroll', 'tickets', 'booking', undefined] as const) {
      expect(bookPageKind(kind, false)).toBe(kind)
    }
  })

  it('a business on its default Focus opens memberships until it is bookable', () => {
    const focus = ctaKindFor('business', 'service')
    expect(focus).toBe('membership')
    expect(bookPageKind(focus, false)).toBe('membership')
    expect(bookPageKind(focus, true)).toBe('booking')
  })
})
