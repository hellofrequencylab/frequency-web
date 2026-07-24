// INBOUND CONVERSATION ROUTER (ADR-812, Phase 2) — the RECEIVE half of the ticketed comms loop.
//
// A ticketed 1:1 send (Phase 1) sets `Reply-To: reply+<ref>-<hmac>@reply.frequencylocal.com`. When the
// recipient replies, the provider (Resend inbound) POSTs the received email to the inbound-email webhook.
// This module turns that payload back into a thread append:
//
//   parse → loop-guard → parse the plus-token → VERIFY the token → resolve the conversation by ref →
//   append the inbound message (deduped on the provider Message-ID) → reopen if closed → notify the agent.
//
// Routing is by the PLUS-TOKEN (primary): unforgeable + non-enumerable + O(1). Email threading headers
// (In-Reply-To / References) are captured for the client's benefit but are NOT the routing key. When no
// reply-token is present, the router returns `no_token` and the webhook falls back to the legacy
// from-address contact-match (lib/crm/inbox.ts `recordInboundEmail`) — nothing about today's flow regresses.
//
// SHAPE (mirrors lib/crm/inbox.ts): the PURE shapers (`parseInboundMessage`, `isAutomatedMessage`) have no
// Supabase/Next imports and are unit-tested in isolation; the IO (`routeInboundReply`) reaches the spine
// lib + the notifications table. FAIL-SAFE throughout: a write blip returns a status, never throws.

import { createAdminClient } from '@/lib/supabase/admin'
import { parseConversationReplyAddress, verifyConversationToken } from '@/lib/comms/reply-address'
import {
  getConversationByRef,
  appendConversationMessage,
  reopenConversationIfClosed,
} from '@/lib/comms/conversations'

/** The normalized inbound message the router works from — a superset of the legacy {from,subject,text}. */
export interface ParsedInboundMessage {
  /** Lowercased sender address (the anti-spoof anchor + the contact-match fallback key). */
  from: string
  /** Every recipient address we can see (`to` + `received_for` envelope), for plus-token routing. */
  recipients: string[]
  subject: string | null
  text: string | null
  /** Provider Message-ID of THIS message — the idempotency key for the dedupe unique index. */
  messageId: string | null
  inReplyTo: string | null
  referencesIds: string[] | null
  /** RFC 3834 `Auto-Submitted` header value, lowercased (`no` when a human sent it). */
  autoSubmitted: string | null
  /** `Precedence` header, lowercased (`bulk`/`list`/`junk` mark automated mail). */
  precedence: string | null
}

/** Pull a lowercased bare address out of a string (`Name <a@b>` or `a@b`) or a `{address}`/`{email}` object.
 *  Linear indexOf, NOT a regex (ReDoS-safe on uncontrolled input); rejects embedded control chars. */
function extractAddress(raw: unknown): string | null {
  if (typeof raw === 'string') {
    const s = raw.slice(0, 320)
    const lt = s.indexOf('<')
    let inner = s
    if (lt >= 0) {
      const gt = s.indexOf('>', lt + 1)
      if (gt > lt) inner = s.slice(lt + 1, gt)
    }
    const candidate = inner.trim().toLowerCase()
    for (let i = 0; i < candidate.length; i++) {
      const c = candidate.charCodeAt(i)
      if (c <= 0x1f || c === 0x7f) return null
    }
    return candidate.includes('@') ? candidate : null
  }
  if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>
    return extractAddress(obj.address ?? obj.email ?? null)
  }
  return null
}

/** Collect addresses from a field that may be a string, a comma list, or an array of strings/objects. */
function collectAddresses(raw: unknown): string[] {
  const out: string[] = []
  const push = (v: unknown) => {
    const a = extractAddress(v)
    if (a) out.push(a)
  }
  if (Array.isArray(raw)) raw.forEach(push)
  else if (typeof raw === 'string') raw.split(',').forEach((p) => push(p))
  else if (raw && typeof raw === 'object') push(raw)
  return out
}

/** Case-insensitive header lookup over a `Record<string,string>` (Resend inbound `data.headers`) OR an
 *  array of `{name,value}` (raw MIME shape). Returns the first match, trimmed; null when absent. */
function headerValue(headers: unknown, name: string): string | null {
  const want = name.toLowerCase()
  if (Array.isArray(headers)) {
    for (const h of headers) {
      if (h && typeof h === 'object') {
        const obj = h as Record<string, unknown>
        const n = typeof obj.name === 'string' ? obj.name.toLowerCase() : ''
        if (n === want && typeof obj.value === 'string') return obj.value.trim()
      }
    }
    return null
  }
  if (headers && typeof headers === 'object') {
    for (const [k, v] of Object.entries(headers as Record<string, unknown>)) {
      if (k.toLowerCase() === want && typeof v === 'string') return v.trim()
    }
  }
  return null
}

/** Split an RFC 5322 `References` chain into individual `<message-id>` tokens (whitespace-separated). */
function parseReferences(raw: string | null): string[] | null {
  if (!raw) return null
  const ids = raw
    .split(/\s+/)
    .map((s) => s.trim())
    .filter((s) => s.startsWith('<') && s.endsWith('>') && s.length > 2)
  return ids.length ? ids.slice(0, 50) : null
}

/**
 * Parse a provider inbound-email payload into the normalized shape, or null when there is no usable
 * sender. PURE + defensive: reads the Resend `email.received` webhook (`data.from`, `data.to[]`,
 * `data.received_for[]`, `data.message_id`, `data.subject`) and the fuller received-email resource
 * (`data.text`/`data.html`, `data.headers` object) without trusting any field. Deterministic; tested.
 */
export function parseInboundMessage(payload: unknown): ParsedInboundMessage | null {
  if (!payload || typeof payload !== 'object') return null
  const root = payload as Record<string, unknown>
  const data = (root.data && typeof root.data === 'object' ? root.data : root) as Record<string, unknown>

  const from = extractAddress(data.from) ?? extractAddress(root.from)
  if (!from) return null

  // The plus-token can arrive on any recipient line. `received_for` is the envelope recipient (the most
  // reliable), then the header `to`/`cc`. We gather them all and let the codec find our reply address.
  const recipients = [
    ...collectAddresses(data.received_for ?? root.received_for),
    ...collectAddresses(data.to ?? root.to),
    ...collectAddresses(data.cc ?? root.cc),
  ]

  const subjectRaw = data.subject ?? root.subject
  const subject = typeof subjectRaw === 'string' && subjectRaw.trim() ? subjectRaw.trim().slice(0, 280) : null

  const textRaw = data.text ?? root.text ?? data.html ?? root.html
  const text = typeof textRaw === 'string' && textRaw.trim() ? textRaw.trim().slice(0, 20_000) : null

  const messageIdRaw = data.message_id ?? root.message_id ?? headerValue(data.headers, 'Message-ID')
  const messageId = typeof messageIdRaw === 'string' && messageIdRaw.trim() ? messageIdRaw.trim().slice(0, 998) : null

  const headers = data.headers ?? root.headers
  const inReplyToRaw = headerValue(headers, 'In-Reply-To')
  const inReplyTo = inReplyToRaw ? inReplyToRaw.slice(0, 998) : null
  const referencesIds = parseReferences(headerValue(headers, 'References'))
  const autoSubmitted = headerValue(headers, 'Auto-Submitted')?.toLowerCase() ?? null
  const precedence = headerValue(headers, 'Precedence')?.toLowerCase() ?? null

  return { from, recipients, subject, text, messageId, inReplyTo, referencesIds, autoSubmitted, precedence }
}

/**
 * Loop guard (RFC 3834): true when the message is machine-generated — an auto-reply, vacation responder,
 * bulk blast, or a bounce/delivery notice — and must NOT be threaded (else two robots ping-pong forever
 * and a bounce lands as if the member replied). PURE.
 */
export function isAutomatedMessage(parsed: ParsedInboundMessage): boolean {
  // `Auto-Submitted: auto-replied|auto-generated` (anything but `no`) ⇒ automated.
  if (parsed.autoSubmitted && parsed.autoSubmitted !== 'no') return true
  // Bulk / list / junk precedence ⇒ not a personal reply.
  if (parsed.precedence && ['bulk', 'list', 'junk', 'auto_reply'].includes(parsed.precedence)) return true
  // Null-sender bounces + the well-known daemon mailboxes.
  const local = parsed.from.split('@')[0] ?? ''
  if (local === 'mailer-daemon' || local === 'postmaster' || local === 'no-reply' || local === 'noreply') return true
  if (parsed.from === '<>' || parsed.from === '') return true
  return false
}

export type InboundRouteStatus =
  | 'recorded'
  | 'duplicate'
  | 'no_token'
  | 'bad_token'
  | 'no_conversation'
  | 'dropped_automated'
  | 'error'

export interface InboundRouteResult {
  status: InboundRouteStatus
  conversationId?: string
  ref?: string
  /** True when the sender address did not match the conversation's counterpart (recorded, but flagged). */
  senderMismatch?: boolean
}

/**
 * Route a parsed inbound message into its conversation thread. Returns `no_token` when the message is not
 * addressed to one of our reply addresses (the webhook then falls back to the contact-match path); every
 * other outcome is terminal for the conversation path. FAIL-SAFE: never throws.
 */
export async function routeInboundReply(parsed: ParsedInboundMessage): Promise<InboundRouteResult> {
  try {
    // 1) Is this even one of our reply addresses? If not, hand back to the legacy contact-match fallback.
    const token = parseConversationReplyAddress(parsed.recipients)
    if (!token) return { status: 'no_token' }

    // 2) Automated mail never threads (checked after we know it targets a thread, so bounces to a reply
    //    address are dropped rather than mis-recorded as the member replying).
    if (isAutomatedMessage(parsed)) return { status: 'dropped_automated' }

    // 3) VERIFY the token. A present-but-invalid tag is a forgery or a rotated secret — drop it, and do
    //    NOT fall through to contact-match (the address clearly targeted our reply domain).
    if (!verifyConversationToken(token.ref, token.token)) return { status: 'bad_token' }

    // 4) Resolve the thread.
    const conv = await getConversationByRef(token.ref)
    if (!conv) return { status: 'no_conversation', ref: token.ref }

    // Anti-spoof: the token authenticates the THREAD binding (unforgeable), so a from-address that differs
    // from the counterpart we mailed is recorded but FLAGGED (a member may legitimately reply from an
    // alias; dropping would lose real replies). An agent sees the flag in the message metadata.
    const senderMismatch = !!conv.externalEmail && conv.externalEmail.toLowerCase() !== parsed.from

    // 5) Append the inbound message. author = the counterpart (member profile OR external contact).
    const authorKind = conv.memberProfileId ? 'member' : 'contact'
    const subjectId = conv.memberProfileId ?? conv.contactId
    const appended = await appendConversationMessage({
      conversationId: conv.id,
      direction: 'inbound',
      authorKind,
      authorId: conv.memberProfileId ?? null,
      authorContactId: conv.memberProfileId ? null : conv.contactId,
      body: parsed.text ?? '(no message body)',
      externalMessageId: parsed.messageId,
      inReplyTo: parsed.inReplyTo,
      referencesIds: parsed.referencesIds,
      // Persist the anti-spoof flag on the message so an agent sees "replied from a different address".
      metadata: senderMismatch ? { sender_mismatch: true, from: parsed.from } : null,
      // Mirror to the CRM person-timeline only when we have an owner + a subject to hang it on.
      mirror:
        conv.ownerProfileId && subjectId
          ? {
              ownerProfileId: conv.ownerProfileId,
              subjectKind: conv.memberProfileId ? 'profile' : 'contact',
              subjectId,
              spaceId: conv.spaceId,
              subject: conv.subject,
            }
          : null,
    })
    // A unique(external_message_id) conflict ⇒ the provider redelivered ⇒ idempotent no-op.
    if (!appended) return { status: 'duplicate', conversationId: conv.id, ref: conv.ref }

    // 6) A new inbound message reopens a resolved/closed thread (mirrors support reopen).
    await reopenConversationIfClosed(conv.id, conv.status)

    // 7) Notify the agent a reply is owed (assignee first, else the sender-trail owner). Best-effort.
    await notifyConversationReply(conv.assignedTo ?? conv.ownerProfileId, conv.id, conv.ref, conv.subject)

    return { status: 'recorded', conversationId: conv.id, ref: conv.ref, senderMismatch }
  } catch (err) {
    console.error('[comms] routeInboundReply failed:', err)
    return { status: 'error' }
  }
}

/** Ping the agent that a conversation has a new inbound reply. Best-effort; never throws. */
async function notifyConversationReply(
  recipientId: string | null,
  conversationId: string,
  ref: string,
  subject: string | null,
): Promise<void> {
  if (!recipientId) return
  try {
    const admin = createAdminClient() as unknown as {
      from: (t: string) => { insert: (row: Record<string, unknown>) => Promise<{ error: unknown }> }
    }
    await admin.from('notifications').insert({
      recipient_id: recipientId,
      type: 'conversation_reply',
      reference_type: 'conversation',
      reference_id: conversationId,
      body: `replied to conversation #${ref}${subject ? `: ${subject.slice(0, 80)}` : ''}`,
    })
  } catch {
    /* best-effort: the reply is already on the thread regardless of the alert */
  }
}
