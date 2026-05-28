'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// ── Helpers ──────────────────────────────────────────────────────────

async function getMyProfileId(): Promise<string> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/sign-in')

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('id')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (!profile) redirect('/onboarding')
  return profile.id as string
}

// ── startConversation ─────────────────────────────────────────────────
// Finds an existing 1:1 thread with otherProfileId, or creates one.
// Called as a form action from /people/[handle] and circle member lists.

export async function startConversation(otherProfileId: string) {
  const myProfileId = await getMyProfileId()

  // Don't allow messaging yourself
  if (myProfileId === otherProfileId) redirect('/messages')

  const admin = createAdminClient()

  // Gate on friendship. Must be accepted friends to start a new 1:1
  const friendPair = myProfileId < otherProfileId
    ? { user_a_id: myProfileId, user_b_id: otherProfileId }
    : { user_a_id: otherProfileId, user_b_id: myProfileId }
  const { data: friendship } = await admin
    .from('friendships')
    .select('id')
    .match({ ...friendPair, status: 'accepted' })
    .maybeSingle()
  if (!friendship) throw new Error('You must be friends to start a conversation')

  // Find all conversations I'm in
  const { data: mineRows } = await admin
    .from('conversation_participants')
    .select('conversation_id')
    .eq('profile_id', myProfileId)

  const myConvIds = (mineRows ?? []).map((r) => r.conversation_id as string)

  if (myConvIds.length > 0) {
    // Check if any of those also include the other profile
    const { data: shared } = await admin
      .from('conversation_participants')
      .select('conversation_id')
      .in('conversation_id', myConvIds)
      .eq('profile_id', otherProfileId)
      .limit(1)
      .maybeSingle()

    if (shared) {
      redirect(`/messages/${shared.conversation_id}`)
    }
  }

  // Create a new conversation and add both participants
  const { data: conv, error } = await admin
    .from('conversations')
    .insert({})
    .select('id')
    .single()

  if (error || !conv) throw new Error('Failed to create conversation')

  await admin.from('conversation_participants').insert([
    { conversation_id: conv.id, profile_id: myProfileId },
    { conversation_id: conv.id, profile_id: otherProfileId },
  ])

  redirect(`/messages/${conv.id}`)
}

// ── sendMessage ───────────────────────────────────────────────────────

export async function sendMessage(conversationId: string, formData: FormData) {
  const body = (formData.get('body') as string | null)?.trim()
  if (!body) return

  const myProfileId = await getMyProfileId()
  const admin = createAdminClient()

  // Verify I'm a participant before inserting
  const { data: part } = await admin
    .from('conversation_participants')
    .select('profile_id')
    .eq('conversation_id', conversationId)
    .eq('profile_id', myProfileId)
    .maybeSingle()

  if (!part) return

  await admin.from('messages').insert({
    conversation_id: conversationId,
    sender_id: myProfileId,
    body,
  })

  // Mark the sender as having read up to now
  await admin
    .from('conversation_participants')
    .update({ last_read_at: new Date().toISOString() })
    .eq('conversation_id', conversationId)
    .eq('profile_id', myProfileId)

  revalidatePath(`/messages/${conversationId}`)
  revalidatePath('/messages')
}

// ── markConversationRead ──────────────────────────────────────────────

export async function markConversationRead(conversationId: string) {
  const myProfileId = await getMyProfileId()
  const admin = createAdminClient()

  await admin
    .from('conversation_participants')
    .update({ last_read_at: new Date().toISOString() })
    .eq('conversation_id', conversationId)
    .eq('profile_id', myProfileId)

  revalidatePath('/messages')
}

// ── Group DMs ─────────────────────────────────────────────────────────

const GROUP_DM_CAP = 25 // max participants including yourself

export async function startGroupConversation(
  profileIds: string[],
  name?: string | null
): Promise<{ id: string }> {
  const myProfileId = await getMyProfileId()

  // Filter out self, dedupe, and validate
  const others = [...new Set(profileIds)].filter(id => id !== myProfileId)
  if (others.length === 0) throw new Error('Pick at least one person')
  if (others.length + 1 > GROUP_DM_CAP) {
    throw new Error(`Group DMs are capped at ${GROUP_DM_CAP} people`)
  }

  const admin = createAdminClient()

  // Gate on friendship. Creator must be friends with every invitee
  const pairs = others.map((id) =>
    myProfileId < id
      ? { user_a_id: myProfileId, user_b_id: id }
      : { user_a_id: id, user_b_id: myProfileId }
  )
  const { data: friendships } = await admin
    .from('friendships')
    .select('user_a_id, user_b_id')
    .or(pairs.map((p) => `and(user_a_id.eq.${p.user_a_id},user_b_id.eq.${p.user_b_id})`).join(','))
    .eq('status', 'accepted')

  const friendSet = new Set(
    (friendships ?? []).map((f) => `${f.user_a_id}:${f.user_b_id}`)
  )
  const nonFriends = pairs.filter((p) => !friendSet.has(`${p.user_a_id}:${p.user_b_id}`))
  if (nonFriends.length > 0) {
    throw new Error('You must be friends with every member of a group DM')
  }

  const trimmedName = name?.trim() || null

  const { data: conv, error } = await admin
    .from('conversations')
    .insert({ name: trimmedName, created_by: myProfileId })
    .select('id')
    .single()

  if (error || !conv) throw new Error(error?.message ?? 'Failed to create group DM')

  const rows = [{ conversation_id: conv.id, profile_id: myProfileId }]
  for (const id of others) {
    rows.push({ conversation_id: conv.id, profile_id: id })
  }

  await admin.from('conversation_participants').insert(rows)

  revalidatePath('/messages')
  return { id: conv.id }
}

export async function renameConversation(conversationId: string, name: string) {
  const myProfileId = await getMyProfileId()
  const admin = createAdminClient()

  // Caller must be a participant
  const { data: part } = await admin
    .from('conversation_participants')
    .select('profile_id')
    .eq('conversation_id', conversationId)
    .eq('profile_id', myProfileId)
    .maybeSingle()
  if (!part) throw new Error('You must be a participant to rename this conversation')

  const trimmed = name.trim() || null

  await admin
    .from('conversations')
    .update({ name: trimmed })
    .eq('id', conversationId)

  revalidatePath(`/messages/${conversationId}`)
  revalidatePath('/messages')
}

export async function leaveConversation(conversationId: string) {
  const myProfileId = await getMyProfileId()
  const admin = createAdminClient()

  await admin
    .from('conversation_participants')
    .delete()
    .eq('conversation_id', conversationId)
    .eq('profile_id', myProfileId)

  revalidatePath('/messages')
  redirect('/messages')
}
