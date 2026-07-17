import { describe, it, expect } from 'vitest'
import { promotionState, isPromoted } from './promote'

// PROMOTION STATE (ADR-742). The pure decision behind the "Add to Frequency contacts"
// action: a capture is `linked` once bridged (idempotent no-op), `needs_email` when
// there's no address to dedupe on, else `ready`. Locks the ordering (linked wins even
// when there's an email) so the action and the UI never disagree.

describe('promotionState', () => {
  it('is `linked` once the capture is bridged (idempotent), even with an email', () => {
    expect(promotionState({ linkedContactId: 'contact-1', email: 'pat@example.com' })).toBe('linked')
    expect(promotionState({ linkedContactId: 'contact-1', email: null })).toBe('linked')
  })

  it('is `needs_email` when not linked and there is no usable email', () => {
    expect(promotionState({ linkedContactId: null, email: null })).toBe('needs_email')
    expect(promotionState({ linkedContactId: null, email: '' })).toBe('needs_email')
    expect(promotionState({ linkedContactId: null, email: '   ' })).toBe('needs_email')
  })

  it('is `ready` when not linked and there is an email to dedupe on', () => {
    expect(promotionState({ linkedContactId: null, email: 'pat@example.com' })).toBe('ready')
  })
})

describe('isPromoted', () => {
  it('reflects only the marketing-DB bridge, not the member merge', () => {
    expect(isPromoted({ linkedContactId: 'contact-1' })).toBe(true)
    expect(isPromoted({ linkedContactId: null })).toBe(false)
  })
})
