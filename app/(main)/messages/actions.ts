'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireProfileId as getMyProfileId } from '@/lib/auth'
import { isBlockedBetween } from '@/lib/blocking'
import { recordContactInteraction } from '@/lib/crm/interactions'

// ── In-app message → CRM timeline adapter (ADR-372 Phase 1) ────────────────────────────────────────
// Fold a sent 1:1 DM onto the ONE interaction timeline (contact_interactions) so the contact card shows
// every in-house message, not just email/SMS. FIRE-SAFE by contract: recordContactInteraction never
// throws, but we still wrap so a timeline write can NEVER break the send hot path (a failed fold just
// means the touch is missing from the card, never a failed message). Idempotent on the message id, so a
// retry/revalidation replay is a no-op. Recorded from the SENDER's book (owner) about the OTHER party
// (subject = their profile), direction outbound, source 'system' (auto-captured, not hand-logged).
async function recordDmTouch(senderProfileId: string, recipientProfileId: string, messageId: string, body: string) {
  try {
    await recordContactInteraction({
      ownerProfileId: senderProfileId,
      subjectKind: 'profile',
      subjectId: recipientProfileId,
      channel: 'in_app',
      direction: 'outbound',
      summary: 'Messaged',
      body,
      source: 'system',
      idempotencyKey: `in_app:${messageId}`,
      metadata: { messageId, kind: 'dm' },
    })
  } catch {
    // Never surface a timeline-write failure into the send path.
  }
}

// ── startConversation ─────────────────────────────────────────────────
// Finds an existing 1:1 thread with otherProfileId, or creates one.
// Called as a form action from /people/[handle] and circle member lists.

export async function startConversation(otherProfileId: string) {
  const myProfileId = await getMyProfileId()

  // Don't allow messaging yourself
  if (myProfileId === otherProfileId) redirect('/messages')

  // Blocking gate: neither party may start a thread if either has blocked the other.
  if (await isBlockedBetween(myProfileId, otherProfileId)) {
    throw new Error('You cannot message this member')
  }

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

  // Both participants must land, or the redirect would open an empty thread that
  // neither party can post into (they'd fail the participant check in sendMessage).
  const { error: partError } = await admin.from('conversation_participants').insert([
    { conversation_id: conv.id, profile_id: myProfileId },
    { conversation_id: conv.id, profile_id: otherProfileId },
  ])
  if (partError) throw new Error('Failed to start the conversation')

  redirect(`/messages/${conv.id}`)
}

// ── sendMessage ───────────────────────────────────────────────────────

// Bounds (site-audit SEC-2): cap free-text written to the DB so a participant can't post
// unbounded blobs. Generous limits, well above any real message / name.
const MAX_MESSAGE_BODY = 4000
const MAX_CONVO_NAME = 120

export async function sendMessage(conversationId: string, formData: FormData) {
  const body = (formData.get('body') as string | null)?.trim().slice(0, MAX_MESSAGE_BODY)
  if (!body) return

  const myProfileId = await getMyProfileId()
  const admin = createAdminClient()

  // Load every participant in one read: it verifies I'm a participant AND gives us the
  // other party for the block gate below (`conversations` is 1:1-only — group chats are
  // rooms, see startGroupConversation).
  const { data: participants } = await admin
    .from('conversation_participants')
    .select('profile_id')
    .eq('conversation_id', conversationId)

  const memberIds = (participants ?? []).map((p) => p.profile_id as string)
  if (!memberIds.includes(myProfileId)) return

  // Blocking gate (parity with startConversation): startConversation refuses to OPEN a
  // thread when either party blocked the other, but a thread that pre-dates the block was
  // never re-checked here, so a blocked member could keep posting into it. For a 1:1
  // conversation, refuse the send if the two parties are blocked in either direction.
  const others = memberIds.filter((id) => id !== myProfileId)
  if (others.length === 1 && (await isBlockedBetween(myProfileId, others[0]))) {
    throw new Error('You cannot message this member')
  }

  const { data: inserted } = await admin
    .from('messages')
    .insert({
      conversation_id: conversationId,
      sender_id: myProfileId,
      body,
    })
    .select('id')
    .single()

  // Fold the DM onto the CRM timeline (fire-safe, idempotent). 1:1 only — `conversations` is
  // 1:1-only, so there is exactly one counterpart; a room (group) send is a separate path and is
  // intentionally not folded here (prioritize the 1:1 DM path per the Phase 1 plan).
  if (inserted?.id && others.length === 1) {
    await recordDmTouch(myProfileId, others[0], inserted.id as string, body)
  }

  // Mark the sender as having read up to now
  await admin
    .from('conversation_participants')
    .update({ last_read_at: new Date().toISOString() })
    .eq('conversation_id', conversationId)
    .eq('profile_id', myProfileId)

  revalidatePath(`/messages/${conversationId}`)
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

  const trimmedName = name?.trim().slice(0, MAX_CONVO_NAME) || 'Group chat'

  // Phase B (ADR-088): a group chat is now a PRIVATE ROOM, not a group
  // conversation. `conversations` is 1:1-only; this returns a room id and the
  // caller routes to /messages/r/<id>.
  const { data: room, error } = await admin
    .from('rooms')
    .insert({ name: trimmedName, visibility: 'private', creator_id: myProfileId })
    .select('id')
    .single()

  if (error || !room) throw new Error(error?.message ?? 'Failed to create group chat')

  const memberRows = [{ room_id: room.id as string, profile_id: myProfileId, is_admin: true }]
  for (const id of others) {
    memberRows.push({ room_id: room.id as string, profile_id: id, is_admin: false })
  }
  await admin.from('room_members').insert(memberRows)

  revalidatePath('/messages')
  return { id: room.id as string }
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

  const trimmed = name.trim().slice(0, MAX_CONVO_NAME) || null

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
