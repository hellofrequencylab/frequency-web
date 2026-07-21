'use server'

// Collaborator spaces (ADR-799 §B) — the WRITES: request / accept / decline / revoke. Mirrors
// app/(main)/events/placement-actions.ts (request -> steward-approve), extended to the space<->space
// symmetric case: EITHER side initiates, the OTHER side's owner/admin approves; revoke is either side.
//
// AUTHZ (the table is service-role only, so these gates ARE the authority): every action re-derives the
// caller (getMyProfileId) and checks membership of the approver set (listSpaceCollaborationApprovers =
// owner + active admins) for the correct side. Fail-closed: an empty approver set (a read error) denies.

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getMyProfileId } from '@/lib/auth'
import { getSpaceById } from '@/lib/spaces/store'
import { type ActionResult, ok, fail } from '@/lib/action-result'
import {
  loadCollaboration,
  listSpaceCollaborationApprovers,
  approverSideForRequest,
} from '@/lib/spaces/collaborations'

/** True when the signed-in caller is an owner/admin of `spaceId`. Fail-closed (false on no session /
 *  read error, since the approver set is empty then). */
async function viewerApprovesSpace(spaceId: string): Promise<boolean> {
  const profileId = await getMyProfileId()
  if (!profileId) return false
  const approvers = await listSpaceCollaborationApprovers(spaceId)
  return approvers.includes(profileId)
}

/** A chainable + awaitable write filter (supabase builders are both). Lets an update chain extra
 *  `.eq`/`.in` guards so the status transition is atomic at the DB (the row updates only if it is still
 *  in the expected state), closing the read-then-write race. */
interface WriteFilter extends Promise<{ error: { code?: string } | null }> {
  eq: (c: string, val: string) => WriteFilter
  in: (c: string, vals: string[]) => WriteFilter
}

/** Untyped admin handle for the write (space_collaborations isn't in the generated types yet, ADR-246). */
function collabTable() {
  return (createAdminClient() as unknown as {
    from: (t: string) => {
      insert: (rows: Record<string, unknown>[]) => { select: (c: string) => { maybeSingle: () => Promise<{ data: { id: string } | null; error: { code?: string } | null }> } }
      update: (v: Record<string, unknown>) => WriteFilter
    }
  }).from('space_collaborations')
}

async function revalidateSpaces(...spaceIds: string[]): Promise<void> {
  for (const id of spaceIds) {
    const space = await getSpaceById(id)
    if (space) {
      revalidatePath(`/spaces/${space.slug}`, 'layout')
      revalidatePath(`/spaces/${space.slug}/settings/collaborators`)
    }
  }
}

/**
 * Open a collaboration: `initiatingSpaceId` asks `partnerSpaceId` to collaborate, with `hostSide` saying
 * which of the two is the HOST (the venue/event) vs the collaborator (the guest business). Caller must be
 * an owner/admin of the INITIATING space. Both spaces must be `business` type + `active`. If the caller
 * ALSO approves the partner (one operator owns both), it auto-accepts. A duplicate active row (unique
 * index) is a no-op success. Fail-closed.
 */
export async function requestCollaboration(
  initiatingSpaceId: string,
  partnerSpaceId: string,
  hostSide: 'initiator' | 'partner',
): Promise<ActionResult> {
  const profileId = await getMyProfileId()
  if (!profileId) return fail('Sign in to manage collaborators.')
  if (initiatingSpaceId === partnerSpaceId) return fail('A space cannot collaborate with itself.')
  if (!(await viewerApprovesSpace(initiatingSpaceId))) return fail('You do not manage this space.')

  const [initiating, partner] = await Promise.all([getSpaceById(initiatingSpaceId), getSpaceById(partnerSpaceId)])
  if (!initiating || !partner) return fail('One of the spaces could not be found.')
  for (const s of [initiating, partner]) {
    if (s.type !== 'business') return fail('Both spaces must be business spaces to collaborate.')
    if (s.status !== 'active') return fail('Both spaces must be active to collaborate.')
  }

  const hostSpaceId = hostSide === 'initiator' ? initiatingSpaceId : partnerSpaceId
  const collaboratorSpaceId = hostSide === 'initiator' ? partnerSpaceId : initiatingSpaceId
  // One operator owning both sides can skip the approval round-trip.
  const autoAccept = await viewerApprovesSpace(partnerSpaceId)

  const { error } = await collabTable()
    .insert([
      {
        host_space_id: hostSpaceId,
        collaborator_space_id: collaboratorSpaceId,
        invited_by_space_id: initiatingSpaceId,
        requested_by: profileId,
        status: autoAccept ? 'accepted' : 'pending',
        ...(autoAccept ? { responded_at: new Date().toISOString(), responded_by: profileId } : {}),
      },
    ])
    .select('id')
    .maybeSingle()
  // 23505 = an active (pending/accepted) row already exists for this pair -> treat as success (idempotent).
  if (error && error.code !== '23505') return fail('Could not send the collaboration request. Try again.')

  await revalidateSpaces(initiatingSpaceId, partnerSpaceId)
  return ok()
}

/** Approve a pending request. Caller must be owner/admin of the side that did NOT initiate it. */
export async function acceptCollaboration(collaborationId: string): Promise<ActionResult> {
  return respondToRequest(collaborationId, 'accepted')
}

/** Decline a pending request. Caller must be owner/admin of the non-initiating side. */
export async function declineCollaboration(collaborationId: string): Promise<ActionResult> {
  return respondToRequest(collaborationId, 'declined')
}

async function respondToRequest(collaborationId: string, next: 'accepted' | 'declined'): Promise<ActionResult> {
  const profileId = await getMyProfileId()
  if (!profileId) return fail('Sign in to manage collaborators.')
  const row = await loadCollaboration(collaborationId)
  if (!row) return fail('Collaboration request not found.')
  if (row.status !== 'pending') return fail('This request has already been handled.')
  // Only the side that did NOT initiate may approve/decline.
  if (!(await viewerApprovesSpace(approverSideForRequest(row)))) return fail('You cannot respond to this request.')

  // Guard the status in the WHERE too: the row updates only if it is STILL pending, so a concurrent
  // decline/accept (or a revoke) cannot be overwritten by a stale read (atomic transition).
  const { error } = await collabTable()
    .update({ status: next, responded_at: new Date().toISOString(), responded_by: profileId })
    .eq('id', collaborationId)
    .eq('status', 'pending')
  if (error) return fail('Could not update the request. Try again.')

  await revalidateSpaces(row.host_space_id, row.collaborator_space_id)
  return ok()
}

/**
 * End a live (accepted) collaboration, or cancel a pending one. Caller must be an owner/admin of EITHER
 * party. status -> 'revoked' (a terminal state that frees a future re-request via the partial index).
 */
export async function revokeCollaboration(collaborationId: string): Promise<ActionResult> {
  const profileId = await getMyProfileId()
  if (!profileId) return fail('Sign in to manage collaborators.')
  const row = await loadCollaboration(collaborationId)
  if (!row) return fail('Collaboration not found.')
  if (row.status !== 'pending' && row.status !== 'accepted') return fail('This collaboration is already ended.')
  const [managesHost, managesCollab] = await Promise.all([
    viewerApprovesSpace(row.host_space_id),
    viewerApprovesSpace(row.collaborator_space_id),
  ])
  if (!managesHost && !managesCollab) return fail('You cannot end this collaboration.')

  // Guard the status in the WHERE: only a still-live (pending/accepted) row is revoked, so a concurrent
  // decline/accept cannot be clobbered by a stale read.
  const { error } = await collabTable()
    .update({ status: 'revoked', responded_at: new Date().toISOString(), responded_by: profileId })
    .eq('id', collaborationId)
    .in('status', ['pending', 'accepted'])
  if (error) return fail('Could not end the collaboration. Try again.')

  await revalidateSpaces(row.host_space_id, row.collaborator_space_id)
  return ok()
}
