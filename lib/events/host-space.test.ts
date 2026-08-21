import { describe, it, expect } from 'vitest'
import { hostingSpaceId, feeBearingSpaceId, venueSpaceId } from '@/lib/events/belonging'

// ── The root guard, and the ONE place root is deliberately kept (LIVE-075) ───────────────────────
//
// `20260712030000_content_space_id_default_root.sql` stamps every event's space_id to the ROOT
// tenant on insert, so the hand-rolled placement fallback is almost never null — it is "Frequency".
// Measured 2026-08-20: 33 of 59 live events root-stamped. Ten sites read that as a real hosting
// Space; nine of them were wrong and one (the fee) was right.

const ROOT = '868b093d-ea57-4bca-b2b3-f549248582ca'
const REAL = 'e4e224aa-966d-4cda-b748-e1209a633173'
const OTHER = '3877f96a-d961-46db-a8bb-e308a6d63e22'

describe('hostingSpaceId — root is NOT a host', () => {
  it('a root-stamped personal event has no hosting Space', () => {
    expect(hostingSpaceId({ spaceId: ROOT, hostSpaceId: null }, ROOT)).toBeNull()
  })

  it('an explicit host wins over the placement column', () => {
    expect(hostingSpaceId({ spaceId: OTHER, hostSpaceId: REAL }, ROOT)).toBe(REAL)
  })

  it('the pre-ADR-819 fallback still holds, or legacy tickets re-route their money', () => {
    expect(hostingSpaceId({ spaceId: REAL, hostSpaceId: null }, ROOT)).toBe(REAL)
  })

  it('a genuinely unpartitioned event has no host either', () => {
    expect(hostingSpaceId({ spaceId: null, hostSpaceId: null }, ROOT)).toBeNull()
  })

  it('an unresolvable root cannot silently un-guard a root-stamped event', () => {
    // With no root id there is nothing to compare against, so root reads as a real Space. That is
    // the honest degradation — it is the PRE-fix behaviour, not a new failure — and it is why the
    // resolver reads the root once per request rather than trusting a cached guess.
    expect(hostingSpaceId({ spaceId: ROOT, hostSpaceId: null }, null)).toBe(ROOT)
  })
})

describe('feeBearingSpaceId — the one question where root IS the answer', () => {
  it('🔴 keeps the root tenant, because a platform-hosted event is Frequency’s own sale', () => {
    // Collapsing this to null would reprice the platform's own events as personal ones
    // (lib/billing/tickets.ts prices Space / personal / platform as three named cases).
    expect(feeBearingSpaceId({ space_id: ROOT, host_space_id: null })).toBe(ROOT)
  })

  it('agrees with hostingSpaceId everywhere else', () => {
    expect(feeBearingSpaceId({ space_id: OTHER, host_space_id: REAL })).toBe(REAL)
    expect(feeBearingSpaceId({ space_id: REAL, host_space_id: null })).toBe(REAL)
    expect(feeBearingSpaceId({ space_id: null, host_space_id: null })).toBeNull()
  })

  it('is spelled as a branch, and a hand-written truth table says the branch is right', () => {
    // A TABLE, not a re-derivation. The obvious version of this test asserted against
    // the chained placement fallback inline — which (a) proves nothing a typo could not also
    // satisfy, since it restates the implementation, and (b) put the exact shape LIVE-075 sweeps
    // for into this file, so the guard reported the tree as unfixed. Both problems go away when the
    // expected values are written out by hand.
    const CASES: Array<[string | null, string | null, string | null]> = [
      // host_space_id, space_id, expected
      [null, ROOT, ROOT], // 🔴 the platform's own event keeps the root tenant
      [null, REAL, REAL], // the pre-ADR-819 placement fallback
      [OTHER, REAL, OTHER], // an explicit host wins
      [REAL, null, REAL], // host set, no placement
      [null, null, null], // unpartitioned
    ]
    for (const [host, space, expected] of CASES) {
      expect(feeBearingSpaceId({ host_space_id: host, space_id: space })).toBe(expected)
    }
  })
})

describe('venueSpaceId still names a second Space only when there is one', () => {
  it('returns null when the venue IS the host', () => {
    expect(venueSpaceId({ spaceId: REAL, hostSpaceId: REAL }, ROOT)).toBeNull()
  })
})
