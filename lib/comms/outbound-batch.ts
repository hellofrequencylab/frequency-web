// BATCH + DIGEST for the ticketed comms spine (ADR-812). Two quiet-time coalescers, both CONFIG-GATED
// OFF by default so the live 1:1 mail path is byte-for-byte unchanged until an operator opts in:
//
//  1) OUTBOUND BATCHING (CONVERSATION_BATCH_WINDOW_MINUTES > 0) — a burst of replies typed into one
//     thread inside the window is held as `delivery_status='queued'` messages and, once the burst has
//     settled, flushed as ONE email (the messages still show individually in the workspace).
//  2) INBOUND DIGEST (CONVERSATION_DIGEST_WINDOW_MINUTES > 0) — instead of surfacing every member reply
//     the instant it lands, the cron rolls a recipient's newly-arrived replies into ONE summary email.
//
// With both windows at 0 (the default) `flush*` short-circuit to a no-op and the reply actions take
// their existing immediate-send branch, so nothing about today's behavior moves. The pure shapers
// (`coalesceBodies`, the window parsers) are unit-tested in isolation; the IO is fail-safe (a blip
// returns a count, never throws, and leaves un-flushed work to be retried on the next cron pass).

import { createAdminClient } from '@/lib/supabase/admin'
import { enqueueEmail } from '@/lib/email'
import { buildConversationReplyAddress } from '@/lib/comms/reply-address'
import { renderCoalescedEmail } from '@/lib/comms/email-template'
import {
  getConversationById,
  appendConversationMessage,
  newConversationMessageId,
  type AppendMessageInput,
  type MessageAuthorKind,
} from '@/lib/comms/conversations'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://frequencylocal.com'

/** Read a non-negative "quiet window" from an env var. Returns 0 (feature off) for unset / <=0 / garbage,
 *  and clamps to a day so a fat-fingered value can never park mail for a week. PURE + total. */
function windowMinutes(raw: string | undefined): number {
  const n = raw ? Number.parseInt(raw, 10) : 0
  if (!Number.isFinite(n) || n <= 0) return 0
  return Math.min(n, 1440)
}

/** Minutes to hold a burst of outbound replies before coalescing them into one email. 0 = off (immediate). */
export function conversationBatchWindowMinutes(): number {
  return windowMinutes(process.env.CONVERSATION_BATCH_WINDOW_MINUTES)
}

/** Minutes to let inbound replies accumulate before rolling them into one digest per recipient. 0 = off. */
export function conversationDigestWindowMinutes(): number {
  return windowMinutes(process.env.CONVERSATION_DIGEST_WINDOW_MINUTES)
}

/** The default conversational From when a queued message somehow lost its `batch_from` (defensive). */
function defaultConversationFrom(): string {
  const addr = process.env.EMAIL_CONVERSATION_FROM ?? process.env.EMAIL_FROM ?? 'people@people.frequencylocal.com'
  return `Frequency <${addr}>`
}

/** Plain-text reply → minimal safe HTML (mirrors the reply actions' bodyToHtml). No external template. */
function bodyToHtml(text: string): string {
  const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  // token-ok: inline style in a server-rendered HTML message body (no CSS vars available in email)
  return `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.5;color:#111">${escaped.replace(/\n/g, '<br>')}</div>`
}

/** `Re:`-prefix a subject once (mirrors the reply actions). */
function replySubject(subject: string | null): string {
  const s = (subject ?? '').trim() || '(no subject)'
  return s.toLowerCase().startsWith('re:') ? s.slice(0, 200) : `Re: ${s}`.slice(0, 200)
}

/** Coalesce an ordered run of outbound messages into ONE email body. Empty messages are dropped; a single
 *  message passes through unchanged (no separator noise); multiples are joined oldest-first. PURE + tested. */
export function coalesceBodies(messages: { body: string; bodyHtml?: string | null }[]): { text: string; html: string } {
  const parts = messages.filter((m) => (m.body ?? '').trim().length > 0 || (m.bodyHtml ?? '')?.trim())
  if (parts.length === 0) return { text: '', html: '' }
  const text = parts
    .map((m) => (m.body ?? '').trim())
    .filter(Boolean)
    .join('\n\n')
  const html = parts
    .map((m) => (m.bodyHtml && m.bodyHtml.trim() ? m.bodyHtml : bodyToHtml(m.body ?? '')))
    .join('\n<br><br>\n')
  return { text, html }
}

// ── Outbound: queue-on-send ─────────────────────────────────────────────────────

/** Append an outbound reply as a QUEUED message (no email yet). The flush cron reads `metadata.batch_from`
 *  to send under the same sender identity the operator would have used. Returns false on a write failure so
 *  the caller can surface it (the reply is not silently lost). Used ONLY when the batch window is > 0. */
export async function queueOutboundMessage(input: {
  conversationId: string
  from: string
  to: string
  body: string
  html: string
  authorKind: MessageAuthorKind
  authorId?: string | null
  authorContactId?: string | null
  /** The sender's email signature, stamped on the coalesced email at flush (not on the stored message). */
  signature?: string | null
  mirror?: AppendMessageInput['mirror']
}): Promise<boolean> {
  const appended = await appendConversationMessage({
    conversationId: input.conversationId,
    direction: 'outbound',
    authorKind: input.authorKind,
    authorId: input.authorId ?? null,
    authorContactId: input.authorContactId ?? null,
    body: input.body,
    bodyHtml: input.html,
    deliveryStatus: 'queued',
    metadata: { batch_from: input.from, batch_to: input.to, batch_signature: input.signature ?? null },
    mirror: input.mirror ?? null,
  })
  return !!appended && 'id' in appended
}

/** scan2 L6-05 (2026-09-05): how long a flush may hold a burst before the next run treats the claim as
 *  abandoned (the claimant crashed between claim and mark-sent) and takes it over. Well above the
 *  cron's own runtime; a crash is the only way a claim reaches this age. */
export const BATCH_CLAIM_STALE_MINUTES = 10

/** Metadata keys the claim lives in. The claim is stamped into `comms_messages.metadata` rather than a
 *  `delivery_status = 'sending'` because the column's CHECK constraint (20261210000000_conversations_spine)
 *  enumerates queued/sent/delivered/opened/clicked/bounced/failed/received and nothing else; a status claim
 *  needs a migration, a metadata claim does not. The conditional UPDATE is still per-row atomic. */
const CLAIMED_AT_KEY = 'batch_claimed_at'
const CLAIM_TOKEN_KEY = 'batch_claim_token'

/** Claim one queued row for this run: a conditional UPDATE that only lands if the row is still `queued`
 *  and either unclaimed or held by a claim older than the stale window. Returns true iff THIS run now holds
 *  the row. `null`-data / no rows = another run holds it (or it was sent meanwhile). Throws on IO error. */
async function claimQueuedRow(
  db: { from: (t: string) => any }, // eslint-disable-line @typescript-eslint/no-explicit-any
  row: QueuedRow,
  token: string,
  nowIso: string,
  staleBeforeIso: string,
): Promise<boolean> {
  const metadata = { ...(row.metadata ?? {}), [CLAIMED_AT_KEY]: nowIso, [CLAIM_TOKEN_KEY]: token }
  const res = await db
    .from('comms_messages')
    .update({ metadata })
    .eq('id', row.id)
    .eq('delivery_status', 'queued')
    .or(`metadata->>${CLAIMED_AT_KEY}.is.null,metadata->>${CLAIMED_AT_KEY}.lt.${staleBeforeIso}`)
    .select('id')
  if (res?.error) throw res.error
  return Array.isArray(res?.data) && res.data.length > 0
}

/** Give back rows THIS run claimed but will not send (a partial claim, or the enqueue failed), so the next
 *  pass retries at once instead of waiting out the stale window. Conditional on the token so a claim taken
 *  over by a later run is never clobbered. Best-effort. */
async function releaseClaimedRows(
  db: { from: (t: string) => any }, // eslint-disable-line @typescript-eslint/no-explicit-any
  rows: QueuedRow[],
  token: string,
): Promise<void> {
  for (const row of rows) {
    try {
      const metadata = { ...(row.metadata ?? {}) }
      delete metadata[CLAIMED_AT_KEY]
      delete metadata[CLAIM_TOKEN_KEY]
      await db
        .from('comms_messages')
        .update({ metadata })
        .eq('id', row.id)
        .eq(`metadata->>${CLAIM_TOKEN_KEY}`, token)
    } catch {
      /* best-effort: an unreleased claim is reclaimed after BATCH_CLAIM_STALE_MINUTES */
    }
  }
}

/** When a queued row already carries a claim (the previous claimant died mid-flush), say so in the log
 *  before taking it over; the claim's age is the evidence. PURE. */
function priorClaimOf(row: QueuedRow): { at: string; token: string | null } | null {
  const m = row.metadata && typeof row.metadata === 'object' ? row.metadata : null
  const at = m ? m[CLAIMED_AT_KEY] : null
  if (typeof at !== 'string' || !at) return null
  const token = m ? m[CLAIM_TOKEN_KEY] : null
  return { at, token: typeof token === 'string' ? token : null }
}

interface QueuedRow {
  id: string
  conversation_id: string
  body: string | null
  body_html: string | null
  occurred_at: string
  metadata: Record<string, unknown> | null
}

/** Flush settled outbound bursts: for each conversation with queued outbound messages whose NEWEST queued
 *  message is older than the window (the burst has gone quiet), send one coalesced email and flip those
 *  messages to `sent`. No-op when the feature is off. FAIL-SAFE: a per-conversation error is logged and the
 *  work is left queued for the next pass.
 *
 *  2026-09-05 correction (scan2 L6-05): "left queued for the next pass" used to be the WHOLE concurrency
 *  story — the rows were read, emailed, and only then marked sent, with no claim in between, so two
 *  overlapping cron runs (or a crash between enqueueEmail and mark-sent) emailed the external contact the
 *  same burst twice under two Message-IDs. Each burst is now CLAIMED row-by-row (newest first, a conditional
 *  UPDATE per row) before anything is enqueued, and only a run holding EVERY row of the burst sends; a run
 *  that loses any row releases what it took and skips. A claim older than BATCH_CLAIM_STALE_MINUTES is
 *  treated as abandoned and taken over (logged). */
export async function flushConversationBatches(): Promise<{ conversations: number; emails: number; messages: number }> {
  const window = conversationBatchWindowMinutes()
  // The window governs the DEBOUNCE only, not whether we drain. When it is 0 (feature off, or just turned
  // off) we still flush any already-queued messages immediately, so disabling batching can never strand a
  // reply that was queued while it was on. On a deployment that never enabled it the query finds 0 rows.
  const cutoffMs = window > 0 ? Date.now() - window * 60_000 : Date.now() + 1000
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as unknown as { from: (t: string) => any }

  let queued: QueuedRow[] = []
  try {
    const res = await db
      .from('comms_messages')
      .select('id, conversation_id, body, body_html, occurred_at, metadata')
      .eq('direction', 'outbound')
      .eq('delivery_status', 'queued')
      .order('occurred_at', { ascending: true })
      .limit(1000)
    queued = (res?.data as QueuedRow[]) ?? []
  } catch (err) {
    console.error('[comms] flushConversationBatches read failed:', err)
    return { conversations: 0, emails: 0, messages: 0 }
  }
  if (queued.length === 0) return { conversations: 0, emails: 0, messages: 0 }

  const byConv = new Map<string, QueuedRow[]>()
  for (const m of queued) {
    const cid = String(m.conversation_id)
    const list = byConv.get(cid)
    if (list) list.push(m)
    else byConv.set(cid, [m])
  }

  const runToken = `flush:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 10)}`
  const nowIso = new Date().toISOString()
  const staleBeforeIso = new Date(Date.now() - BATCH_CLAIM_STALE_MINUTES * 60_000).toISOString()

  let conversations = 0
  let emails = 0
  let messages = 0
  for (const [cid, msgs] of byConv) {
    // DEBOUNCE: hold until the newest queued message in the thread has aged past the window.
    const newest = Math.max(...msgs.map((m) => Date.parse(m.occurred_at) || 0))
    if (newest > cutoffMs) continue

    const ordered = [...msgs].sort((a, b) => (Date.parse(a.occurred_at) || 0) - (Date.parse(b.occurred_at) || 0))
    const ids = ordered.map((m) => m.id)

    // CLAIM (scan2 L6-05): take every row of the burst, NEWEST FIRST, so two overlapping runs contend on
    // the same row first and exactly one of them proceeds. Stop at the first row another run holds.
    const claimed: QueuedRow[] = []
    let lostRow = false
    try {
      for (const row of [...ordered].reverse()) {
        const prior = priorClaimOf(row)
        if (prior && prior.at < staleBeforeIso) {
          console.warn(
            `[comms] flushConversationBatches reclaiming a stale batch claim (conversation ${cid}, message ${row.id}, claimed ${prior.at} by ${prior.token ?? 'unknown'})`,
          )
        }
        if (!(await claimQueuedRow(db, row, runToken, nowIso, staleBeforeIso))) {
          lostRow = true
          break
        }
        claimed.push(row)
      }
    } catch (err) {
      console.error('[comms] flushConversationBatches claim failed:', err)
      await releaseClaimedRows(db, claimed, runToken)
      continue
    }
    if (lostRow) {
      // Another run holds (part of) this burst: it sends, we don't. Hand back anything we took.
      await releaseClaimedRows(db, claimed, runToken)
      continue
    }

    const conv = await getConversationById(cid)
    if (!conv || !conv.externalEmail) {
      // No address / conversation gone: mark failed so the cron doesn't reconsider this burst forever.
      try {
        await db.from('comms_messages').update({ delivery_status: 'failed' }).in('id', ids)
      } catch {
        /* best-effort */
      }
      continue
    }

    const { text, html } = coalesceBodies(
      ordered.map((m) => ({ body: String(m.body ?? ''), bodyHtml: (m.body_html as string) ?? null })),
    )
    // Brand + sign the coalesced EMAIL only (header/footer + signature); the stored messages stay clean.
    const signature = firstBatchSignature(ordered)
    const { html: signedHtml, text: signedText } = renderCoalescedEmail(text, html, signature)
    const from = firstBatchFrom(ordered) ?? defaultConversationFrom()
    const messageId = newConversationMessageId(conv.ref)
    try {
      await enqueueEmail({
        to: conv.externalEmail,
        from,
        replyTo: buildConversationReplyAddress(conv.ref),
        subject: replySubject(conv.subject),
        html: signedHtml,
        text: signedText,
        // No List-Unsubscribe: a 1:1 human reply is transactional, not bulk (ADR-812 deliverability).
        headers: { 'Message-ID': messageId },
      })
    } catch (err) {
      console.error('[comms] flushConversationBatches enqueue failed:', err)
      await releaseClaimedRows(db, claimed, runToken) // hand the claim back → retried next pass
      continue // leave queued → retried next pass
    }
    conversations++
    emails++
    try {
      await db.from('comms_messages').update({ delivery_status: 'sent' }).in('id', ids)
      // Stamp the batch Message-ID on the NEWEST message only (external_message_id is UNIQUE).
      await db.from('comms_messages').update({ external_message_id: messageId }).eq('id', ids[ids.length - 1])
    } catch (err) {
      console.error('[comms] flushConversationBatches mark-sent failed (email already sent):', err)
    }
    messages += ids.length
  }
  return { conversations, emails, messages }
}

/** The signature stamped on the queued burst (first non-empty), appended to the coalesced email at flush. */
function firstBatchSignature(ordered: QueuedRow[]): string | null {
  for (const m of ordered) {
    const s = m.metadata && typeof m.metadata === 'object' ? (m.metadata as Record<string, unknown>).batch_signature : null
    if (typeof s === 'string' && s.trim()) return s
  }
  return null
}

/** The `batch_from` stamped on the oldest queued message (the sender identity to send the whole burst as). */
function firstBatchFrom(ordered: QueuedRow[]): string | null {
  for (const m of ordered) {
    const f = m.metadata && typeof m.metadata === 'object' ? (m.metadata as Record<string, unknown>).batch_from : null
    if (typeof f === 'string' && f.trim()) return f
  }
  return null
}

// ── Inbound: digest per recipient ───────────────────────────────────────────────

interface DigestConvRow {
  id: string
  ref: string
  subject: string | null
  external_email: string | null
  assigned_to: string | null
  owner_profile_id: string | null
  last_inbound_at: string
  last_digested_at: string | null
}

/** Flush inbound digests: group conversations that got a NEW member reply (settled past the window and not
 *  yet digested) by their agent (assignee first, else the sender-trail owner), and email each agent ONE
 *  summary. The per-conversation `last_digested_at` watermark makes it idempotent (a reply that arrives
 *  after a digest still out-dates the watermark and rolls into the next one). No-op when the feature is off.
 *  The in-app `conversation_reply` notification still fires at receive time regardless — this only adds the
 *  batched email nudge. FAIL-SAFE. */
export async function flushConversationDigests(): Promise<{ recipients: number; emails: number; conversations: number }> {
  const window = conversationDigestWindowMinutes()
  if (window === 0) return { recipients: 0, emails: 0, conversations: 0 }
  const cutoff = new Date(Date.now() - window * 60_000).toISOString()
  // RECENCY FLOOR: only ever digest replies that landed in the last 24h. Without this, the FIRST cron pass
  // after the feature is enabled would summarize every reply ever received (all have last_digested_at=null),
  // flooding operators with digests of ancient threads. A digest is about what is fresh, not history.
  const floor = new Date(Date.now() - 24 * 60 * 60_000).toISOString()
  const admin = createAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = admin as unknown as { from: (t: string) => any }

  let convs: DigestConvRow[] = []
  try {
    const res = await db
      .from('comms_conversations')
      .select('id, ref, subject, external_email, assigned_to, owner_profile_id, last_inbound_at, last_digested_at')
      .not('last_inbound_at', 'is', null)
      .gt('last_inbound_at', floor)
      .lt('last_inbound_at', cutoff)
      .limit(1000)
    convs = (res?.data as DigestConvRow[]) ?? []
  } catch (err) {
    console.error('[comms] flushConversationDigests read failed:', err)
    return { recipients: 0, emails: 0, conversations: 0 }
  }
  // Keep only conversations whose inbound reply is newer than the last digest we sent for them.
  const fresh = convs.filter((c) => {
    const inb = Date.parse(c.last_inbound_at) || 0
    const dig = c.last_digested_at ? Date.parse(c.last_digested_at) || 0 : 0
    return inb > dig
  })
  if (fresh.length === 0) return { recipients: 0, emails: 0, conversations: 0 }

  const byRecipient = new Map<string, DigestConvRow[]>()
  for (const c of fresh) {
    const rid = (c.assigned_to as string) || (c.owner_profile_id as string) || null
    if (!rid) continue
    const list = byRecipient.get(rid)
    if (list) list.push(c)
    else byRecipient.set(rid, [c])
  }

  let recipients = 0
  let emails = 0
  let conversations = 0
  for (const [profileId, rows] of byRecipient) {
    const email = await resolveProfileEmail(admin, profileId)
    recipients++
    // No deliverable address → do NOT advance the watermark (else the digest is silently lost); a later
    // pass retries once an email resolves. Mirrors the enqueue-failure branch below.
    if (!email) continue
    try {
      await enqueueEmail({
        to: email,
        subject: rows.length === 1 ? 'You have a new reply' : `You have ${rows.length} new replies`,
        html: digestHtml(rows),
        text: digestText(rows),
      })
      emails++
    } catch (err) {
      console.error('[comms] flushConversationDigests enqueue failed:', err)
      continue // leave the watermark un-advanced → retried next pass
    }
    // Advance each conversation's watermark to the reply we just summarized (NOT `now`, so a reply that
    // landed after our read still out-dates the watermark and rolls into the next digest).
    for (const r of rows) {
      try {
        await db.from('comms_conversations').update({ last_digested_at: r.last_inbound_at }).eq('id', r.id)
      } catch {
        /* best-effort */
      }
    }
    conversations += rows.length
  }
  return { recipients, emails, conversations }
}

/** Resolve a profile's login email via auth.users (mirrors lib/digest.ts). FAIL-SAFE: null. */
async function resolveProfileEmail(
  admin: ReturnType<typeof createAdminClient>,
  profileId: string,
): Promise<string | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = admin as unknown as { from: (t: string) => any }
    const { data: profile } = await db.from('profiles').select('auth_user_id').eq('id', profileId).maybeSingle()
    if (!profile?.auth_user_id) return null
    const { data } = await admin.auth.admin.getUserById(profile.auth_user_id as string)
    return data?.user?.email ?? null
  } catch {
    return null
  }
}

/** One digest line per conversation: `#<ref> · <who> · <subject>`. HTML-escaped. */
function digestLine(r: DigestConvRow): { text: string; html: string } {
  const who = (r.external_email ?? '').trim() || 'A member'
  const subject = (r.subject ?? '').trim() || '(no subject)'
  const text = `#${r.ref}  ${who} · ${subject}`
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  // token-ok: inline style in a server-rendered email body (no CSS vars available in email)
  const html = `<li style="margin:0 0 8px"><strong>#${r.ref}</strong> ${esc(who)} &middot; ${esc(subject)}</li>`
  return { text, html }
}

function digestText(rows: DigestConvRow[]): string {
  const lines = rows.map((r) => digestLine(r).text).join('\n')
  return `New replies are waiting in your Conversations inbox:\n\n${lines}\n\nOpen Frequency to reply.\n${APP_URL}`
}

function digestHtml(rows: DigestConvRow[]): string {
  const items = rows.map((r) => digestLine(r).html).join('')
  // token-ok: inline styles in a server-rendered email body (no CSS vars available in email)
  return `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.5;color:#111">
  <p>New replies are waiting in your Conversations inbox:</p>
  <ul style="padding-left:18px;margin:12px 0">${items}</ul>
  <p><a href="${APP_URL}" style="color:#4f46e5">Open Frequency to reply</a></p>
</div>`
}
