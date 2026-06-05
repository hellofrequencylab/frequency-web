import { describe, it, expect } from 'vitest'
import { canViewLead, type LeadViewer, type LeadCandidate } from './visibility'

const viewer: LeadViewer = { profileId: 'p-viewer', city: 'Encinitas' }

function lead(over: Partial<LeadCandidate> = {}): LeadCandidate {
  return { ownerId: 'p-other', visibility: 'private', city: null, linkedProfileId: null, ...over }
}

describe('canViewLead', () => {
  it('hides a private capture owned by someone else', () => {
    expect(canViewLead(viewer, lead())).toEqual({ visible: false, reason: null })
  })

  it('always shows a capture the viewer owns (valid connection)', () => {
    expect(canViewLead(viewer, lead({ ownerId: 'p-viewer' }))).toEqual({ visible: true, reason: 'owner' })
  })

  it('shows a network-shared capture to a local viewer (locality + share)', () => {
    expect(
      canViewLead(viewer, lead({ visibility: 'network', city: 'encinitas' })),
    ).toEqual({ visible: true, reason: 'network_local' })
  })

  it('hides a network-shared capture from a non-local viewer', () => {
    expect(
      canViewLead(viewer, lead({ visibility: 'network', city: 'Austin' })),
    ).toEqual({ visible: false, reason: null })
  })

  it('does not leak a network capture when the viewer has no city', () => {
    expect(
      canViewLead({ profileId: 'p-viewer', city: null }, lead({ visibility: 'network', city: 'Encinitas' })),
    ).toEqual({ visible: false, reason: null })
  })

  it('treats a capture linked to a member as a member, not a lead', () => {
    // Even the owner does not get a "lead" hit once it is a real member.
    expect(
      canViewLead(viewer, lead({ ownerId: 'p-viewer', linkedProfileId: 'm-1' })),
    ).toEqual({ visible: false, reason: 'member' })
  })

  it('does not match locality when only one side has a city', () => {
    expect(canViewLead(viewer, lead({ visibility: 'network', city: null }))).toEqual({
      visible: false,
      reason: null,
    })
  })
})
