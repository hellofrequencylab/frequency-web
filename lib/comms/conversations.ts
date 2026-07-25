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
    // Reuse the open thread for (kind, counterpart, owner) WITHIN the same Space — a NULL space is the
    // platform lane. Scoping by space_id keeps one owner's two Spaces from ever sharing a thread to the
    // same address (PostgREST `.eq` never matches NULL, so a platform lookup must use `.is`).
    let q = convTable('comms_conversations')
      .select('id, ref')
      .eq('kind', input.kind)
      .eq('external_email', email)
      .eq('owner_profile_id', input.ownerProfileId)
      .neq('status', 'closed')
    q = input.spaceId ? q.eq('space_id', input.spaceId) : q.is('space_id', null)
    const existing = await q.order('last_activity_at', { ascending: false }).limit(1).maybeSingle()
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

/** The conversation fields the inbound router needs to route, anti-spoof-check, reopen, and notify. */
export interface ConversationRow {
  id: string
  ref: string
  status: string
  kind: string
  externalEmail: string | null
  ownerProfileId: string | null
  assignedTo: string | null
  memberProfileId: string | null
  contactId: string | null
  spaceId: string | null
  subject: string | null
}

const CONV_ROW_COLS =
  'id, ref, status, kind, external_email, owner_profile_id, assigned_to, member_profile_id, contact_id, space_id, subject'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toConversationRow(row: any): ConversationRow {
  return {
    id: String(row.id),
    ref: String(row.ref),
    status: String(row.status),
    kind: String(row.kind),
    externalEmail: (row.external_email as string) ?? null,
    ownerProfileId: (row.owner_profile_id as string) ?? null,
    assignedTo: (row.assigned_to as string) ?? null,
    memberProfileId: (row.member_profile_id as string) ?? null,
    contactId: (row.contact_id as string) ?? null,
    spaceId: (row.space_id as string) ?? null,
    subject: (row.subject as string) ?? null,
  }
}

/** Resolve a conversation by its public `ref` (the inbound routing key). FAIL-SAFE: null on miss/error. */
export async function getConversationByRef(ref: string | number): Promise<ConversationRow | null> {
  const key = typeof ref === 'number' ? ref : parseInt(String(ref), 10)
  if (!Number.isFinite(key) || key <= 0) return null
  try {
    const res = await convTable('comms_conversations').select(CONV_ROW_COLS).eq('ref', key).maybeSingle()
    return res?.data ? toConversationRow(res.data) : null
  } catch (err) {
    console.error('[comms] getConversationByRef failed:', err)
    return null
  }
}

/** Resolve a conversation by its uuid `id` (the workspace action key). FAIL-SAFE: null on miss/error. */
export async function getConversationById(id: string): Promise<ConversationRow | null> {
  const key = typeof id === 'string' ? id.trim() : ''
  if (!key) return null
  try {
    const res = await convTable('comms_conversations').select(CONV_ROW_COLS).eq('id', key).maybeSingle()
    return res?.data ? toConversationRow(res.data) : null
  } catch (err) {
    console.error('[comms] getConversationById failed:', err)
    return null
  }
}

/** Reopen a resolved/closed conversation when a new inbound message arrives (mirrors support reopen).
 *  A no-op for already-active statuses. Best-effort; never throws. */
export async function reopenConversationIfClosed(conversationId: string, currentStatus: string): Promise<void> {
  if (currentStatus !== 'resolved' && currentStatus !== 'closed') return
  try {
    await convTable('comms_conversations')
      .update({ status: 'open', resolved_at: null, updated_at: new Date().toISOString() })
      .eq('id', conversationId)
  } catch (err) {
    console.error('[comms] reopenConversationIfClosed failed (non-fatal):', err)
  }
}

/** Triage fields an operator can change from the workspace. */
export interface ConversationFieldPatch {
  status?: string
  priority?: string
  assignedTo?: string | null
}

/** Update a conversation's status / priority / assignee (workspace triage). Stamps `resolved_at` when the
 *  status becomes resolved/closed and clears it otherwise (mirrors support `updateTicketFields`). When the
 *  assignee changes, the caller also records an assignment-audit row (see `recordAssignment`). FAIL-SAFE. */
export async function updateConversationFields(id: string, patch: ConversationFieldPatch): Promise<boolean> {
  const set: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (patch.status !== undefined) {
    set.status = patch.status
    set.resolved_at = patch.status === 'resolved' || patch.status === 'closed' ? new Date().toISOString() : null
  }
  if (patch.priority !== undefined) set.priority = patch.priority
  if (patch.assignedTo !== undefined) set.assigned_to = patch.assignedTo
  try {
    const res = await convTable('comms_conversations').update(set).eq('id', id)
    return !res?.error
  } catch (err) {
    console.error('[comms] updateConversationFields failed:', err)
    return false
  }
}

/** Append an assignment-audit row (the append-only "trade" trail). Best-effort; never throws. */
export async function recordAssignment(input: {
  conversationId: string
  assignedTo: string | null
  assignedBy: string | null
  reason?: string | null
}): Promise<void> {
  try {
    const db = createAdminClient() as unknown as { from: (n: string) => any } // eslint-disable-line @typescript-eslint/no-explicit-any
    await db.from('comms_assignments').insert({
      conversation_id: input.conversationId,
      assigned_to: input.assignedTo,
      assigned_by: input.assignedBy,
      reason: input.reason ?? 'manual',
    })
  } catch (err) {
    console.error('[comms] recordAssignment failed (non-fatal):', err)
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
  /** Delivery state for an outbound message. Defaults to `'sent'` (the immediate-send path). The batch
   *  path writes `'queued'` so the flush cron can coalesce a burst into one email, then flip it to `'sent'`. */
  deliveryStatus?: string
  /** Per-message detail (e.g. `{ sender_mismatch: true }` from the inbound anti-spoof check). */
  metadata?: Record<string, unknown> | null
  /** When set, the non-internal message is mirrored onto the CRM person-timeline (best-effort). */
  mirror?: {
    ownerProfileId: string
    subjectKind: 'profile' | 'contact' | 'network_contact'
    subjectId: string
    spaceId?: string | null
    subject?: string | null
  } | null
}

/** The outcome of an append. `{ id }` = written. `{ duplicate: true }` = a unique(external_message_id)
 *  replay (idempotent no-op, terminal). `null` = a transient/unknown failure the caller may retry.
 *  Distinguishing the last two matters for the inbound webhook: a duplicate is acked, a transient failure
 *  must be surfaced so the provider redelivers instead of the reply being silently lost. */
export type AppendOutcome = { id: string } | { duplicate: true } | null

/** Append a message to a conversation, bump its activity, and (best-effort) mirror to the timeline.
 *  Returns `{ id }` on success, `{ duplicate: true }` on an external_message_id replay, or `null` on a
 *  transient/unknown failure (callers that only care about success still treat any non-`{id}` as a no-op). */
export async function appendConversationMessage(input: AppendMessageInput): Promise<AppendOutcome> {
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
        ...(input.deliveryStatus ? { delivery_status: input.deliveryStatus } : {}),
        ...(input.metadata ? { metadata: input.metadata } : {}),
      })
      .select('id')
      .single()
    // A unique(external_message_id) conflict (Postgres 23505) = a replayed inbound → idempotent no-op.
    // Any OTHER error is transient/unknown → return null so the inbound webhook can ask for redelivery.
    if (ins?.error) {
      return (ins.error as { code?: string } | null)?.code === '23505' ? { duplicate: true } : null
    }
    if (!ins?.data) return null
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
