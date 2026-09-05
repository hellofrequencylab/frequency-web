'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireProfileId as getMyProfileId } from '@/lib/auth'
import { isBlockedBetween } from '@/lib/blocking'
import { findOrCreateDirectConversation } from '@/lib/messages/direct-conversation'
import { dmThreadHref } from '@/lib/messages/dm-destination'
import { recordContactInteraction } from '@/lib/crm/interactions'
import { ok, fail, type ActionResult } from '@/lib/action-result'

// ── In-app message → CRM timeline adapter (ADR-372 Phase 1) ────────────────────────────────────────
// Fold a sent 1:1 DM onto the ONE interaction timeline (contact_interactions) so the contact card shows
// THAT a message happened, not just email/SMS. FIRE-SAFE by contract: recordContactInteraction never
// throws, but we still wrap so a timeline write can NEVER break the send hot path (a failed fold just
// means the touch is missing from the card, never a failed message). Idempotent on the message id.
//
// PRIVACY (owner ruling, 2026-07-25, CRM-COMMS-AUDIT F2): member-to-member DMs are NOT CRM content, so
// the timeline records the TOUCH ONLY (summary "Messaged") and NEVER the message body. The body used to
// be stored here, which let platform staff read private DM contents on the person card (the global,
// staff-gated person view reads NULL-lane interactions). The fold now carries no body at all.
async function recordDmTouch(senderProfileId: string, recipientProfileId: string, messageId: string) {
  try {
    await recordContactInteraction({
      ownerProfileId: senderProfileId,
      subjectKind: 'profile',
      subjectId: recipientProfileId,
      channel: 'in_app',
      direction: 'outbound',
      summary: 'Messaged',
      body: null, // never store DM content on the CRM timeline (F2)
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
      // dmThreadHref, not a template string: once the DM route retires this must land in the
      // dock directly rather than bounce off a redirecting page (ADR-896). Flag off = the
      // identical /messages/<id> string this line always produced.
      redirect(await dmThreadHref(shared.conversation_id as string))
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

  redirect(await dmThreadHref(conv.id as string))
}

// ── openDirectConversation ────────────────────────────────────────────
// The NON-NAVIGATING twin of startConversation (ADR-896, chat consolidation). Same three
// gates in the same order, but it RETURNS the conversation id instead of redirecting into
// /messages/<id>, so the caller can open the chat dock in place and the member keeps the
// page and the scroll position they were on. That is the whole point: the owner's report was
// that pressing "Reconnect with …" threw them onto a chat page.
//
// startConversation STAYS. Five CRM actions still want the redirect, and the profile /
// circle buttons were its only non-CRM callers.
//
// It never throws for a policy refusal. A thrown Error inside a client-invoked action reaches
// the browser as an opaque production digest, which is the wrong shape for "you need to be
// friends first" — the member would read a crash where a plain sentence belongs. Refusals
// come back as { ok: false, error } and the caller renders the sentence.
export async function openDirectConversation(
  otherProfileId: string,
): Promise<{ ok: true; conversationId: string } | { ok: false; error: string }> {
  const myProfileId = await getMyProfileId()

  if (myProfileId === otherProfileId) return { ok: false, error: 'You cannot message yourself.' }

  // Blocking gate: neither party may open a thread if either has blocked the other.
  if (await isBlockedBetween(myProfileId, otherProfileId)) {
    return { ok: false, error: 'You cannot message this member.' }
  }

  const admin = createAdminClient()

  // Friendship gate, byte-for-byte the same ordered-pair lookup startConversation does. Two
  // copies of a gate drift; this one is short enough that the risk is worth less than the
  // risk of refactoring the redirecting action that five CRM surfaces depend on.
  const friendPair = myProfileId < otherProfileId
    ? { user_a_id: myProfileId, user_b_id: otherProfileId }
    : { user_a_id: otherProfileId, user_b_id: myProfileId }
  const { data: friendship } = await admin
    .from('friendships')
    .select('id')
    .match({ ...friendPair, status: 'accepted' })
    .maybeSingle()
  if (!friendship) return { ok: false, error: 'You need to be friends before you can message.' }

  try {
    // The find-or-create seam is shared with the marketplace enquiry path. It is UNGATED by
    // contract, which is safe here only because all three gates above already ran.
    const conversationId = await findOrCreateDirectConversation(admin, myProfileId, otherProfileId)
    return { ok: true, conversationId }
  } catch {
    return { ok: false, error: 'We could not open that conversation. Try again.' }
  }
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
  // THROW, do not return. components/messages/thread.tsx rolls the optimistic bubble back
  // only inside `catch`, and a server action that returns normally never rejects — so a silent
  // return here left the sender looking at a message that was never written, with the composer
  // cleared and no error. It only reappears as missing on reload. `sendRoomMessage` throws in
  // the same situation; this is the sibling that didn't.
  if (!memberIds.includes(myProfileId)) throw new Error('You are not part of this conversation')

  // Blocking gate (parity with startConversation): startConversation refuses to OPEN a
  // thread when either party blocked the other, but a thread that pre-dates the block was
  // never re-checked here, so a blocked member could keep posting into it. For a 1:1
  // conversation, refuse the send if the two parties are blocked in either direction.
  const others = memberIds.filter((id) => id !== myProfileId)
  if (others.length === 1 && (await isBlockedBetween(myProfileId, others[0]))) {
    throw new Error('You cannot message this member')
  }

  // The error was previously not destructured at all, so RLS refusals, constraint violations and
  // transient DB errors all produced a normal return: the optimistic bubble stayed on screen, the
  // realtime INSERT echo never arrived because no row existed, and the member believed the message
  // had sent. `sendRoomMessage` (messages/rooms/actions.ts:186) has always checked this.
  const { data: inserted, error: insertError } = await admin
    .from('messages')
    .insert({
      conversation_id: conversationId,
      sender_id: myProfileId,
      body,
    })
    .select('id')
    .single()
  if (insertError) throw new Error(insertError.message)

  // Fold the DM onto the CRM timeline (fire-safe, idempotent). 1:1 only — `conversations` is
  // 1:1-only, so there is exactly one counterpart; a room (group) send is a separate path and is
  // intentionally not folded here (prioritize the 1:1 DM path per the Phase 1 plan).
  if (inserted?.id && others.length === 1) {
    await recordDmTouch(myProfileId, others[0], inserted.id as string)
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
  // 2026-09-05 (scan2 L5-07): this insert used to be unchecked, so a refused members write left a
  // room with no members (the creator included) and sent the creator to /messages/r/<id>, where
  // room-member gating shows nothing. Read the error; on failure take the room row back and fail
  // instead of redirecting into a room the creator cannot see.
  const { error: membersError } = await admin.from('room_members').insert(memberRows)
  if (membersError) {
    console.error('[startGroupConversation] room_members insert failed', {
      roomId: room.id,
      code: membersError.code,
      message: membersError.message,
    })
    const { error: undoError } = await admin.from('rooms').delete().eq('id', room.id as string)
    if (undoError) {
      // The delete was refused too; the empty room stays behind, and the log names it so it can
      // be cleaned up (`select r.id from rooms r left join room_members m on m.room_id = r.id
      // where m.room_id is null`).
      console.error('[startGroupConversation] empty room could not be removed', {
        roomId: room.id,
        code: undoError.code,
        message: undoError.message,
      })
    }
    throw new Error('Could not create the group chat. Try again.')
  }

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

// ── Leaving a conversation: one gate, two exits ───────────────────────────────────────────
// The delete is SAFE BY CONSTRUCTION rather than by an explicit membership check: it is scoped
// to `profile_id = <the caller>`, so the only row it can ever remove is the caller's own. That
// is the whole authorization story, and it lives here once so neither exit can drift away from
// it. Server-side, not UI-side: hiding the button is not a gate.
async function deleteMyParticipation(conversationId: string): Promise<void> {
  const myProfileId = await getMyProfileId()
  const admin = createAdminClient()

  await admin
    .from('conversation_participants')
    .delete()
    .eq('conversation_id', conversationId)
    .eq('profile_id', myProfileId)

  revalidatePath('/messages')
}

/** The NAVIGATING exit, used by the DM page's form. Unchanged behaviour: leave, then land on
 *  the inbox. Stays exactly as it was while the retirement flag is off and the page renders. */
export async function leaveConversation(conversationId: string) {
  await deleteMyParticipation(conversationId)
  redirect('/messages')
}

/**
 * The NON-NAVIGATING twin, for the chat dock (ADR-896 parity).
 *
 * `leaveConversation` cannot be reused from the dock: per
 * node_modules/next/dist/docs/01-app/03-api-reference/04-functions/redirect.md (line 11,
 * "When used in a Server Action, it will serve a 303 HTTP redirect response to the caller"),
 * and node_modules/next/dist/docs/01-app/02-guides/server-actions.md §48 ("Calls `redirect`.
 * The response navigates the router and streams the destination's RSC Payload"), invoking it
 * from a client component would navigate the member to /messages — the exact page the dock
 * exists to replace. Leaving from the dock must leave the member where they were standing.
 *
 * Same precedent as openDirectConversation/startConversation above: a redirect-free twin over
 * one shared core, rather than a second copy of the gate.
 *
 * Returns a result instead of throwing, for the same reason openDirectConversation does: a
 * thrown Error in a client-invoked action reaches the browser as an opaque production digest,
 * which is the wrong shape for a sentence a member is meant to read.
 */
export async function leaveConversationInPlace(
  conversationId: string,
): Promise<ActionResult<void>> {
  try {
    await deleteMyParticipation(conversationId)
    return ok()
  } catch {
    return fail('We could not leave this conversation. Try again.')
  }
}
