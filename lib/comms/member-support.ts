import 'server-only'

// MEMBER-FACING support inbox (chat consolidation). The comms spine already stores a signed-in member's
// support conversations bound to their profile (member_profile_id), and RLS already lets a member SELECT
// their own (`member_profile_id = get_my_profile_id()`), but until now NO member surface read it — a
// member could never see the support request they sent. This module is that reader + an authed reply,
// so a submitted support request shows as a ticketed conversation in the member's own inbox.
//
// Reads go through the USER client (RLS enforces "my conversations only" — defense in depth, not the
// admin client). The reply WRITE re-verifies ownership in code, then appends through the shared spine
// helper (admin client, so the message threads + mirrors identically to every other channel).

import { createClient } from '@/lib/supabase/server'
import { getMyProfileId } from '@/lib/auth'
import { appendConversationMessage, getConversationByRef } from '@/lib/comms/conversations'
import { cleanConversationBody } from '@/lib/comms/message-body'
import type { ChatMessage } from '@/lib/comms/support-chat'

export interface MemberSupportThread {
  ref: string
  subject: string
  status: string
  lastSnippet: string
  lastAt: string
}

export interface MemberSupportDetail {
  ref: string
  subject: string
  status: string
  messages: ChatMessage[]
}

function authorOf(direction: string): ChatMessage['author'] {
  if (direction === 'outbound') return 'staff'
  if (direction === 'inbound') return 'visitor'
  return 'system'
}

/** The signed-in member's own support conversations (spine, member-bound), newest first. RLS-scoped to
 *  the caller. FAIL-SAFE: [] when signed out or on error. */
export async function listMySupportThreads(limit = 20): Promise<MemberSupportThread[]> {
  try {
    const me = await getMyProfileId()
    if (!me) return []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = (await createClient()) as unknown as { from: (t: string) => any }
    const { data } = await db
      .from('comms_conversations')
      .select('ref, subject, status, last_activity_at')
      .eq('member_profile_id', me)
      .neq('kind', 'dm')
      .order('last_activity_at', { ascending: false })
      .limit(limit)
    const rows = (data as { ref: number | string; subject: string; status: string; last_activity_at: string }[] | null) ?? []
    return rows.map((r) => ({
      ref: String(r.ref),
      subject: r.subject || 'Support request',
      status: r.status,
      lastSnippet: '',
      lastAt: r.last_activity_at,
    }))
  } catch {
    return []
  }
}

/** One of the member's own support threads, oldest-message-first. Ownership enforced by RLS on the read.
 *  FAIL-SAFE: null when the thread is not the caller's / on error. */
export async function getMySupportThread(ref: string): Promise<MemberSupportDetail | null> {
  try {
    const me = await getMyProfileId()
    if (!me) return null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = (await createClient()) as unknown as { from: (t: string) => any }
    const { data: conv } = await db
      .from('comms_conversations')
      .select('id, ref, subject, status, member_profile_id')
      .eq('ref', ref)
      .eq('member_profile_id', me) // defense in depth on top of RLS
      .maybeSingle()
    if (!conv) return null
    const { data: msgs } = await db
      .from('comms_messages')
      .select('id, direction, body, is_internal, created_at')
      .eq('conversation_id', conv.id)
      .eq('is_internal', false)
      .order('created_at', { ascending: true })
      .limit(200)
    const messages = ((msgs as { id: string; direction: string; body: string; created_at: string }[] | null) ?? []).map((m) => ({
      id: String(m.id),
      author: authorOf(m.direction),
      body: cleanConversationBody(m.body),
      at: m.created_at,
    }))
    return { ref: String(conv.ref), subject: conv.subject || 'Support request', status: conv.status, messages }
  } catch {
    return null
  }
}

/** Post a reply to the member's own support thread. Re-verifies the conversation belongs to the caller
 *  (member_profile_id), then appends through the shared spine helper. Returns the stored message.
 *  FAIL-SAFE: null when signed out / not the caller's thread / empty. */
export async function postMySupportMessage(ref: string, body: string): Promise<ChatMessage | null> {
  const me = await getMyProfileId()
  if (!me) return null
  const text = (body ?? '').trim().slice(0, 4000)
  if (!text) return null
  const conv = await getConversationByRef(ref)
  if (!conv || conv.memberProfileId !== me) return null // ownership gate
  const out = await appendConversationMessage({
    conversationId: conv.id,
    direction: 'inbound',
    authorKind: 'member',
    authorId: me,
    body: text,
    channel: 'in_app',
  })
  if (!out || !('id' in out)) return null
  return { id: out.id, author: 'visitor', body: text, at: new Date().toISOString() }
}
