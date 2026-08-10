'use server'

// THE CLIENT-CALLABLE SERVER ACTIONS for Space invites (ENTITY-SPACES-SYSTEM §3.2, the team layer).
//
// A 'use server' module may export ONLY async functions, so it cannot also hold the pure helpers
// (email/role validation, token generation) or the shared types. Those live in lib/spaces/invites.ts
// (no directive: pure helpers + IO + the action implementations + types, all unit-testable). This
// thin file is the seam the CLIENT surfaces import, so the mutations cross the network boundary as
// proper Server Actions:
//   invite-form.tsx -> createInvite, revokeInvite, searchTeamCandidates, inviteByProfile
//
// SERVER components (the members settings page, the accept route) import the implementations
// (createInvite / listInvites / revokeInvite / acceptInvite) directly from lib/spaces/invites.ts:
// they never cross a client boundary, so they need no wrapper. The authorization + validation all
// live in the implementations; these wrappers just re-expose them.

import {
  createInvite as createInviteImpl,
  revokeInvite as revokeInviteImpl,
  searchTeamCandidates as searchTeamCandidatesImpl,
  inviteByProfile as inviteByProfileImpl,
  type CreatedInvite,
  type TeamCandidate,
} from '@/lib/spaces/invites'
import { type SpaceRole } from '@/lib/spaces/membership'
import { type ActionResult } from '@/lib/action-result'

/** Create (or refresh) a pending invite for an email at a role. Gated on canManageMembers (owner /
 *  admin) in the implementation. Returns the invite + the ready-to-share accept link. */
export async function createInvite(
  spaceId: string,
  email: string,
  role: SpaceRole,
): Promise<ActionResult<CreatedInvite>> {
  return createInviteImpl(spaceId, email, role)
}

/** Revoke a pending invite. Gated on canManageMembers for the invite's Space in the implementation. */
export async function revokeInvite(inviteId: string): Promise<ActionResult> {
  return revokeInviteImpl(inviteId)
}

/** Members matching a name or @handle who are not already on this team. Gated on canManageMembers
 *  in the implementation, and FAIL-SAFE (`[]`) rather than throwing, so it never doubles as a probe.
 *  Returns PUBLIC identity only — never an email address. */
export async function searchTeamCandidates(spaceId: string, q: string): Promise<TeamCandidate[]> {
  return searchTeamCandidatesImpl(spaceId, q)
}

/** Invite an existing member by profile id at a role. The implementation resolves their account
 *  email server-side and delegates to createInvite, so the caller never learns the address. */
export async function inviteByProfile(
  spaceId: string,
  profileId: string,
  role: SpaceRole,
): Promise<ActionResult<CreatedInvite>> {
  return inviteByProfileImpl(spaceId, profileId, role)
}
