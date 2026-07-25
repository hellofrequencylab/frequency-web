import 'server-only'

// Server helpers for the anonymous live-chat widget (ADR-816). A chat is just a conversation on the comms
// spine (channel `in_app`, platform-scoped, owned by the CRM inbox owner), so it lands in the operator
// Conversations inbox and logs on the contact card exactly like an email thread. The visitor is identified
// only by the capability token (lib/comms/chat-token) — no account required. Realtime message fan-out and
// typing ride Supabase Broadcast on the client (channel named by the token); this layer only PERSISTS +
// serves history, which is the durable source of truth on reload.

import { createAdminClient } from '@/lib/supabase/admin'
import {
  openOrGetConversation,
  appendConversationMessage,
  getConversationByRef,
  reopenConversationIfClosed,
} from '@/lib/comms/conversations'
import { makeChatToken, verifyChatToken } from '@/lib/comms/chat-token'
import { cleanConversationBody } from '@/lib/comms/message-body'
import { escapeLike } from '@/lib/search-sanitize'
import { loadRootSpaceId } from '@/lib/spaces/store'

/** The platform profile that owns an anonymous chat thread (same env the inbound webhook uses). */
function inboxOwner(): string | null {
  return process.env.CRM_INBOX_OWNER_PROFILE_ID ?? null
}

/** Resolve-or-create the PLATFORM-lane contact for a visitor email, so the chat threads onto a real
 *  contact card and satisfies the spine's counterparty CHECK (openOrGetConversation returns null
 *  without a subject). TENANCY (meta-scan CRM audit): the lookup is pinned to the platform lane
 *  (space_id NULL — the ADR-624 root membrane) so a visitor whose address also exists as some
 *  tenant Space's lead never gets the platform chat bound to that tenant's CRM row. FAIL-SAFE: null. */
async function resolveOrCreateContactId(email: string, name: string): Promise<string | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = createAdminClient() as unknown as { from: (t: string) => any }
    // The platform lane = the ROOT space row (the tenancy trigger stamps root) or a legacy NULL row.
    const rootId = await loadRootSpaceId()
    let q = db
      .from('contacts')
      .select('id')
      .ilike('email', escapeLike(email))
    q = rootId ? q.or(`space_id.is.null,space_id.eq.${rootId}`) : q.is('space_id', null)
    const existing = await q.order('created_at', { ascending: false }).limit(1)
    const hit = existing?.data?.[0]?.id
    if (hit) return String(hit)
    const ins = await db
      .from('contacts')
      .insert({ email, display_name: name, source: 'support_chat' })
      .select('id')
      .single()
    return ins?.data?.id ? String(ins.data.id) : null
  } catch {
    return null
  }
}

export type ChatAuthor = 'visitor' | 'staff' | 'system'
export interface ChatMessage {
  id: string
  author: ChatAuthor
  body: string
  at: string
}

function authorOf(direction: string): ChatAuthor {
  if (direction === 'outbound') return 'staff'
  if (direction === 'inbound') return 'visitor'
  return 'system'
}

/** Start (or resume) a visitor's chat. Returns the conversation ref + its capability token. FAIL-SAFE: null
 *  when the platform inbox owner is unset or the email is unusable. */
export async function startSupportChat(input: {
  name: string
  email: string
  message?: string
}): Promise<{ ref: string; token: string } | null> {
  const owner = inboxOwner()
  if (!owner) return null
  const email = (input.email ?? '').trim().toLowerCase()
  const name = (input.name ?? '').trim().slice(0, 120) || 'Visitor'
  if (!email || !email.includes('@') || email.length > 254) return null

  // The spine requires a counterparty (subject_id) — resolve-or-create the visitor's contact first, else
  // openOrGetConversation returns null and the whole chat is unavailable.
  const contactId = await resolveOrCreateContactId(email, name)
  if (!contactId) return null

  const conv = await openOrGetConversation({
    kind: 'crm',
    externalEmail: email,
    ownerProfileId: owner,
    contactId,
    subject: `Live chat with ${name}`,
    channel: 'in_app',
    metadata: { source: 'support_chat', visitor_name: name },
  })
  if (!conv) return null

  const body = (input.message ?? '').trim().slice(0, 4000)
  if (body) {
    await appendConversationMessage({
      conversationId: conv.id,
      direction: 'inbound',
      authorKind: 'contact',
      body,
      channel: 'in_app',
    })
  }
  return { ref: conv.ref, token: makeChatToken(conv.ref) }
}

/** Persist a visitor's message. Token-gated. Returns the stored message (for the sender's optimistic echo). */
export async function postSupportChatMessage(input: {
  ref: string
  token: string
  body: string
}): Promise<ChatMessage | null> {
  if (!verifyChatToken(input.ref, input.token)) return null
  const conv = await getConversationByRef(input.ref)
  if (!conv) return null
  const body = (input.body ?? '').trim().slice(0, 4000)
  if (!body) return null

  const out = await appendConversationMessage({
    conversationId: conv.id,
    direction: 'inbound',
    authorKind: 'contact',
    body,
    channel: 'in_app',
  })
  if (!out || !('id' in out)) return null
  await reopenConversationIfClosed(conv.id, conv.status)
  return { id: out.id, author: 'visitor', body, at: new Date().toISOString() }
}

/** The persisted transcript (durable source of truth). Token-gated. Bodies cleaned for display. */
export async function loadSupportChatHistory(input: { ref: string; token: string }): Promise<ChatMessage[]> {
  if (!verifyChatToken(input.ref, input.token)) return []
  const conv = await getConversationByRef(input.ref)
  if (!conv) return []
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = createAdminClient() as unknown as { from: (t: string) => any }
    const { data } = await db
      .from('comms_messages')
      .select('id, direction, body, is_internal, created_at')
      .eq('conversation_id', conv.id)
      .eq('is_internal', false)
      .order('created_at', { ascending: true })
      .limit(200)
    return ((data as { id: string; direction: string; body: string; created_at: string }[] | null) ?? []).map((m) => ({
      id: String(m.id),
      author: authorOf(m.direction),
      body: cleanConversationBody(m.body),
      at: m.created_at,
    }))
  } catch {
    return []
  }
}
