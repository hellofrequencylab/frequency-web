import { describe, it, expect } from 'vitest'
import { partnerSideForHold, roleForHold } from './venue-holds'

describe('venue-hold pure helpers', () => {
  const row = { venue_space_id: 'venue', requester_space_id: 'guest' }

  it('partnerSideForHold returns the OTHER space from a given perspective', () => {
    expect(partnerSideForHold(row, 'venue')).toBe('guest')
    expect(partnerSideForHold(row, 'guest')).toBe('venue')
  })

  it('roleForHold is venue for the venue space, requester otherwise', () => {
    expect(roleForHold(row, 'venue')).toBe('venue')
    expect(roleForHold(row, 'guest')).toBe('requester')
    // A third space (shouldn't happen) reads as requester (not the venue owner) — fail-safe to non-approver.
    expect(roleForHold(row, 'other')).toBe('requester')
  })
})
