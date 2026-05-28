'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

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

export async function sendFriendRequest(targetProfileId: string): Promise<{ error?: string }> {
  const me = await getMyProfile()
  if (me.id === targetProfileId) return { error: 'Cannot friend yourself' }

  const pair = canonicalPair(me.id, targetProfileId)
  const admin = createAdminClient()

  // Insert as pending; ON CONFLICT do nothing so re-sending is a no-op
  const { error } = await admin
    .from('friendships')
    .insert({
      ...pair,
      requested_by: me.id,
      status: 'pending',
    })

  if (error && !error.message.toLowerCase().includes('duplicate')) {
    return { error: error.message }
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
  return {}
}

// ── acceptFriendRequest ──────────────────────────────────────────────

export async function acceptFriendRequest(requesterProfileId: string): Promise<{ error?: string }> {
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

  if (error) return { error: error.message }
  if (!updated) return { error: 'No pending request from that user' }

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
  return {}
}

// ── declineFriendRequest ─────────────────────────────────────────────
// Deletes the pending row so the requester can try again later.

export async function declineFriendRequest(requesterProfileId: string): Promise<{ error?: string }> {
  const me = await getMyProfile()
  const pair = canonicalPair(me.id, requesterProfileId)
  const admin = createAdminClient()

  const { error } = await admin
    .from('friendships')
    .delete()
    .match({ ...pair, status: 'pending', requested_by: requesterProfileId })

  if (error) return { error: error.message }
  revalidatePath('/friends')
  return {}
}

// ── cancelFriendRequest ──────────────────────────────────────────────
// Requester withdraws their own pending request.

export async function cancelFriendRequest(addresseeProfileId: string): Promise<{ error?: string }> {
  const me = await getMyProfile()
  const pair = canonicalPair(me.id, addresseeProfileId)
  const admin = createAdminClient()

  const { error } = await admin
    .from('friendships')
    .delete()
    .match({ ...pair, status: 'pending', requested_by: me.id })

  if (error) return { error: error.message }
  revalidatePath('/friends')
  revalidatePath(`/people/${addresseeProfileId}`)
  return {}
}

// ── unfriend ─────────────────────────────────────────────────────────
// Either party removes an accepted friendship.

export async function unfriend(otherProfileId: string): Promise<{ error?: string }> {
  const me = await getMyProfile()
  const pair = canonicalPair(me.id, otherProfileId)
  const admin = createAdminClient()

  const { error } = await admin
    .from('friendships')
    .delete()
    .match({ ...pair, status: 'accepted' })

  if (error) return { error: error.message }
  revalidatePath('/friends')
  revalidatePath(`/people/${otherProfileId}`)
  return {}
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
