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
    const db = createAdminClient()
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

/** Resolve a member's own display name + account email for a member-bound support conversation, so the
 *  caller only needs to pass the profile id. FAIL-SAFE: nulls on any error. */
async function resolveMemberIdentity(profileId: string): Promise<{ name: string | null; email: string | null }> {
  try {
    const admin = createAdminClient()
    const { data: profile } = await admin.from('profiles').select('display_name, auth_user_id').eq('id', profileId).maybeSingle()
    const name = profile?.display_name ?? null
    let email: string | null = null
    if (profile?.auth_user_id) {
      const { data } = await admin.auth.admin.getUserById(profile.auth_user_id)
      email = data?.user?.email ?? null
    }
    return { name, email }
  } catch {
    return { name: null, email: null }
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

/** Start (or resume) a support conversation. Returns the conversation ref + its capability token.
 *  FAIL-SAFE: null when the platform inbox owner is unset or the email is unusable.
 *
 *  MEMBER-BOUND (consolidation): when `memberProfileId` is passed (a SIGNED-IN sender, resolved by the
 *  action), the conversation binds to that profile (`member_profile_id` / `subject_kind:'profile'`) with
 *  kind `support`, so it appears in the member's OWN inbox under the spine's member RLS
 *  (`member_profile_id = get_my_profile_id()`) and the opening message is authored as the member. An
 *  ANONYMOUS visitor stays contact-based (kind `crm`), exactly as before. Either way the operator sees it
 *  in the CRM Conversations workspace. */
export async function startSupportChat(input: {
  name: string
  email: string
  message?: string
  /** The signed-in sender's profile id (from the action's optional-auth lookup); null/undefined = anon. */
  memberProfileId?: string | null
}): Promise<{ ref: string; token: string } | null> {
  const owner = inboxOwner()
  if (!owner) return null
  const memberProfileId = input.memberProfileId ?? null

  // A member-bound request resolves the member's own name + account email from their profile when the
  // caller didn't pass them (the member action only has the profile id).
  let rawName = input.name
  let rawEmail = input.email
  if (memberProfileId && (!rawEmail || !rawName)) {
    const identity = await resolveMemberIdentity(memberProfileId)
    rawEmail = rawEmail || identity.email || ''
    rawName = rawName || identity.name || ''
  }

  const email = (rawEmail ?? '').trim().toLowerCase()
  const name = (rawName ?? '').trim().slice(0, 120) || (memberProfileId ? 'Member' : 'Visitor')
  if (!email || !email.includes('@') || email.length > 254) return null
  // The spine requires a counterparty (subject_id): a member binds to their profile; an anonymous
  // visitor resolves-or-creates a platform contact. Without either, openOrGetConversation returns null.
  const contactId = memberProfileId ? null : await resolveOrCreateContactId(email, name)
  if (!memberProfileId && !contactId) return null

  const conv = await openOrGetConversation({
    kind: memberProfileId ? 'support' : 'crm',
    externalEmail: email,
    ownerProfileId: owner,
    contactId,
    memberProfileId,
    subject: memberProfileId ? `Support request from ${name}` : `Live chat with ${name}`,
    channel: 'in_app',
    metadata: { source: 'support_chat', visitor_name: name },
  })
  if (!conv) return null

  const body = (input.message ?? '').trim().slice(0, 4000)
  if (body) {
    await appendConversationMessage({
      conversationId: conv.id,
      direction: 'inbound',
      authorKind: memberProfileId ? 'member' : 'contact',
      authorId: memberProfileId,
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
    const db = createAdminClient()
    const { data } = await db
      .from('comms_messages')
      .select('id, direction, body, is_internal, created_at')
      .eq('conversation_id', conv.id)
      .eq('is_internal', false)
      .order('created_at', { ascending: true })
      .limit(200)
    return (data ?? []).map((m) => ({
      id: String(m.id),
      author: authorOf(m.direction),
      body: cleanConversationBody(m.body),
      at: m.created_at,
    }))
  } catch {
    return []
  }
}
