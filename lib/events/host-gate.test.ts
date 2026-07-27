import { describe, it, expect } from 'vitest'
import { canActAsEventHost } from './host-gate'

// The pure host-gate decision (ADR-841): host-only event actions admit the host OR platform
// staff. The IO wrapper (viewerActsAsEventHost) only assembles these facts, so this table IS
// the authorization contract for transfer host, cohost management, moderation, and dispatch.

const HOST = 'profile-host'
const OTHER = 'profile-other'

describe('canActAsEventHost', () => {
  it('admits the event host', () => {
    expect(canActAsEventHost({ hostId: HOST, viewerProfileId: HOST, staff: false })).toBe(true)
  })

  it('denies a signed-in non-host member', () => {
    expect(canActAsEventHost({ hostId: HOST, viewerProfileId: OTHER, staff: false })).toBe(false)
  })

  it('admits platform staff on an event they do not host (the ADR-841 override)', () => {
    expect(canActAsEventHost({ hostId: HOST, viewerProfileId: OTHER, staff: true })).toBe(true)
  })

  it('admits platform staff on a HOSTLESS seeded listing (host_id null)', () => {
    // The live bug: seeded events posted on an organizer's behalf have no host at all, so the
    // old host_id === caller gate denied EVERYONE, including the operator trying to hand the
    // event to its real organizer.
    expect(canActAsEventHost({ hostId: null, viewerProfileId: OTHER, staff: true })).toBe(true)
  })

  it('denies a non-staff member on a hostless listing (nobody impersonates the missing host)', () => {
    expect(canActAsEventHost({ hostId: null, viewerProfileId: OTHER, staff: false })).toBe(false)
  })

  it('denies anonymous viewers even with the staff flag set (writes need an actor)', () => {
    expect(canActAsEventHost({ hostId: HOST, viewerProfileId: null, staff: true })).toBe(false)
  })
})
