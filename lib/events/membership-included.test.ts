import { describe, it, expect } from 'vitest'
import { includedEventCoversTier } from './membership-included'

// The pure half of the membership-included read (ADR-823 glue): which membership tier's card may
// advertise an event whose ticket gate names (or doesn't name) specific tiers.
describe('includedEventCoversTier', () => {
  it('an any-membership gate (null in tierIds) covers every tier', () => {
    const anyMember = { tierIds: [null] as (string | null)[] }
    expect(includedEventCoversTier(anyMember, 'mt-1')).toBe(true)
    expect(includedEventCoversTier(anyMember, 'mt-2')).toBe(true)
  })

  it('a tier-specific gate covers only the named tier', () => {
    const specific = { tierIds: ['mt-1'] as (string | null)[] }
    expect(includedEventCoversTier(specific, 'mt-1')).toBe(true)
    expect(includedEventCoversTier(specific, 'mt-2')).toBe(false)
    expect(includedEventCoversTier(specific, undefined)).toBe(false)
  })

  it('mixed gates (one open tier + one named) cover every tier via the open one', () => {
    const mixed = { tierIds: [null, 'mt-1'] as (string | null)[] }
    expect(includedEventCoversTier(mixed, 'mt-2')).toBe(true)
  })
})
