import { describe, it, expect } from 'vitest'
import { approverSideForRequest, roleForSpace, partnerSideForSpace } from './collaborations'

// The three PURE authz/shaping helpers behind collaborator spaces (ADR-799 B). The IO reads/writes are
// exercised behind the service-role admin client; these decide WHO approves and WHICH side a space is.

const HOST = 'space-host'
const COLLAB = 'space-collab'

function row(invitedBy: string) {
  return { host_space_id: HOST, collaborator_space_id: COLLAB, invited_by_space_id: invitedBy }
}

describe('approverSideForRequest', () => {
  it('the approver is the side that did NOT initiate', () => {
    // Host initiated -> the collaborator approves.
    expect(approverSideForRequest(row(HOST))).toBe(COLLAB)
    // Collaborator initiated -> the host approves.
    expect(approverSideForRequest(row(COLLAB))).toBe(HOST)
  })
})

describe('roleForSpace', () => {
  it('is host for the host space and collaborator for the other', () => {
    expect(roleForSpace(row(HOST), HOST)).toBe('host')
    expect(roleForSpace(row(HOST), COLLAB)).toBe('collaborator')
  })
})

describe('partnerSideForSpace', () => {
  it('returns the OTHER party from each side', () => {
    expect(partnerSideForSpace(row(HOST), HOST)).toBe(COLLAB)
    expect(partnerSideForSpace(row(HOST), COLLAB)).toBe(HOST)
  })
})

describe('the authz invariants compose correctly', () => {
  it('either side can initiate, and the opposite side is always the approver', () => {
    // Host asks: approver is collaborator, and from the collaborator''s view it is awaiting THEIR approval.
    const hostAsked = row(HOST)
    expect(approverSideForRequest(hostAsked)).toBe(partnerSideForSpace(hostAsked, HOST))
    // Collaborator asks: approver is host.
    const collabAsked = row(COLLAB)
    expect(approverSideForRequest(collabAsked)).toBe(partnerSideForSpace(collabAsked, COLLAB))
  })
})
