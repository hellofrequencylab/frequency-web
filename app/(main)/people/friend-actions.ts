'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import type { Database } from '@/lib/database.types'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { type ActionResult, ok, fail } from '@/lib/action-result'
import { resolveConnectProvenance, type ConnectContext } from '@/lib/connections/edge-types'

// ── Helpers ──────────────────────────────────────────────────────────

async function getMyProfile(): Promise<{ id: string; display_name: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/sign-in')

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('id, display_name')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  if (!profile) redirect('/onboarding')
  return profile as { id: string; display_name: string }
}

function canonicalPair(a: string, b: string): { user_a_id: string; user_b_id: string } {
  return a < b ? { user_a_id: a, user_b_id: b } : { user_a_id: b, user_b_id: a }
}

// ── sendFriendRequest ────────────────────────────────────────────────

export async function sendFriendRequest(
  targetProfileId: string,
  context?: ConnectContext,
): Promise<ActionResult> {
  const me = await getMyProfile()
  if (me.id === targetProfileId) return fail('Cannot friend yourself')

  const pair = canonicalPair(me.id, targetProfileId)
  const admin = createAdminClient()

  // Stamp how this connection was made (ADR-372 provenance). Default: a plain opt-in connect.
  const prov = resolveConnectProvenance(context)

  // Insert as pending; ON CONFLICT do nothing so re-sending is a no-op. The provenance columns are
  // not in the generated types until regen, so cast the row past the stale Insert type (ADR-246).
  const { error } = await admin
    .from('friendships')
    .insert({
      ...pair,
      requested_by: me.id,
      status: 'pending',
      edge_type: prov.edge_type,
      event_id: prov.event_id,
      circle_id: prov.circle_id,
    } as unknown as Database['public']['Tables']['friendships']['Insert'])

  if (error && !error.message.toLowerCase().includes('duplicate')) {
    return fail(error.message)
  }

  // Notify the target. But only if the row was newly inserted
  if (!error) {
    await admin.from('notifications').insert({
      recipient_id: targetProfileId,
      actor_id:     me.id,
      type:         'friend_request',
      reference_type: 'profile',
      reference_id: me.id,
      body:         `${me.display_name} sent you a friend request`,
    })
  }

  revalidatePath('/friends')
  revalidatePath(`/people/${targetProfileId}`)
  return ok()
}

// ── acceptFriendRequest ──────────────────────────────────────────────

export async function acceptFriendRequest(requesterProfileId: string): Promise<ActionResult> {
  const me = await getMyProfile()
  const pair = canonicalPair(me.id, requesterProfileId)
  const admin = createAdminClient()

  // Update only if I'm the addressee (i.e. requested_by is the other party)
  const { data: updated, error } = await admin
    .from('friendships')
    .update({ status: 'accepted', responded_at: new Date().toISOString() })
    .match({ ...pair, status: 'pending', requested_by: requesterProfileId })
    .select('id')
    .maybeSingle()

  if (error) return fail(error.message)
  if (!updated) return fail('No pending request from that user')

  // Notify the original requester that it was accepted
  await admin.from('notifications').insert({
    recipient_id: requesterProfileId,
    actor_id:     me.id,
    type:         'friend_accepted',
    reference_type: 'profile',
    reference_id: me.id,
    body:         `${me.display_name} accepted your friend request`,
  })

  revalidatePath('/friends')
  revalidatePath(`/people/${requesterProfileId}`)
  return ok()
}

// ── declineFriendRequest ─────────────────────────────────────────────
// Deletes the pending row so the requester can try again later.

export async function declineFriendRequest(requesterProfileId: string): Promise<ActionResult> {
  const me = await getMyProfile()
  const pair = canonicalPair(me.id, requesterProfileId)
  const admin = createAdminClient()

  const { error } = await admin
    .from('friendships')
    .delete()
    .match({ ...pair, status: 'pending', requested_by: requesterProfileId })

  if (error) return fail(error.message)
  revalidatePath('/friends')
  return ok()
}

// ── cancelFriendRequest ──────────────────────────────────────────────
// Requester withdraws their own pending request.

export async function cancelFriendRequest(addresseeProfileId: string): Promise<ActionResult> {
  const me = await getMyProfile()
  const pair = canonicalPair(me.id, addresseeProfileId)
  const admin = createAdminClient()

  const { error } = await admin
    .from('friendships')
    .delete()
    .match({ ...pair, status: 'pending', requested_by: me.id })

  if (error) return fail(error.message)
  revalidatePath('/friends')
  revalidatePath(`/people/${addresseeProfileId}`)
  return ok()
}

// ── unfriend ─────────────────────────────────────────────────────────
// Either party removes an accepted friendship.

export async function unfriend(otherProfileId: string): Promise<ActionResult> {
  const me = await getMyProfile()
  const pair = canonicalPair(me.id, otherProfileId)
  const admin = createAdminClient()

  const { error } = await admin
    .from('friendships')
    .delete()
    .match({ ...pair, status: 'accepted' })

  if (error) return fail(error.message)
  revalidatePath('/friends')
  revalidatePath(`/people/${otherProfileId}`)
  return ok()
}

// ── areFriends ───────────────────────────────────────────────────────
// Server-side check used by other actions to enforce DM gating.

export async function areFriends(a: string, b: string): Promise<boolean> {
  const pair = canonicalPair(a, b)
  const admin = createAdminClient()
  const { data } = await admin
    .from('friendships')
    .select('id')
    .match({ ...pair, status: 'accepted' })
    .maybeSingle()
  return !!data
}
