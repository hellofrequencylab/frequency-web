import { describe, it, expect } from 'vitest'
import { canTransferCircle, type TransferTarget } from './transfer'

// The pure circle-transfer gate (ADR-843). Authority is required on BOTH sides: the actor must
// own the source, and must own the destination. The IO half resolves those facts.

const SPACE_B: TransferTarget = { kind: 'space', spaceId: 'space-b' }
const TO_ME: TransferTarget = { kind: 'person', profileId: 'me' }
const TO_SOMEONE: TransferTarget = { kind: 'person', profileId: 'stranger' }

/** A steward of the source Space, moving it somewhere. */
const steward = {
  viewerProfileId: 'me',
  sourceSpaceCanEdit: true,
  currentHostId: 'host-1',
  targetSpaceCanEdit: true,
  target: SPACE_B,
  staff: false,
  linkedTierCount: 0,
}

describe('canTransferCircle', () => {
  it('moves a circle between two spaces the actor runs', () => {
    expect(canTransferCircle(steward).allowed).toBe(true)
  })

  it('refuses a destination space the actor does not run', () => {
    const d = canTransferCircle({ ...steward, targetSpaceCanEdit: false })
    expect(d.allowed).toBe(false)
    expect(d.reason).toContain('space you help run')
  })

  it('refuses when the actor does not own the source', () => {
    const d = canTransferCircle({
      ...steward,
      sourceSpaceCanEdit: false,
      currentHostId: 'someone-else',
    })
    expect(d.allowed).toBe(false)
    expect(d.reason).toContain('owns this circle')
  })

  it('lets the actor take a space circle as their own', () => {
    expect(canTransferCircle({ ...steward, target: TO_ME }).allowed).toBe(true)
  })

  it('refuses handing a circle to a third party (that needs acceptance)', () => {
    const d = canTransferCircle({ ...steward, target: TO_SOMEONE })
    expect(d.allowed).toBe(false)
    expect(d.reason).toContain('not available yet')
  })

  it('lets a personal circle host move it into a space they run', () => {
    expect(
      canTransferCircle({
        viewerProfileId: 'me',
        sourceSpaceCanEdit: false,
        currentHostId: 'me',
        targetSpaceCanEdit: true,
        target: SPACE_B,
        staff: false,
        linkedTierCount: 0,
      }).allowed,
    ).toBe(true)
  })

  it('admits platform staff on both sides', () => {
    expect(
      canTransferCircle({
        viewerProfileId: 'operator',
        sourceSpaceCanEdit: false,
        currentHostId: 'someone-else',
        targetSpaceCanEdit: false,
        target: TO_SOMEONE,
        staff: true,
        linkedTierCount: 0,
      }).allowed,
    ).toBe(true)
  })

  it('refuses anonymous callers, staff flag or not', () => {
    expect(canTransferCircle({ ...steward, viewerProfileId: null }).allowed).toBe(false)
    expect(canTransferCircle({ ...steward, viewerProfileId: null, staff: true }).allowed).toBe(false)
  })
})

// THE TIER LOCK. A Space links a membership tier to one of its circles and the billing lifecycle
// then mints provenance-stamped memberships rows into it (lib/spaces/tier-circle.ts). Nothing in
// the ownership write ever touched that link, so a transferred circle left the old Space granting
// paid members a seat on another tenant's roster. The linked circle is now PINNED until unlinked.
// These fail on the pre-guard tree: every one of them was `allowed: true` there.
describe('canTransferCircle: the tier lock (cross-tenant membership leak)', () => {
  it('refuses to move a circle a membership tier is linked to', () => {
    const d = canTransferCircle({ ...steward, linkedTierCount: 1 })
    expect(d.allowed).toBe(false)
    expect(d.reason).toContain('linked to a membership tier')
  })

  it('refuses for platform staff too: it is an integrity rule, not a permission', () => {
    expect(
      canTransferCircle({ ...steward, staff: true, linkedTierCount: 1 }).allowed,
    ).toBe(false)
  })

  it('refuses a move to a person as firmly as a move to a space', () => {
    expect(canTransferCircle({ ...steward, target: TO_ME, linkedTierCount: 1 }).allowed).toBe(false)
  })

  it('refuses on ANY link, whatever the tier costs or whether it is retired', () => {
    // The guard counts links, never price_cents or is_active, because the GRANT path reads only
    // circle_id. Two rules over one fact is how this hole opened.
    expect(canTransferCircle({ ...steward, linkedTierCount: 3 }).allowed).toBe(false)
  })

  it('still allows the move once the operator unlinks', () => {
    expect(canTransferCircle({ ...steward, linkedTierCount: 0 }).allowed).toBe(true)
  })

  it('tells an anonymous caller to sign in first, not about tiers', () => {
    // Ordering guard: the signed-in check stays the first thing the gate says.
    expect(
      canTransferCircle({ ...steward, viewerProfileId: null, linkedTierCount: 1 }).reason,
    ).toContain('Sign in')
  })
})
