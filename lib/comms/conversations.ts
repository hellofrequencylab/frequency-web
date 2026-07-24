// The conversations SPINE (ADR-812) — open/append the unified conversation objects that carry every
// in-house message. Server-only; writes through the service-role admin client (same pattern as
// lib/support/store.ts). Each non-internal message is mirrored to the CRM person-timeline via the single
// front door recordContactInteraction, so contact_interactions stays the denormalized view with no
// second source of truth.
//
// Dormant until a caller runs it (the reply_mode='conversation' send branch, the inbox/support reply, the
// inbound webhook). The tables land in migration 20261210000000_conversations_spine.sql.

import { randomUUID } from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { recordContactInteraction } from '@/lib/crm/interactions'

export type ConversationKind =
  | 'support' | 'crm' | 'leader' | 'broadcast' | 'dm' | 'announcement' | 'system'
export type MessageDirection = 'inbound' | 'outbound' | 'internal'
export type MessageAuthorKind = 'member' | 'staff' | 'leader' | 'vera' | 'system' | 'contact'

/** The Message-ID domain (the verified sending domain). Threading identity, not a routable address. */
const MESSAGE_ID_HOST = process.env.EMAIL_MESSAGE_ID_HOST ?? 'send.frequencylocal.com'

/** A stable RFC5322 Message-ID for an outbound conversation message: `<conv.<ref>.<uuid>@host>`. */
export function newConversationMessageId(ref: string | number): string {
  return `<conv.${ref}.${randomUUID()}@${MESSAGE_ID_HOST}>`
}

/** Untyped admin handle — the comms_* spine tables are not in the generated Database types yet, so the
 *  typed `.from()` overloads reject their names. Cast the client to an untyped `.from` (ADR-246). */
function convTable(name: 'comms_conversations' | 'comms_messages') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as unknown as { from: (n: string) => any }
  return db.from(name)
}

export interface OpenConversationInput {
  kind: ConversationKind
  /** The counterpart's email (lowercased inside). The thread key together with kind + owner. */
  externalEmail: string
  /** The house-side owner of the sender trail (leader / operator / assignee). */
  ownerProfileId: string
  subject: string
  contactId?: string | null
  memberProfileId?: string | null
  spaceId?: string | null
  channel?: string
  metadata?: Record<string, unknown>
}

/** Find the open conversation for (kind, counterpart, owner), else create one. FAIL-SAFE: null on error. */
export async function openOrGetConversation(
  input: OpenConversationInput,
): Promise<{ id: string; ref: string; created: boolean } | null> {
  const email = input.externalEmail.trim().toLowerCase()
  if (!email || !input.ownerProfileId) return null
  // A counterparty identity is required by the table CHECK — a send recipient always has one of these.
  const subjectId = input.memberProfileId ?? input.contactId ?? null
  if (!subjectId) return null

  try {
    const existing = await convTable('comms_conversations')
      .select('id, ref')
      .eq('kind', input.kind)
      .eq('external_email', email)
      .eq('owner_profile_id', input.ownerProfileId)
      .neq('status', 'closed')
      .order('last_activity_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (existing?.data) {
      return { id: String(existing.data.id), ref: String(existing.data.ref), created: false }
    }

    const ins = await convTable('comms_conversations')
      .insert({
        kind: input.kind,
        subject: (input.subject || '(no subject)').slice(0, 300),
        channel: input.channel ?? 'email',
        external_email: email,
        subject_kind: input.memberProfileId ? 'profile' : 'contact',
        subject_id: subjectId,
        member_profile_id: input.memberProfileId ?? null,
        contact_id: input.contactId ?? null,
        owner_profile_id: input.ownerProfileId,
        created_by: input.ownerProfileId,
        space_id: input.spaceId ?? null,
        metadata: input.metadata ?? {},
        last_activity_at: new Date().toISOString(),
      })
      .select('id, ref')
      .single()
    if (ins?.error || !ins?.data) return null
    return { id: String(ins.data.id), ref: String(ins.data.ref), created: true }
  } catch (err) {
    console.error('[comms] openOrGetConversation failed:', err)
    return null
  }
}

export interface AppendMessageInput {
  conversationId: string
  direction: MessageDirection
  authorKind: MessageAuthorKind
  authorId?: string | null
  authorContactId?: string | null
  body: string
  bodyHtml?: string | null
  channel?: string
  externalMessageId?: string | null
  inReplyTo?: string | null
  referencesIds?: string[] | null
  isInternal?: boolean
  /** When set, the non-internal message is mirrored onto the CRM person-timeline (best-effort). */
  mirror?: {
    ownerProfileId: string
    subjectKind: 'profile' | 'contact' | 'network_contact'
    subjectId: string
    spaceId?: string | null
    subject?: string | null
  } | null
}

/** Append a message to a conversation, bump its activity, and (best-effort) mirror to the timeline.
 *  Returns null on a unique(external_message_id) replay conflict or any error — callers treat null as a
 *  no-op, never a failure. */
export async function appendConversationMessage(
  input: AppendMessageInput,
): Promise<{ id: string } | null> {
  try {
    const ins = await convTable('comms_messages')
      .insert({
        conversation_id: input.conversationId,
        direction: input.direction,
        author_kind: input.authorKind,
        author_id: input.authorId ?? null,
        author_contact_id: input.authorContactId ?? null,
        channel: input.channel ?? 'email',
        body: input.body,
        body_html: input.bodyHtml ?? null,
        is_internal: input.isInternal ?? false,
        external_message_id: input.externalMessageId ?? null,
        in_reply_to: input.inReplyTo ?? null,
        references_ids: input.referencesIds ?? null,
      })
      .select('id')
      .single()
    // A unique(external_message_id) conflict = a replayed inbound → treat as an idempotent no-op.
    if (ins?.error || !ins?.data) return null
    const messageId = String(ins.data.id)

    // Bump the conversation's activity clock + the direction-specific timestamp.
    const now = new Date().toISOString()
    const bump: Record<string, unknown> = { last_activity_at: now, updated_at: now }
    if (input.direction === 'inbound') bump.last_inbound_at = now
    if (input.direction === 'outbound') bump.last_outbound_at = now
    await convTable('comms_conversations').update(bump).eq('id', input.conversationId)

    // Mirror non-internal messages to the CRM person-timeline (never blocks the write).
    if (!input.isInternal && input.mirror) {
      try {
        await recordContactInteraction(
          {
            ownerProfileId: input.mirror.ownerProfileId,
            subjectKind: input.mirror.subjectKind,
            subjectId: input.mirror.subjectId,
            channel: (input.channel ?? 'email') as never,
            direction: input.direction === 'internal' ? 'internal' : input.direction,
            summary: input.mirror.subject ?? null,
            body: input.body,
            source: 'crm_activity' as never,
            idempotencyKey: `conv-msg:${messageId}`,
          },
          input.mirror.spaceId ?? null,
        )
      } catch (err) {
        console.error('[comms] timeline mirror failed (non-fatal):', err)
      }
    }
    return { id: messageId }
  } catch (err) {
    console.error('[comms] appendConversationMessage failed:', err)
    return null
  }
}
