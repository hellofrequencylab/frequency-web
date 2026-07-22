'use server'

// Shared venue coordination holds (Collaborator spaces B3, ADR-799 §B) — the WRITES: request / accept /
// decline / cancel. Mirrors collaborations-actions.ts (request -> steward-approve, atomic status guards),
// specialized to the venue-hold direction: the REQUESTER space asks, the VENUE space's owner/admin
// approves. A hold is advisory coordination only and never enters the space_bookings conflict engine.
//
// AUTHZ (the table is service-role only, so these gates ARE the authority): create gates on the requester
// space's owner/admin AND an ACCEPTED collaboration between the two spaces; respond gates on the VENUE
// space's owner/admin; cancel gates on EITHER side. Fail-closed (an empty approver set denies).

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getMyProfileId } from '@/lib/auth'
import { getSpaceById, getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { type ActionResult, ok, fail } from '@/lib/action-result'
import { listSpaceCollaborationApprovers } from '@/lib/spaces/collaborations'
import { loadVenueHold, spacesHaveAcceptedCollaboration } from '@/lib/spaces/venue-holds'

/** True when the signed-in caller is an owner/admin of `spaceId`. Fail-closed. */
async function viewerApprovesSpace(spaceId: string): Promise<boolean> {
  const profileId = await getMyProfileId()
  if (!profileId) return false
  const approvers = await listSpaceCollaborationApprovers(spaceId)
  return approvers.includes(profileId)
}

interface WriteFilter extends Promise<{ error: { code?: string } | null }> {
  eq: (c: string, val: string) => WriteFilter
  in: (c: string, vals: string[]) => WriteFilter
}

function holdsTable() {
  return (createAdminClient() as unknown as {
    from: (t: string) => {
      insert: (rows: Record<string, unknown>[]) => { select: (c: string) => { maybeSingle: () => Promise<{ data: { id: string } | null; error: { code?: string } | null }> } }
      update: (v: Record<string, unknown>) => WriteFilter
    }
  }).from('space_venue_holds')
}

async function revalidateSpaces(...spaceIds: string[]): Promise<void> {
  for (const id of spaceIds) {
    const space = await getSpaceById(id)
    if (space) revalidatePath(`/spaces/${space.slug}/settings/collaborators`)
  }
}

/** Parse a client datetime string to an ISO instant, or null if invalid. */
function toIso(v: string | null | undefined): string | null {
  if (!v) return null
  const t = new Date(v).getTime()
  return Number.isNaN(t) ? null : new Date(t).toISOString()
}

/**
 * Request to use a partner's venue. `requesterSpaceId` (which the caller must own/admin) asks
 * `venueSpaceId` for the window [startsAt, endsAt]. GATED: an ACCEPTED collaboration must link the two
 * spaces, both must be active, and the window must be a real future-or-present interval. Auto-accepts when
 * the caller ALSO owns/admins the venue side (one operator on both). Fail-closed.
 */
export async function requestVenueHold(
  requesterSpaceId: string,
  venueSpaceId: string,
  input: { title: string; startsAt: string; endsAt: string },
): Promise<ActionResult> {
  const profileId = await getMyProfileId()
  if (!profileId) return fail('Sign in to request a venue.')
  if (requesterSpaceId === venueSpaceId) return fail('A space books its own venue directly.')
  if (!(await viewerApprovesSpace(requesterSpaceId))) return fail('You do not manage this space.')
  if (!(await spacesHaveAcceptedCollaboration(requesterSpaceId, venueSpaceId))) {
    return fail('You can only request a venue from a space you actively collaborate with.')
  }

  const title = (input.title ?? '').trim()
  if (!title) return fail('Add a short title for the hold.')
  const startsAt = toIso(input.startsAt)
  const endsAt = toIso(input.endsAt)
  if (!startsAt || !endsAt) return fail('Enter a valid start and end time.')
  if (endsAt <= startsAt) return fail('The end time must be after the start time.')
  if (new Date(endsAt).getTime() < Date.now()) return fail('That time is in the past.')

  const [requester, venue] = await Promise.all([getSpaceById(requesterSpaceId), getSpaceById(venueSpaceId)])
  if (!requester || !venue) return fail('One of the spaces could not be found.')
  for (const s of [requester, venue]) {
    if (s.status !== 'active') return fail('Both spaces must be active.')
  }

  const autoAccept = await viewerApprovesSpace(venueSpaceId)
  const { error } = await holdsTable()
    .insert([
      {
        venue_space_id: venueSpaceId,
        requester_space_id: requesterSpaceId,
        requested_by: profileId,
        title,
        starts_at: startsAt,
        ends_at: endsAt,
        status: autoAccept ? 'accepted' : 'pending',
        ...(autoAccept ? { responded_at: new Date().toISOString(), responded_by: profileId } : {}),
      },
    ])
    .select('id')
    .maybeSingle()
  if (error) return fail('Could not send the venue request. Try again.')

  await revalidateSpaces(requesterSpaceId, venueSpaceId)
  return ok()
}

/** Invite by slug (the request form takes a partner's slug/URL). */
export async function requestVenueHoldBySlug(
  requesterSpaceId: string,
  venueSlug: string,
  input: { title: string; startsAt: string; endsAt: string },
): Promise<ActionResult> {
  const clean = (venueSlug ?? '').trim().replace(/^.*\/spaces\//, '').replace(/[/?#].*$/, '')
  if (!clean) return fail('Choose the venue space.')
  const partner = await getVisibleSpaceBySlug(clean, await getMyProfileId())
  if (!partner) return fail('Could not find that space.')
  return requestVenueHold(requesterSpaceId, partner.id, input)
}

/** Approve a pending hold. Caller must own/admin the VENUE side. */
export async function acceptVenueHold(holdId: string): Promise<ActionResult> {
  return respond(holdId, 'accepted')
}

/** Decline a pending hold. Caller must own/admin the VENUE side. */
export async function declineVenueHold(holdId: string): Promise<ActionResult> {
  return respond(holdId, 'declined')
}

async function respond(holdId: string, next: 'accepted' | 'declined'): Promise<ActionResult> {
  const profileId = await getMyProfileId()
  if (!profileId) return fail('Sign in to manage venue holds.')
  const row = await loadVenueHold(holdId)
  if (!row) return fail('That request was not found.')
  if (row.status !== 'pending') return fail('This request has already been handled.')
  // Only the VENUE owner approves/declines a hold on their venue.
  if (!(await viewerApprovesSpace(row.venue_space_id))) return fail('You cannot respond to this request.')

  const { error } = await holdsTable()
    .update({ status: next, responded_at: new Date().toISOString(), responded_by: profileId })
    .eq('id', holdId)
    .eq('status', 'pending')
  if (error) return fail('Could not update the request. Try again.')

  await revalidateSpaces(row.venue_space_id, row.requester_space_id)
  return ok()
}

/** Cancel a pending or accepted hold. Caller must own/admin EITHER side (the requester withdraws, or the
 *  venue owner releases an accepted hold). status -> 'cancelled' (terminal). Atomic status guard. */
export async function cancelVenueHold(holdId: string): Promise<ActionResult> {
  const profileId = await getMyProfileId()
  if (!profileId) return fail('Sign in to manage venue holds.')
  const row = await loadVenueHold(holdId)
  if (!row) return fail('That hold was not found.')
  if (row.status !== 'pending' && row.status !== 'accepted') return fail('This hold is already ended.')
  const [managesVenue, managesRequester] = await Promise.all([
    viewerApprovesSpace(row.venue_space_id),
    viewerApprovesSpace(row.requester_space_id),
  ])
  if (!managesVenue && !managesRequester) return fail('You cannot cancel this hold.')

  const { error } = await holdsTable()
    .update({ status: 'cancelled', responded_at: new Date().toISOString(), responded_by: profileId })
    .eq('id', holdId)
    .in('status', ['pending', 'accepted'])
  if (error) return fail('Could not cancel the hold. Try again.')

  await revalidateSpaces(row.venue_space_id, row.requester_space_id)
  return ok()
}
