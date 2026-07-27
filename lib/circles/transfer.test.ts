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
      }).allowed,
    ).toBe(true)
  })

  it('refuses anonymous callers, staff flag or not', () => {
    expect(canTransferCircle({ ...steward, viewerProfileId: null }).allowed).toBe(false)
    expect(canTransferCircle({ ...steward, viewerProfileId: null, staff: true }).allowed).toBe(false)
  })
})
