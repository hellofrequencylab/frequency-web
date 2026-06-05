// Who may FIND a non-member person ("lead") in app-wide search — the
// locality + valid-connection permission model (ADR-130, docs/NETWORK-CRM.md).
//
// Members (profiles) are searchable community-wide as they are today. A person who
// is only a private capture (network_contacts, no member profile yet) is NOT
// public — they surface in another viewer's search only when there's a legitimate
// reason. Two reasons, smallest blast radius first:
//
//   • 'owner'         — the viewer captured them (they scanned the card). The
//                       unambiguous "valid connection"; always safe.
//   • 'network_local' — the capturing steward deliberately promoted the record to
//                       `visibility='network'` AND the viewer is in the same
//                       locality (city). Locality + an explicit share = connection.
//
// Captures already linked to a member profile are skipped here (reason 'member'):
// that person is a real member and is found through the normal member directory,
// never twice. Pure + unit-tested so the rule is auditable in one place.

export type LeadViewer = {
  profileId: string
  /** The viewer's own city (profiles.city), or null if they haven't set one. */
  city: string | null
}

export type LeadCandidate = {
  ownerId: string
  visibility: string
  city: string | null
  /** Set once the capture is linked to a member — then it's a member, not a lead. */
  linkedProfileId: string | null
}

export type LeadReason = 'owner' | 'network_local' | 'member' | null
export type LeadVisibility = { visible: boolean; reason: LeadReason }

function sameLocality(a: string | null, b: string | null): boolean {
  if (!a || !b) return false
  return a.trim().toLowerCase() === b.trim().toLowerCase()
}

/** Decide whether `viewer` may find `lead` in app-wide people search. */
export function canViewLead(viewer: LeadViewer, lead: LeadCandidate): LeadVisibility {
  // Already a member → found via the member directory, not as a lead.
  if (lead.linkedProfileId) return { visible: false, reason: 'member' }

  // You captured them — always findable by you.
  if (viewer.profileId && lead.ownerId && viewer.profileId === lead.ownerId) {
    return { visible: true, reason: 'owner' }
  }

  // A steward shared this capture to the network, and you're a local.
  if (lead.visibility === 'network' && sameLocality(viewer.city, lead.city)) {
    return { visible: true, reason: 'network_local' }
  }

  return { visible: false, reason: null }
}
