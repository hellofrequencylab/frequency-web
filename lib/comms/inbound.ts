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

import { createHash } from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { enqueueEmail, fetchReceivedEmail, findReceivedEmailIdByMessageId, type ReceivedEmail } from '@/lib/email'
import {
  parseConversationReplyAddress,
  verifyConversationToken,
  buildConversationReplyAddress,
} from '@/lib/comms/reply-address'
import {
  getConversationByRef,
  appendConversationMessage,
  reopenConversationIfClosed,
  updateConversationFields,
  newConversationMessageId,
  type ConversationRow,
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
  /** Set when the body fetch failed PAST the redelivery grace window: the message records without a
   *  body, carrying the provider received-email id so healMissingBodies can recover it later. */
  hydration?: { emailId: string; failed: true }
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

/** Split an RFC 5322 `References` chain into individual `<message-id>` tokens (whitespace-separated).
 *  The header is attacker-controlled (anyone can email a reply address), so bound it before splitting —
 *  we only keep the first 50 ids anyway, and a valid chain of 50 message-ids fits comfortably in 8 KB. */
function parseReferences(raw: string | null): string[] | null {
  if (!raw) return null
  const ids = raw
    .slice(0, 8000)
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
/** A deterministic, valid-shaped Message-ID for an inbound email the provider delivered WITHOUT one,
 *  so the external_message_id dedup index still catches a redelivery. Hash of sender + subject + body
 *  + the UTC day: a same-day redelivery of the identical payload collides (treated as a duplicate),
 *  while the same text sent fresh on a later day still records. PURE. */
export function synthesizeInboundMessageId(
  from: string,
  subject: string | null,
  text: string | null,
): string {
  const day = new Date().toISOString().slice(0, 10)
  const hash = createHash('sha256')
    .update(`${from}\n${subject ?? ''}\n${text ?? ''}\n${day}`)
    .digest('hex')
    .slice(0, 32)
  return `<synth.${hash}@inbound.frequencylocal.com>`
}

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
  const providerMessageId =
    typeof messageIdRaw === 'string' && messageIdRaw.trim() ? messageIdRaw.trim().slice(0, 998) : null
  // FALLBACK ID (meta-scan 2026-07-25): inbound dedup rides the PARTIAL unique index on
  // external_message_id ("where ... is not null"), which a null id skips entirely — so a provider
  // REDELIVERY of a Message-ID-less inbound (odd automations; nearly all real mailers set one) would
  // append twice and, on the house path, re-email the member. Synthesize a deterministic id from the
  // content plus the UTC DAY, so a same-day redelivery collides (23505 -> 'duplicate' -> clean ack)
  // while a genuinely new, identical message on a later day still records. Shaped as a valid msg-id.
  const messageId = providerMessageId ?? synthesizeInboundMessageId(from, subject, text)

  const headers = data.headers ?? root.headers
  const inReplyToRaw = headerValue(headers, 'In-Reply-To')
  const inReplyTo = inReplyToRaw ? inReplyToRaw.slice(0, 998) : null
  const referencesIds = parseReferences(headerValue(headers, 'References'))
  const autoSubmitted = headerValue(headers, 'Auto-Submitted')?.toLowerCase() ?? null
  const precedence = headerValue(headers, 'Precedence')?.toLowerCase() ?? null

  return { from, recipients, subject, text, messageId, inReplyTo, referencesIds, autoSubmitted, precedence }
}

/** First non-empty trimmed string among the candidates, else null. */
function firstString(...vals: unknown[]): string | null {
  for (const v of vals) if (typeof v === 'string' && v.trim()) return v.trim()
  return null
}

/** Thrown when a metadata-only webhook carried a received-email id but the body fetch failed after retries.
 *  The webhook route maps this to a 5xx so the provider REDELIVERS, instead of silently recording an empty
 *  body — the Received-Emails API is eventually consistent, so a later redelivery usually succeeds. */
export class InboundHydrationError extends Error {
  constructor(public readonly emailId: string) {
    super(`inbound body hydration failed for ${emailId}`)
    this.name = 'InboundHydrationError'
  }
}

/**
 * Load a normalized inbound message from a provider webhook payload, HYDRATING the body when needed.
 *
 * Resend's `email.received` webhook is METADATA-ONLY (from / to / subject / id — no body, no headers). So
 * when the payload carries a received-email id but no body, we fetch the full content (text / html / headers
 * / message_id) from the Received Emails API and merge it in before parsing. Without this the reply would
 * thread with an empty body, no loop-guard headers (Auto-Submitted / Precedence), and no dedupe key
 * (Message-ID). Falls back to the raw payload when there is nothing to hydrate or the fetch fails (so a
 * provider that DOES inline the body, and every unit test, keep working). The fetcher is injectable for tests.
 */
export async function loadInboundMessage(
  payload: unknown,
  fetcher: (id: string) => Promise<ReceivedEmail | null> = fetchReceivedEmail,
): Promise<ParsedInboundMessage | null> {
  if (!payload || typeof payload !== 'object') return parseInboundMessage(payload)
  const root = payload as Record<string, unknown>
  const data = (root.data && typeof root.data === 'object' ? root.data : root) as Record<string, unknown>
  // Require a NON-EMPTY body — a provider that inlines `text: ""` must not suppress the fetch.
  const hasBody =
    (typeof data.text === 'string' && data.text.trim().length > 0) ||
    (typeof data.html === 'string' && data.html.trim().length > 0)
  // The received-email id can arrive under a few shapes across provider payload versions — check them all.
  const nested = data.email && typeof data.email === 'object' ? (data.email as Record<string, unknown>) : {}
  const emailId = firstString(
    data.email_id,
    data.id,
    data.received_email_id,
    nested.id,
    root.email_id,
    root.id,
  )
  if (emailId && !hasBody) {
    const full = await fetcher(emailId)
    // Merge the fetched body/headers over the webhook metadata (which may carry `received_for`).
    if (full) return parseInboundMessage({ data: { ...data, ...full } })
    // The webhook told us there's a body to fetch (it carried an id) but the fetch came back empty after
    // retries. Signal a transient failure so the route asks the provider to redeliver (the
    // Received-Emails API is eventually consistent, so a retry usually succeeds) — but ONLY within the
    // grace window. A PERSISTENT fetch failure (e.g. an API key without receiving scope) would otherwise
    // 503 every redelivery until the provider gives up and the reply is LOST FOREVER (the #1002 case).
    // Past the grace window we record the message DEGRADED (no body) carrying the received-email id in
    // `hydration`, so the operator thread loader can heal the body later (healMissingBodies).
    const createdRaw = firstString(root.created_at, data.created_at)
    const createdAt = createdRaw ? Date.parse(createdRaw) : Number.NaN
    const withinGrace = !Number.isFinite(createdAt) || Date.now() - createdAt < HYDRATION_GRACE_MS
    if (withinGrace) throw new InboundHydrationError(emailId)
    const parsed = parseInboundMessage(payload)
    return parsed ? { ...parsed, hydration: { emailId, failed: true } } : parsed
  }
  return parseInboundMessage(payload)
}

/** How long we keep 503-ing for a redelivery before degrading to a body-less record (heal-on-load
 *  recovers the body once the fetch works again). Long enough for eventual consistency, short enough
 *  that a persistent failure never exhausts the provider's retry schedule and drops the message. */
const HYDRATION_GRACE_MS = 10 * 60 * 1000

/** The literal placeholder a body-less inbound records with (also the pre-fix rows' body). */
export const MISSING_BODY_PLACEHOLDER = '(no message body)'

/**
 * HEAL missing inbound bodies (best-effort, operator-read path). For each email message recorded with
 * the placeholder body: resolve the provider received-email id (the stored `metadata.resend_email_id`
 * from a degraded record, else a receiving-LIST match by the RFC Message-ID for pre-fix rows), fetch
 * the full body, and UPDATE the stored message. Returns a map of message id → healed body so the
 * caller can patch its in-memory rows without a re-read. Caps the fetches per call (an operator
 * opening a thread must never wait on a long scan); a failed heal leaves the row unchanged and is
 * retried on the next load. Server-only (admin client).
 */
export async function healMissingBodies(
  rows: { id: string; body: string | null; channel: string | null; externalMessageId?: string | null; metadata?: Record<string, unknown> | null }[],
  maxHeals = 3,
): Promise<Map<string, { body: string; bodyHtml: string | null }>> {
  const healed = new Map<string, { body: string; bodyHtml: string | null }>()
  const candidates = rows
    .filter((r) => (r.body ?? '').trim() === MISSING_BODY_PLACEHOLDER && (r.channel ?? 'email') === 'email')
    .slice(0, maxHeals)
  if (candidates.length === 0) return healed
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = createAdminClient() as unknown as { from: (t: string) => any }
    for (const row of candidates) {
      const storedId = typeof row.metadata?.resend_email_id === 'string' ? row.metadata.resend_email_id : null
      const providerId = storedId ?? (row.externalMessageId ? await findReceivedEmailIdByMessageId(row.externalMessageId) : null)
      if (!providerId) continue
      const full = await fetchReceivedEmail(providerId, 1)
      const text = full?.text?.trim() || null
      const html = full?.html?.trim() || null
      if (!text && !html) continue
      const body = text ?? html ?? ''
      const { error } = await db
        .from('comms_messages')
        .update({
          body,
          ...(html ? { body_html: html } : {}),
          metadata: { ...(row.metadata ?? {}), resend_email_id: providerId, hydration_healed: true },
        })
        .eq('id', row.id)
      if (!error) healed.set(row.id, { body, bodyHtml: html })
    }
  } catch (err) {
    console.warn('[comms] healMissingBodies failed (non-fatal):', err)
  }
  return healed
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
  | 'recorded_outbound'
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
    //    address are dropped rather than mis-recorded as the member replying — and, on the house address,
    //    an operator's vacation responder never fires an outbound to the member).
    if (isAutomatedMessage(parsed)) return { status: 'dropped_automated' }

    // 3) VERIFY the token FOR ITS ROLE. A present-but-invalid tag is a forgery or a rotated secret — drop
    //    it, and do NOT fall through to contact-match (the address clearly targeted our reply domain). The
    //    role is authenticated by the address itself: a member token cannot pass as a house token.
    if (!verifyConversationToken(token.ref, token.token, token.role)) return { status: 'bad_token' }

    // 4) Resolve the thread.
    const conv = await getConversationByRef(token.ref)
    if (!conv) return { status: 'no_conversation', ref: token.ref }

    // 5) HOUSE role = an operator/leader replying to a FORWARDED copy from their own inbox (email bridge).
    //    Route it OUTBOUND to the member, as the house. Direction is decided by the unforgeable address, so
    //    a spoofed From cannot trigger this. We ALWAYS honor a valid house token (not flag-gated): a house
    //    address can only exist because we emitted it while the bridge was on, so an agent's reply to an
    //    in-flight forward is never dropped even if the bridge is later turned off. The flag gates only
    //    whether we forward NEW member replies (below).
    if (token.role === 'house') return await routeHouseReplyOutbound(conv, parsed)

    // 6) MEMBER role = the counterpart replied. Append the inbound message. author = the counterpart.
    const senderMismatch = !!conv.externalEmail && conv.externalEmail.toLowerCase() !== parsed.from
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
      // Persist the anti-spoof flag ("replied from a different address") + the degraded-hydration
      // marker (the provider email id healMissingBodies re-fetches the body by).
      metadata:
        senderMismatch || parsed.hydration
          ? {
              ...(senderMismatch ? { sender_mismatch: true, from: parsed.from } : {}),
              ...(parsed.hydration ? { resend_email_id: parsed.hydration.emailId, hydration_failed: true } : {}),
            }
          : null,
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
    // Distinguish the two non-success outcomes: a unique(external_message_id) conflict is a provider
    // REDELIVERY (idempotent no-op, ack it), but a null is a TRANSIENT failure — surface it as 'error' so
    // the webhook returns 5xx and the provider redelivers, instead of the reply being silently lost.
    if (appended === null) return { status: 'error', conversationId: conv.id, ref: conv.ref }
    if ('duplicate' in appended) return { status: 'duplicate', conversationId: conv.id, ref: conv.ref }

    // A new inbound message reopens a resolved/closed thread (mirrors support reopen).
    await reopenConversationIfClosed(conv.id, conv.status)

    // Notify the agent a reply is owed (assignee first, else the sender-trail owner). Best-effort.
    await notifyConversationReply(conv.assignedTo ?? conv.ownerProfileId, conv.id, conv.ref, conv.subject)

    // EMAIL BRIDGE: forward the reply to the agent's real inbox so they can answer from their mail app.
    // Best-effort, and only on FIRST receipt (we are past the duplicate check), so a redelivery never
    // double-forwards. Never blocks the recorded reply.
    if (emailBridgeEnabled()) await forwardInboundToHouse(conv, parsed)

    return { status: 'recorded', conversationId: conv.id, ref: conv.ref, senderMismatch }
  } catch (err) {
    console.error('[comms] routeInboundReply failed:', err)
    return { status: 'error' }
  }
}

/** The email bridge (ADR-814): forward member replies to the agent's inbox and route the agent's mailed-in
 *  reply back out to the member. OFF by default; needs inbound receiving already live. */
function emailBridgeEnabled(): boolean {
  const v = (process.env.CONVERSATION_EMAIL_BRIDGE ?? '').trim().toLowerCase()
  return v === '1' || v === 'true' || v === 'on'
}

/** The conversational sending identity (matches the reply actions' From: "<Name> via Frequency <addr>"). */
function conversationFrom(name: string | null): string {
  const addr = process.env.EMAIL_CONVERSATION_FROM ?? process.env.EMAIL_FROM ?? 'people@people.frequencylocal.com'
  const clean = (name ?? 'Frequency').replace(/["\\<>]/g, '').trim() || 'Frequency'
  return `${clean} via Frequency <${addr}>`
}

/** `Re:`-prefix a subject once (mirrors the reply actions). */
function bridgeReplySubject(subject: string | null): string {
  const s = (subject ?? '').trim() || '(no subject)'
  return s.toLowerCase().startsWith('re:') ? s.slice(0, 200) : `Re: ${s}`.slice(0, 200)
}

/** Plain-text → minimal safe HTML (mirrors the reply actions' bodyToHtml). */
function bridgeBodyToHtml(text: string): string {
  const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  // token-ok: inline style in a server-rendered HTML message body (no CSS vars available in email)
  return `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.5;color:#111">${escaped.replace(/\n/g, '<br>')}</div>`
}

/** Resolve an agent profile's login email + display name (for the forward To + the outbound From).
 *  FAIL-SAFE: null on any miss. */
async function resolveAgent(profileId: string | null): Promise<{ email: string; name: string | null } | null> {
  if (!profileId) return null
  try {
    const admin = createAdminClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = admin as unknown as { from: (t: string) => any }
    const { data: profile } = await db.from('profiles').select('display_name, auth_user_id').eq('id', profileId).maybeSingle()
    if (!profile?.auth_user_id) return null
    const { data } = await admin.auth.admin.getUserById(profile.auth_user_id as string)
    const email = data?.user?.email ?? null
    if (!email) return null
    return { email, name: (profile.display_name as string) ?? null }
  } catch {
    return null
  }
}

/** Forward a member's inbound reply to the assigned agent's (else owner's) real inbox. The forwarded copy's
 *  Reply-To is the HOUSE address, so when the agent hits reply in their mail app it routes back OUTBOUND to
 *  the member (routeHouseReplyOutbound). Best-effort; never throws. */
async function forwardInboundToHouse(conv: ConversationRow, parsed: ParsedInboundMessage): Promise<void> {
  try {
    const agent = await resolveAgent(conv.assignedTo ?? conv.ownerProfileId)
    if (!agent) return
    const memberName = conv.externalEmail ?? 'A member'
    const body = parsed.text ?? '(no message body)'
    await enqueueEmail({
      to: agent.email,
      // Show the member as the sender so the agent's inbox reads like a normal thread.
      from: conversationFrom(memberName),
      replyTo: buildConversationReplyAddress(conv.ref, 'house'),
      subject: bridgeReplySubject(conv.subject),
      html: bridgeBodyToHtml(body),
      text: body,
      headers: { 'Message-ID': newConversationMessageId(conv.ref) },
    })
  } catch (err) {
    console.error('[comms] forwardInboundToHouse failed (non-fatal):', err)
  }
}

/** An agent replied to the house address from their own inbox → record it as an outbound message and send
 *  it onward to the member (as the house), with the MEMBER reply address so the member's reply threads back
 *  inbound. Deduped on the agent's inbound Message-ID so a provider redelivery never double-sends. */
async function routeHouseReplyOutbound(conv: ConversationRow, parsed: ParsedInboundMessage): Promise<InboundRouteResult> {
  if (!conv.externalEmail) return { status: 'no_conversation', conversationId: conv.id, ref: conv.ref }
  const agentId = conv.assignedTo ?? conv.ownerProfileId
  const agent = await resolveAgent(agentId)
  const authorKind = conv.kind === 'leader' ? 'leader' : 'staff'
  const body = parsed.text ?? '(no message body)'

  // Record the outbound FIRST, keyed on the agent's inbound Message-ID: a redelivery hits the unique index
  // and returns `duplicate`, so we never send the member a second copy.
  const appended = await appendConversationMessage({
    conversationId: conv.id,
    direction: 'outbound',
    authorKind,
    authorId: agentId,
    body,
    externalMessageId: parsed.messageId,
    mirror:
      conv.ownerProfileId && (conv.memberProfileId || conv.contactId)
        ? {
            ownerProfileId: conv.ownerProfileId,
            subjectKind: conv.memberProfileId ? 'profile' : 'contact',
            subjectId: (conv.memberProfileId ?? conv.contactId)!,
            spaceId: conv.spaceId,
            subject: conv.subject,
          }
        : null,
  })
  if (appended === null) return { status: 'error', conversationId: conv.id, ref: conv.ref }
  if ('duplicate' in appended) return { status: 'duplicate', conversationId: conv.id, ref: conv.ref }

  // Send onward to the member. Reply-To = the MEMBER address so their reply comes back INBOUND.
  try {
    await enqueueEmail({
      to: conv.externalEmail,
      from: conversationFrom(agent?.name ?? null),
      replyTo: buildConversationReplyAddress(conv.ref, 'member'),
      subject: bridgeReplySubject(conv.subject),
      html: bridgeBodyToHtml(body),
      text: body,
      headers: { 'Message-ID': newConversationMessageId(conv.ref) },
    })
  } catch (err) {
    // The message is on the thread; the outbox is the retry layer for the actual send. Ack (200) rather
    // than 5xx — a redelivery would dedupe on the append and never re-enqueue, so retrying here is futile.
    console.error('[comms] routeHouseReplyOutbound enqueue failed (recorded on thread):', err)
  }

  // An outbound reply moves an active thread to "waiting" (mirrors the console reply).
  if (conv.status === 'open' || conv.status === 'in_progress') {
    await updateConversationFields(conv.id, { status: 'waiting' })
  }
  return { status: 'recorded_outbound', conversationId: conv.id, ref: conv.ref }
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
