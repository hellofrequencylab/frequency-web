import { describe, it, expect } from 'vitest'
import { computeUserHasEvents } from './index-data'

// The Manage + My drafts actions on the member's own /events home appear ONLY once the member has
// added an event (owner rule). computeUserHasEvents is the pure gate over the head-count of events
// they host or posted; it must be FAIL-SAFE (a null count reads as "none", hiding the actions).
describe('computeUserHasEvents', () => {
  it('is true when the member hosts or posted at least one event', () => {
    expect(computeUserHasEvents(1)).toBe(true)
    expect(computeUserHasEvents(5)).toBe(true)
  })

  it('is false when the member has added no events', () => {
    expect(computeUserHasEvents(0)).toBe(false)
  })

  it('fails safe to false on a null count (read error / unknown)', () => {
    expect(computeUserHasEvents(null)).toBe(false)
  })
})
