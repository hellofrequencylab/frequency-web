import { describe, it, expect } from 'vitest'
import {
  isPastDueSpaceMembership,
  spacePastDueMemberBody,
  spacePastDueMemberTitle,
  spacePastDueOwnerLabel,
} from './membership-dunning'

// LIVE-429. PURE only. The reader lives in memberships.ts so this file
// never imports the service-role client.

describe('isPastDueSpaceMembership', () => {
  it('is only true for past_due', () => {
    expect(isPastDueSpaceMembership('past_due')).toBe(true)
    expect(isPastDueSpaceMembership('pending')).toBe(false)
    expect(isPastDueSpaceMembership('active')).toBe(false)
    expect(isPastDueSpaceMembership('canceled')).toBe(false)
    expect(isPastDueSpaceMembership(null)).toBe(false)
    expect(isPastDueSpaceMembership(undefined)).toBe(false)
  })
})

describe('space past-due copy', () => {
  it('names the Space and keeps the member in', () => {
    expect(spacePastDueMemberTitle()).toBe('Your last payment did not go through')
    const body = spacePastDueMemberBody('Royal Temple')
    expect(body).toContain('Royal Temple')
    expect(body).toContain('still a member')
    expect(body).not.toContain('\u2014')
    expect(spacePastDueOwnerLabel()).toBe('Payment failed')
  })
})
