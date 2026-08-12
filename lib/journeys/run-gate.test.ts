import { describe, it, expect } from 'vitest'
import { canStartRunForCircle } from './run-gate'

// The pure Run gate (ADR-842): who may start a Run for a Circle. The IO half (resolveRunGate)
// reads the Circle + the owning Space's capabilities and feeds these facts in.

const base = {
  circleHostId: 'host-1',
  viewerProfileId: 'host-1',
  spaceCanEdit: false,
  staff: false,
}

describe('canStartRunForCircle', () => {
  it('admits the circle host', () => {
    expect(canStartRunForCircle(base)).toBe(true)
  })

  it('refuses an unrelated member', () => {
    expect(canStartRunForCircle({ ...base, viewerProfileId: 'someone-else' })).toBe(false)
  })

  it('admits a steward of the space that owns the circle (the ADR-842 widening)', () => {
    expect(
      canStartRunForCircle({
        ...base,
        viewerProfileId: 'space-editor',
        spaceCanEdit: true,
      }),
    ).toBe(true)
  })

  it('admits platform staff on a circle they neither host nor steward', () => {
    expect(
      canStartRunForCircle({ ...base, viewerProfileId: 'operator', staff: true }),
    ).toBe(true)
  })

  it('admits a space steward on a Space Circle that has no personal host yet', () => {
    expect(
      canStartRunForCircle({
        circleHostId: null,
        viewerProfileId: 'space-editor',
        spaceCanEdit: true,
        staff: false,
      }),
    ).toBe(true)
  })

  it('refuses anonymous callers, staff flag or not (a Run records a host)', () => {
    expect(canStartRunForCircle({ ...base, viewerProfileId: null })).toBe(false)
    expect(canStartRunForCircle({ ...base, viewerProfileId: null, staff: true })).toBe(false)
    expect(
      canStartRunForCircle({ ...base, viewerProfileId: null, spaceCanEdit: true }),
    ).toBe(false)
  })

  it('refuses when the circle has no host and the viewer holds nothing else', () => {
    expect(
      canStartRunForCircle({
        circleHostId: null,
        viewerProfileId: 'member',
        spaceCanEdit: false,
        staff: false,
      }),
    ).toBe(false)
  })

  // ── circleCanManage: the UI/server alignment. "Start a journey run" renders on
  // `circle.editSettings`; anything narrower here is a control that shows and then refuses.
  it('admits whoever MANAGES the circle: the circle-scoped Admin rung (ADR-1014)', () => {
    expect(
      canStartRunForCircle({
        circleHostId: 'host-1',
        viewerProfileId: 'circle-admin',
        spaceCanEdit: false,
        staff: false,
        circleCanManage: true,
      }),
    ).toBe(true)
  })

  it('admits a host recorded only as a stewardship edge (no host_id match)', () => {
    // The FK says someone else (or nobody); the capability layer says this viewer leads it.
    expect(
      canStartRunForCircle({
        circleHostId: null,
        viewerProfileId: 'edge-host',
        spaceCanEdit: false,
        staff: false,
        circleCanManage: true,
      }),
    ).toBe(true)
  })

  it('still refuses a plain member: managing is a capability, not a membership', () => {
    expect(
      canStartRunForCircle({
        ...base,
        viewerProfileId: 'plain-member',
        circleCanManage: false,
      }),
    ).toBe(false)
  })

  it('omitting circleCanManage changes nothing (fail-closed default)', () => {
    expect(canStartRunForCircle({ ...base, viewerProfileId: 'stranger' })).toBe(false)
    expect(canStartRunForCircle(base)).toBe(true)
  })

  it('never admits an anonymous caller, however well the facts read', () => {
    expect(
      canStartRunForCircle({
        circleHostId: null,
        viewerProfileId: null,
        spaceCanEdit: false,
        staff: false,
        circleCanManage: true,
      }),
    ).toBe(false)
  })
})
