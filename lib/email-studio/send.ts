// Email Studio (2026) — the campaign SEND pipeline (Phase 4). Turns a block-based
// EmailDoc campaign into a real, gated, per-recipient send WITHOUT building a new queue
// or gate: it reuses the app's proven send infrastructure verbatim.
//
//   • resolveSegment (lib/studio/campaigns)      — WHO (segment -> Recipient[])
//   • resolveSendGate (lib/comms/send-gate)      — the ONE unified consent + suppression
//                                                  + preference decision per recipient
//   • enqueueEmail   (lib/email)                 — the durable outbox (never inline send)
//   • the approval spine (lib/outbound/approvals) — a campaign carrying a phase_id still
//                                                  routes through assertApproved before send
//
// The ONLY thing new here vs. the marketing composer's sendCampaign loop is that the body
// is RENDERED from the campaign's `block_json` (EntityLayout) via compileEmailDoc, and per
// recipient merge tags (contact first name etc.) are applied at send time.
//
// Server-only, but NOT a 'use server' module (it exports a pure state machine + a size
// guard used by the unit test). The thin server-action entrypoints live in
// app/(main)/admin/email-studio/send-actions.ts. Voice canon: no em dashes in any copy.

import { createAdminClient } from '@/lib/supabase/admin'
import { ok, fail, type ActionResult } from '@/lib/action-result'
import { resolveSegment, sendCategoryForSegment, type SegmentKey } from '@/lib/studio/campaigns'
import { resolveSendGate } from '@/lib/comms/send-gate'
import { isSuppressed } from '@/lib/suppression'
import { enqueueEmail, listUnsubscribeHeaders } from '@/lib/email'
import { bulkRunAfter } from '@/lib/queue/outbox'
import { buildConversationReplyAddress, conversationSigningAvailable } from '@/lib/comms/reply-address'
import { openOrGetConversation, appendConversationMessage, newConversationMessageId } from '@/lib/comms/conversations'
import { conversationFrom } from '@/lib/comms/from-address'
import { envString } from '@/lib/env/string'
import { isSendingLeaseStale } from '@/lib/messaging/status'
import { buildUnsubscribeUrl, buildSpaceUnsubscribeUrl, buildManageEmailsUrl } from '@/lib/unsubscribe-tokens'
import { loadRootSpaceId } from '@/lib/spaces/store'
import { assertApproved } from '@/lib/outbound/approvals'
import { SITE_URL } from '@/lib/site'
import { compileEmailDoc } from './shell'
import { applyMergeTags } from './render'
import { resolveProductRefs, productVarsFromLayout } from './product-block'
import { MERGE_TAG_DEFAULT_FALLBACKS, type EmailDoc } from './types'
import { lintVoice } from './voice-lint'
import type { EntityLayout } from '@/lib/entity-blocks/layout'

// ── Sender FROM name (per-campaign display name, envelope address unchanged) ─────
// An operator can set a friendly From NAME per campaign (e.g. "Riverside Studio"). Only the DISPLAY name is
// customizable; the envelope ADDRESS stays the verified sending domain (noreply@send.frequencylocal.com), so
// deliverability / DKIM are untouched. The name is sanitized before it reaches the From header, and a blank /
// missing name falls back to the platform default (so a pre-migration row with no from_name still sends).

/** The platform default From (mirrors lib/email.ts EMAIL_FROM). The address inside `< >` is the verified
 *  sending identity; only the display name in front of it is operator-settable. */
// 2026-09-05 (scan2 L3-02): blank counts as unset.
const DEFAULT_FROM = envString('EMAIL_FROM', 'Frequency <noreply@send.frequencylocal.com>')

/**
 * Sanitize an operator-set From display name so it can never break (or inject into) an email From header.
 * Strips CR / LF / tab (header-injection guard) and other control chars, then the address delimiters and
 * separators (`"` `<` `>` `\` `@` `,` `;` `:`) that would let the name look like or split an address; collapses
 * whitespace and bounds the length. Returns '' when nothing usable remains (→ the caller falls back to the
 * default From). Pure + total.
 */
export function sanitizeFromName(raw: unknown): string {
  if (typeof raw !== 'string') return ''
  return raw
    .replace(/[\r\n\t]+/g, ' ') // newlines / tabs → a single space (never a header break)
    .replace(/[\x00-\x1F\x7F]/g, '') // other control chars
    .replace(/["<>\\@,;:]/g, '') // address delimiters + separators
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 78) // keep the assembled header well within the RFC 5322 line length
}

/**
 * The default envelope From for a BROADCAST (global Email Studio campaign), distinct from the platform default
 * so a warm list can send from a real person's verified address while transactional mail stays on noreply.
 * Overridable with EMAIL_BROADCAST_FROM ("Daniel Tyack <daniel@danieltyack.com>"); falls back to EMAIL_FROM.
 * The address's domain MUST be verified in Resend or the send fails authentication.
 */
const BROADCAST_FROM = process.env.EMAIL_BROADCAST_FROM?.trim() || DEFAULT_FROM

/**
 * Sanitize an operator-set full From ADDRESS (the envelope identity a broadcast sends from). Strips CR/LF/tab
 * (header-injection guard) and requires a single, well-formed addr-spec (one `@`, a dotted domain, none of the
 * header-breaking or list-separator chars). Returns '' when the value is not a safe address (→ the caller falls
 * back to the broadcast/default From). Format-only: Resend-domain VERIFICATION is an ops step we cannot check
 * here. Pure + total.
 */
export function sanitizeFromAddress(raw: unknown): string {
  if (typeof raw !== 'string') return ''
  const v = raw.replace(/[\r\n\t]+/g, '').trim()
  if (!/^[^\s<>@",;:\\]+@[^\s<>@",;:\\]+\.[^\s<>@",;:\\]+$/.test(v)) return ''
  return v.slice(0, 254)
}

/**
 * Build the send From header from an optional per-campaign display name, KEEPING the verified envelope address
 * from `base` (default EMAIL_FROM) and swapping only the friendly name. `base` may be a bare address
 * (`daniel@danieltyack.com`) or a full `Name <address>` header — either way the address inside is preserved.
 * A blank / unusable name returns `base` unchanged. Pure + total.
 */
export function buildCampaignFrom(fromName: unknown, base: string = DEFAULT_FROM): string {
  const name = sanitizeFromName(fromName)
  if (!name) return base
  const match = base.match(/<([^>]+)>/)
  const address = match ? match[1] : base
  return `${name} <${address}>`
}

/**
 * Load a campaign's optional per-campaign envelope From ADDRESS (campaigns.from_address). Mirrors
 * loadCampaignFromName: selected via a string-typed column name so the not-yet-regenerated types never trip the
 * compiler, and fail-safe (returns null pre-migration or on any error). Returns the sanitized address, or null.
 */
export async function loadCampaignFromAddress(campaignId: string): Promise<string | null> {
  try {
    const db = createAdminClient()
    const col: string = 'from_address'
    const { data, error } = await db.from('campaigns').select(col).eq('id', campaignId).maybeSingle()
    if (error || !data) return null
    const v = (data as unknown as Record<string, unknown>)[col]
    const clean = sanitizeFromAddress(v)
    return clean || null
  } catch {
    return null
  }
}

/**
 * The SINGLE source of truth for a campaign's From header, used by BOTH the real send (sendCampaignNow) and the
 * test send (sendTestEmail) so a test shows EXACTLY the From a recipient will see — they can never diverge.
 * Precedence: per-campaign `from_address` → `EMAIL_BROADCAST_FROM` → platform default, with the friendly
 * `from_name` swapped on top. Fail-safe pre-migration (both reads return null → the broadcast/platform default).
 */
export async function resolveCampaignFromHeader(campaignId: string): Promise<string> {
  const fromAddress = await loadCampaignFromAddress(campaignId)
  const fromBase = fromAddress ?? BROADCAST_FROM
  return buildCampaignFrom(await loadCampaignFromName(campaignId), fromBase)
}

/**
 * Best-effort read of a campaign's per-send From NAME (the `from_name` column, added by the
 * 20261166000000_campaign_from_name migration). FAIL-SAFE: before that migration is applied the column does
 * not exist and PostgREST returns an error, which we swallow and treat as "no name set" (→ default From). The
 * column is selected via a `string`-typed variable (not a literal) so the not-yet-generated type never trips
 * the compiler. Returns the trimmed name, or null.
 */
export async function loadCampaignFromName(campaignId: string): Promise<string | null> {
  try {
    const db = createAdminClient()
    const col: string = 'from_name'
    const { data, error } = await db.from('campaigns').select(col).eq('id', campaignId).maybeSingle()
    if (error || !data) return null
    const v = (data as unknown as Record<string, unknown>)[col]
    return typeof v === 'string' && v.trim() ? v : null
  } catch {
    return null
  }
}

/**
 * The BRAND reply address for a broadcast. A recipient hits Reply and reaches the Frequency inbox, never
 * an individual's personal account. This is the address Resend inbound is pointed at (ADR-629): once inbound
 * is configured, every reply lands as a ticket on the CRM Inbox timeline (/admin/crm/inbox) and alerts the
 * owner. Override per-deployment with the EMAIL_REPLY_TO env var.
 */
export const BRAND_REPLY_TO = 'hello@frequencylocal.com'

/**
 * Resolve the Reply-To for a campaign. It is ALWAYS the brand inbox (EMAIL_REPLY_TO env, else BRAND_REPLY_TO)
 * so replies feed the CRM Inbox as tickets, not anyone's private mailbox. The `campaignId` is accepted for a
 * future per-campaign/per-Space override but is intentionally unused today. Fail-safe: returns undefined only
 * if the configured value is not a valid address (the send then falls back to the noreply envelope).
 */
export async function loadCampaignReplyTo(_campaignId: string): Promise<string | undefined> {
  const override = process.env.EMAIL_REPLY_TO
  const addr = (override && override.trim()) || BRAND_REPLY_TO
  return addr.includes('@') ? addr : undefined
}

/**
 * Best-effort read of a campaign's reply_mode (20261210000000_conversations_spine migration, ADR-812).
 * FAIL-SAFE: before that migration the column does not exist and PostgREST errors — swallowed and treated
 * as 'broadcast' (today's behavior), so an unmigrated DB never breaks a send. Selected via a string-typed
 * variable (not a literal) so the not-yet-generated type never trips the compiler.
 */
export async function loadCampaignReplyMode(campaignId: string): Promise<'broadcast' | 'conversation'> {
  try {
    const db = createAdminClient()
    const col: string = 'reply_mode'
    const { data, error } = await db.from('campaigns').select(col).eq('id', campaignId).maybeSingle()
    if (error || !data) return 'broadcast'
    return (data as unknown as Record<string, unknown>)[col] === 'conversation' ? 'conversation' : 'broadcast'
  } catch {
    return 'broadcast'
  }
}

/** The campaign creator profile id — the sender-trail owner for conversation mode. Fail-safe null. */
async function loadCampaignCreatorProfileId(campaignId: string): Promise<string | null> {
  try {
    const db = createAdminClient()
    const { data, error } = await db.from('campaigns').select('created_by').eq('id', campaignId).maybeSingle()
    if (error || !data) return null
    const v = (data as unknown as Record<string, unknown>).created_by
    return typeof v === 'string' && v ? v : null
  } catch {
    return null
  }
}

// ── Size guard (Gmail clips a message past ~102 KB) ─────────────────────────────
// We warn a touch under the clip so an operator can trim before the footer / unsubscribe
// gets cut off. Measured on the compiled HTML's UTF-8 byte length (what the mailbox sees).

/** Warn when the compiled HTML crosses this many bytes (95 KB, safely under Gmail's 102 KB clip). */
export const EMAIL_SIZE_WARN_BYTES = 95 * 1024

/** Pure: does this compiled HTML exceed the size guard? Unit-tested. */
export function exceedsEmailSizeGuard(html: string): boolean {
  return emailHtmlByteLength(html) > EMAIL_SIZE_WARN_BYTES
}

/** UTF-8 byte length of the compiled HTML (what a mailbox provider measures). Pure. */
export function emailHtmlByteLength(html: string): number {
  return Buffer.byteLength(html, 'utf8')
}

/** The human warning copy for an oversized email (voice canon: plain, no em dashes). */
export function emailSizeWarning(bytes: number): string {
  const kb = Math.round(bytes / 1024)
  return `This email is ${kb} KB. Gmail clips messages over about 102 KB, so the footer and unsubscribe link may be hidden. Trim the content before you send.`
}

// ── Voice lint (docs/CONTENT-VOICE.md §10.8 in code, lib/email-studio/voice-lint) ──
// The machine-checkable floor under every campaign an operator sends (LIVE-066). The module's own
// contract sets the severities and the send path honors them exactly: the EM / EN DASH is "the HARD
// rule (`hasEmDash`) ... the one a caller may refuse on" and copy carrying one "is not shippable as
// written", so scheduleCampaign and sendCampaignNow REFUSE on it; the banned-phrase and exclamation
// findings are "Warnings: a human decides", so they surface to the operator (the send panel's voice
// preflight) and never block a send.

/** A campaign doc's AUTHORED copy as one lintable string: subject + preheader + the per-block content
 *  map — the same assembly the preset suite holds every shipped template to (presets.test.ts). Pure. */
export function campaignAuthoredCopy(doc: EmailDoc): string {
  return [doc.subject, doc.preheader, JSON.stringify(doc.layout.content ?? {})].join('\n')
}

/** The operator-facing refusal for the lint's one hard rule. Plain voice, actionable. */
export const VOICE_EM_DASH_ERROR =
  'This email contains an em or en dash. We keep those out of everything we send, so swap each one for a period, comma, or parentheses, then try again.'

/** Lint a stored campaign's authored copy. Returns the hard-rule flag plus the soft findings as
 *  operator-facing lines (the em dash line is excluded: it is the refusal, not a warning). */
export async function lintCampaignVoice(
  campaignId: string,
): Promise<ActionResult<{ hasEmDash: boolean; warnings: string[] }>> {
  const row = await loadCampaign(campaignId)
  if (!row) return fail('That campaign no longer exists.')
  const doc: EmailDoc = { ...docFromRow(row), subject: row.subject }
  const lint = lintVoice(campaignAuthoredCopy(doc))
  return ok({
    hasEmDash: lint.hasEmDash,
    warnings: lint.violations.filter((v) => v.rule !== 'em-dash').map((v) => v.detail),
  })
}

// ── The pure lifecycle state machine ────────────────────────────────────────────
// draft -> scheduled -> sending -> sent ; scheduled -> cancelled ; sending -> paused -> sending

/** The send-lifecycle status held on `campaigns.status`. */
export type CampaignStatus = 'draft' | 'scheduled' | 'sending' | 'sent' | 'paused' | 'cancelled' | 'failed'

/** A lifecycle action an operator (or the sender) can take on a campaign. */
export type CampaignAction = 'schedule' | 'send' | 'complete' | 'pause' | 'resume' | 'cancel'

/** The allowed transitions. Anything not listed is refused (returns null). */
const TRANSITIONS: Record<CampaignStatus, Partial<Record<CampaignAction, CampaignStatus>>> = {
  draft: { schedule: 'scheduled', send: 'sending', cancel: 'cancelled' },
  scheduled: { send: 'sending', schedule: 'scheduled', pause: 'paused', cancel: 'cancelled' },
  sending: { complete: 'sent', pause: 'paused' },
  paused: { resume: 'sending', cancel: 'cancelled' },
  sent: {},
  cancelled: {},
  // A send that errored (stamped by the scheduled-send cron). RECOVERABLE: an operator can re-send it
  // or re-schedule it once the cause is fixed, instead of the campaign being stuck forever (before this,
  // 'failed' had no transitions, so the composer's Send/Schedule refused it — a dead end).
  failed: { send: 'sending', schedule: 'scheduled', cancel: 'cancelled' },
}

/**
 * The whole lifecycle policy as one pure function: given the current status and an action,
 * return the next status, or null when the transition is not allowed. Deterministic + total;
 * the truth table lives in the unit test.
 */
export function nextCampaignStatus(current: string, action: CampaignAction): CampaignStatus | null {
  const row = TRANSITIONS[current as CampaignStatus]
  if (!row) return null
  return row[action] ?? null
}

// ── Row loading + the EmailDoc it carries ───────────────────────────────────────

interface CampaignSendRow {
  id: string
  subject: string
  preheader: string | null
  block_json: EntityLayout | null
  segment: string
  status: string
  phase_id: string | null
  sent_at: string | null
  scheduled_for: string | null
}

const SEND_COLS = 'id, subject, preheader, block_json, segment, status, phase_id, sent_at, scheduled_for'

// ── The send lease (scan2 L5-04, 2026-09-05) ────────────────────────────────────
// A campaign is claimed to 'sending' before the recipient loop and must NEVER be left there once
// sendCampaignNow returns: success writes 'sent', any failure writes 'failed' with the count queued
// so far and the error. The one way a row can still sit at 'sending' is a process that died mid-loop
// (a function timeout), and for that the claim stamps `sending_started_at`, the SAME lease column the
// scheduled-send cron and the drip runner use (scan2 L6-10, migration 20270345000800, the shared
// isSendingLeaseStale / SENDING_LEASE_MS in lib/messaging/status.ts), so the console's 'stalled'
// reading and this refusal agree. A 'sending' row whose stamp is older than the lease is treated as
// abandoned and may be re-sent. A row with NO stamp is treated as in flight (fail closed), exactly as
// the cron treats it: pre-migration the column does not exist, and a row stranded before the column
// existed is moved by hand (the note at the bottom of that migration).

/** Whether a 'sending' row's lease has run out. Untyped read of `sending_started_at` (the generated
 *  types are regenerated separately, ADR-246). FAIL CLOSED: unreadable / missing / pre-migration = in
 *  flight. */
async function sendLeaseExpired(campaignId: string, now: number = Date.now()): Promise<boolean> {
  try {
    const db = createAdminClient()
    const col: string = 'sending_started_at'
    const { data, error } = await db.from('campaigns').select(col).eq('id', campaignId).maybeSingle()
    if (error || !data) return false
    const v = (data as unknown as Record<string, unknown>)[col]
    return typeof v === 'string' && isSendingLeaseStale(v, now)
  } catch {
    return false
  }
}

/** Best-effort write of the lease / error columns (`sending_started_at`, `send_error`), untyped because
 *  they are newer than the generated types. Pre-migration the update errors and the send goes on
 *  without a lease, exactly as before. Never throws. */
async function stampSendColumns(campaignId: string, patch: Record<string, unknown>): Promise<boolean> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = createAdminClient() as unknown as { from: (t: string) => any }
    const { error } = await db.from('campaigns').update(patch).eq('id', campaignId)
    return !error
  } catch {
    return false
  }
}

/** Record a send that did not complete: status 'failed', `recipient_count` = how many emails were
 *  queued before it stopped, and the error on `send_error`. The status write is what gets the row out
 *  of 'sending', so it is tried twice before giving up; the error note is best-effort. */
async function recordSendFailed(campaignId: string, queuedSoFar: number, message: string): Promise<boolean> {
  const db = createAdminClient()
  for (let attempt = 1; attempt <= 2; attempt++) {
    const { error } = await db
      .from('campaigns')
      .update({ status: 'failed', recipient_count: queuedSoFar })
      .eq('id', campaignId)
    if (!error) {
      await stampSendColumns(campaignId, { send_error: message.slice(0, 500) })
      return true
    }
    console.error('[email-studio] could not record the failed send', { campaignId, attempt, error: error.message })
  }
  return false
}

/** Operator copy for a send that stopped part-way: what was queued, what the status is now, and what
 *  sending again does. Exported for the test. Plain voice, no em dashes. */
export function sendStoppedCopy(queued: number, recorded: boolean): string {
  const status = recorded
    ? 'The campaign is marked failed.'
    : 'The campaign status could not be updated, so it may still show as sending.'
  if (queued === 0) return `The send stopped before any email was queued. ${status} Fix the cause and send again.`
  const n = queued === 1 ? '1 email was' : `${queued} emails were`
  return `The send stopped after ${n} queued. ${status} Sending again reaches the whole audience, including the people already queued.`
}

/** Operator copy for the rarer case: every email was queued but the 'sent' write failed. */
export function sentUnrecordedCopy(queued: number, recorded: boolean): string {
  const status = recorded ? 'It is marked failed with a note instead.' : 'It may still show as sending.'
  return `All ${queued} emails were queued, but the campaign could not be marked sent. ${status} Do not send it again: those emails already went out.`
}

async function loadCampaign(campaignId: string): Promise<CampaignSendRow | null> {
  const db = createAdminClient()
  const { data } = await db.from('campaigns').select(SEND_COLS).eq('id', campaignId).maybeSingle()
  if (!data) return null
  return {
    id: String(data.id),
    subject: String(data.subject ?? ''),
    preheader: (data.preheader as string) ?? null,
    block_json: (data.block_json as EntityLayout | null) ?? null,
    segment: String(data.segment ?? ''),
    status: String(data.status ?? 'draft'),
    phase_id: (data.phase_id as string) ?? null,
    sent_at: (data.sent_at as string) ?? null,
    scheduled_for: (data.scheduled_for as string) ?? null,
  }
}

/** The EmailDoc a campaign row carries: block_json is the body layout; subject + preheader
 *  live on their own columns. Fail-safe: a null block_json yields an empty layout. */
function docFromRow(row: CampaignSendRow): EmailDoc {
  const layout: EntityLayout = row.block_json ?? { rows: [] }
  return { layout, subject: row.subject ?? '', preheader: row.preheader ?? '' }
}

// ── Per-recipient merge variables ────────────────────────────────────────────────
// The curated safe set (types.ts MERGE_TAG_VARIABLES): a contact's first / last name +
// email. We derive first / last from the contact's display_name (there is no split name
// column). All values are HTML-escaped by applyMergeTags, so a merge value cannot inject.

interface ContactVars {
  firstName: string
  lastName: string
  email: string
}

/** Split a display name into first / rest. Pure. */
function splitName(displayName: string | null): { firstName: string; lastName: string } {
  const trimmed = (displayName ?? '').trim()
  if (!trimmed) return { firstName: '', lastName: '' }
  const parts = trimmed.split(/\s+/)
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') }
}

/** Build the `{{contact.*}}` variable bag for one recipient. Pure. */
function mergeVars(c: ContactVars): Record<string, string> {
  return {
    'contact.first_name': c.firstName,
    'contact.last_name': c.lastName,
    'contact.email': c.email,
  }
}

/** Load display_name for a set of contact ids so the send loop can personalize. Fail-safe to {}. */
async function loadContactNames(contactIds: string[]): Promise<Map<string, string | null>> {
  const map = new Map<string, string | null>()
  if (!contactIds.length) return map
  const db = createAdminClient()
  const { data } = await db.from('contacts').select('id, display_name').in('id', contactIds)
  for (const r of data ?? []) map.set(String(r.id), (r.display_name as string) ?? null)
  return map
}

// ── compileCampaign: render block_json -> html/text, persist, size-check ─────────

export interface CompileResult {
  html: string
  text: string
  subject: string
  preheader: string
  bytes: number
  /** Set when the compiled HTML crosses the size guard (Gmail clip risk); null otherwise. */
  warning: string | null
}

/**
 * Compile a campaign's `block_json` into send-ready html/text via compileEmailDoc, persist
 * `compiled_html` (+ subject / preheader) back on the row, and enforce the size guard. The
 * persisted HTML keeps merge tags intact (they resolve per recipient at send). Returns the
 * compiled artifacts + a warning when the HTML risks the Gmail clip.
 */
export async function compileCampaign(campaignId: string): Promise<ActionResult<CompileResult>> {
  const row = await loadCampaign(campaignId)
  if (!row) return fail('That campaign no longer exists.')

  const doc = docFromRow(row)
  // Refresh any data-bound Product card from the live catalog before compiling, so the saved preview HTML
  // carries the current photo / price / link (Phase 4).
  const resolvedDoc: EmailDoc = { ...doc, layout: await resolveProductRefs(doc.layout) }
  const compiled = compileEmailDoc(resolvedDoc)
  const bytes = emailHtmlByteLength(compiled.html)
  const warning = bytes > EMAIL_SIZE_WARN_BYTES ? emailSizeWarning(bytes) : null

  const db = createAdminClient()
  const { error } = await db
    .from('campaigns')
    .update({ compiled_html: compiled.html, subject: compiled.subject, preheader: compiled.preheader })
    .eq('id', campaignId)
  if (error) return fail('Could not save the compiled email.')

  return ok({
    html: compiled.html,
    text: compiled.text,
    subject: compiled.subject,
    preheader: compiled.preheader,
    bytes,
    warning,
  })
}

// ── resolveCampaignAudience: count only ──────────────────────────────────────────

export interface AudienceResult {
  segment: string
  count: number
}

/** Resolve the campaign's stored segment to a recipient COUNT (pre-gate membership). The
 *  actual queued count at send can be lower once each recipient passes the send-gate. */
export async function resolveCampaignAudience(campaignId: string): Promise<ActionResult<AudienceResult>> {
  const row = await loadCampaign(campaignId)
  if (!row) return fail('That campaign no longer exists.')
  return countAudience(row.segment)
}

/** Resolve an explicit segment key to a count (used by the send-panel preview). */
export async function countAudience(segment: SegmentKey): Promise<ActionResult<AudienceResult>> {
  try {
    const recipients = await resolveSegment(segment)
    return ok({ segment, count: recipients.length })
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Could not resolve that audience.')
  }
}

// ── scheduleCampaign: validate + arm a future send ───────────────────────────────

/**
 * Schedule a campaign: validate the doc compiles + has a subject + a non-empty audience,
 * then set status 'scheduled' and store the chosen segment + send time. Scheduling reuses
 * the existing `campaigns.scheduled_for` timestamp column (no migration). It deliberately
 * does NOT touch approval_status: a spine-tracked campaign's approval is governed by the
 * spine and is re-checked at the real send (assertApproved).
 */
export async function scheduleCampaign(
  campaignId: string,
  input: { segment: SegmentKey; scheduledAt: string },
): Promise<ActionResult<{ scheduledFor: string; count: number }>> {
  const row = await loadCampaign(campaignId)
  if (!row) return fail('That campaign no longer exists.')

  const next = nextCampaignStatus(row.status, 'schedule')
  if (!next) return fail(`A ${row.status} campaign cannot be scheduled.`)

  const when = new Date(input.scheduledAt)
  if (Number.isNaN(when.getTime())) return fail('Pick a valid date and time to send.')
  if (when.getTime() <= Date.now()) return fail('The send time has to be in the future.')

  const doc: EmailDoc = { ...docFromRow(row), subject: row.subject }
  if (!doc.subject.trim()) return fail('Add a subject line before you schedule.')
  const compiled = compileEmailDoc(doc)
  if (!compiled.html) return fail('This email has no content to send.')

  // Voice floor (voice-lint): scheduling ARMS a send, so the one hard rule is enforced here too.
  if (lintVoice(campaignAuthoredCopy(doc)).hasEmDash) return fail(VOICE_EM_DASH_ERROR)

  const audience = await countAudience(input.segment)
  if ('error' in audience) return audience
  if (audience.data.count === 0) return fail('This audience is empty. Pick a segment with recipients.')

  const db = createAdminClient()
  const { error } = await db
    .from('campaigns')
    .update({ status: next, segment: input.segment, scheduled_for: when.toISOString() })
    .eq('id', campaignId)
  if (error) return fail('Could not schedule this campaign.')

  return ok({ scheduledFor: when.toISOString(), count: audience.data.count })
}

// ── sendCampaignNow: the real, gated, per-recipient send ─────────────────────────

/**
 * THE SEND. Idempotent (refuses an already-sent campaign). For a spine-tracked campaign
 * (phase_id set) it calls assertApproved FIRST, so nothing sends without approval. It compiles the
 * body from block_json, resolves the segment, and for each recipient runs the ONE unified
 * send-gate (suppression + consent + preference) before enqueuing a per-recipient email on
 * the durable outbox, with merge tags + one-click unsubscribe headers applied. Marks the
 * row 'sending' up front (so a double click cannot re-enter) then 'sent' with the count.
 * 2026-09-05 (scan2 L5-04): and NEVER leaves it at 'sending' on return. A failure after the claim
 * writes 'failed' with the count queued so far and the error; a failed 'sent' write is reported to
 * the operator instead of being discarded with an `ok`. The "already sending" refusal below applies
 * only while the send lease (SENDING_LEASE_MS, lib/messaging/status.ts) is live, so a row abandoned
 * by a dead process is re-sendable instead of stuck.
 */
export async function sendCampaignNow(campaignId: string): Promise<ActionResult<{ recipientCount: number }>> {
  const row = await loadCampaign(campaignId)
  if (!row) return fail('That campaign no longer exists.')

  // Idempotency: never double-send.
  if (row.status === 'sent' || row.sent_at) return fail('This campaign has already been sent.')
  if (row.status === 'sending' && !(await sendLeaseExpired(campaignId))) {
    return fail('This campaign is already sending.')
  }

  // An abandoned 'sending' row (lease expired) is re-claimed in place; the state machine has no
  // sending -> sending edge on purpose, so the re-claim is explicit here.
  const next = row.status === 'sending' ? 'sending' : nextCampaignStatus(row.status, 'send')
  if (!next) return fail(`A ${row.status} campaign cannot be sent.`)

  // THE GOVERNING RULE for a spine-tracked campaign: refuse unless the spine has approved this row.
  if (row.phase_id) {
    try {
      await assertApproved({ type: 'campaign', id: campaignId })
    } catch (err) {
      return fail(err instanceof Error ? err.message : 'Refused: this campaign is not approved.')
    }
  }

  const rawDoc: EmailDoc = { ...docFromRow(row), subject: row.subject }
  const subjectTemplate = rawDoc.subject.trim()
  if (!subjectTemplate) return fail('The campaign has no subject to send.')

  // Voice floor (voice-lint, LIVE-066): the module's ONE hard rule. Copy with an em or en dash "is not
  // shippable as written", so the real send refuses BEFORE the row is claimed; the soft findings
  // (banned phrases, exclamations) are warnings the panel surfaces and never block.
  if (lintVoice(campaignAuthoredCopy(rawDoc)).hasEmDash) return fail(VOICE_EM_DASH_ERROR)

  // Resolve the data-bound Product card ONCE (before the recipient loop) so every recipient's email ships the
  // current catalog data, and expose its `{{product.*}}` tokens as merge fallbacks (Phase 4).
  const doc: EmailDoc = { ...rawDoc, layout: await resolveProductRefs(rawDoc.layout) }
  const productVars = productVarsFromLayout(doc.layout)

  // The send From: a per-campaign envelope ADDRESS (from_address) if set, else the broadcast default
  // (EMAIL_BROADCAST_FROM), else the platform noreply — then the friendly display NAME (from_name) swapped on
  // top. Fail-safe: pre-migration both reads return null and we send from the broadcast/platform default. The
  // from_address domain must be Resend-verified (an ops step); sanitizeFromAddress only format-checks it.
  const fromHeader = await resolveCampaignFromHeader(campaignId)

  // Reply-To so a recipient can just hit Reply and reach a human (the envelope From stays the verified
  // noreply domain). Precedence: EMAIL_REPLY_TO (a platform reply address — point it at the CRM inbound-
  // parse address to capture replies on the Inbox timeline) → else the campaign creator's own email, so a
  // reply lands in their inbox with zero setup. Null when neither resolves (replies fall back to noreply).
  const replyTo = await loadCampaignReplyTo(campaignId)

  // CONVERSATION mode (ADR-812): a ticketed 1:1 send. Each recipient gets a per-conversation Reply-To so
  // their reply routes back to the exact thread, and the send is recorded as an outbound conversation
  // message. DORMANT unless the composer set reply_mode='conversation' — the default 'broadcast' leaves
  // the recipient enqueue byte-for-byte identical to today. Requires an owner (the campaign creator) to
  // hang the sender trail on; if that cannot be resolved we fall back to broadcast so a send is never
  // blocked. The conversational From is a display-name swap onto the verified conversational identity.
  // 2026-09-05 (scan2 L3-06): conversation mode also needs the reply-address signing secret; without it
  // (production, CONVERSATION_TOKEN_SECRET unset) buildConversationReplyAddress throws mid-loop. Fall back
  // to broadcast the same way a missing owner does, so the send still lands (the predicate logs it).
  const replyMode = await loadCampaignReplyMode(campaignId)
  const ownerProfileId = replyMode === 'conversation' ? await loadCampaignCreatorProfileId(campaignId) : null
  const conversationMode = replyMode === 'conversation' && !!ownerProfileId && conversationSigningAvailable()
  // 2026-09-05 (scan2 L3-01 + L3-02): the conversational From comes from the shared helper, which takes
  // the ADDRESS out of EMAIL_CONVERSATION_FROM / EMAIL_FROM (either form, blank = unset) and puts the
  // campaign's display name in front of it, quoted when RFC 5322 needs it. Brand form (no "via").
  const conversationFromHeader = conversationMode
    ? conversationFrom(sanitizeFromName(await loadCampaignFromName(campaignId)) || null, { via: false })
    : fromHeader

  const db = createAdminClient()

  // ATOMIC CLAIM (not a bare update): flip → 'sending' ONLY while the row is still in the status we
  // read above, and require a row to come back. Two concurrent approver clicks both pass the
  // read-checks at the top, but only ONE wins this conditional update — the loser sees 0 rows and
  // bails, so the recipient loop runs exactly once. (A bare `.eq('id', …)` update, as before, let
  // both callers proceed and double-sent the whole campaign.) Mirrors the space-campaigns cron claim.
  const { data: claimed } = await db
    .from('campaigns')
    .update({ status: 'sending' })
    .eq('id', campaignId)
    .eq('status', row.status)
    .select('id')
  if (!claimed || (claimed as unknown[]).length === 0) {
    return fail('This campaign is already sending.')
  }
  // The lease: the moment this send took the row (scan2 L5-04). Best-effort, untyped, pre-migration no-op.
  await stampSendColumns(campaignId, { sending_started_at: new Date().toISOString(), send_error: null })

  let count = 0
  // One clock for the whole fan-out, so the drip (bulkRunAfter below) is measured from when the
  // send STARTED, not from each enqueue — otherwise a slow render would stretch the stagger.
  const fanOutStartedAt = new Date()
  try {
    const recipients = await resolveSegment(row.segment)
    const names = await loadContactNames(recipients.map((r) => r.contactId))
    // The send-gate category depends on the AUDIENCE (lib/studio/campaigns sendCategoryForSegment):
    // `subscribed_members` is the opt-IN marketing audience → 'marketing' (email_marketing, opt-in);
    // `members` / `site_signups` / trait / place / event / direct-set are the operator's own
    // account-holders → 'lifecycle' (opt-OUT member newsletter each member can still unsubscribe from).
    const sendCategory = sendCategoryForSegment(row.segment)
    // Root space id for the profile-less path (the `all_contacts` audience). Resolved once: profile-less
    // imported leads are suppression-gated against the root space and unsubscribe via a root-space token.
    const rootSpaceId = await loadRootSpaceId()

    for (const r of recipients) {
      let unsubscribeUrl: string
      // "Manage emails" opens the preference page (adjust categories / resubscribe), kept DISTINCT from the
      // one-click unsubscribe so it never fires the opt-out on load.
      let manageUrl: string
      if (r.profileId) {
        // Member / profile-bearing contact: the ONE unified send-gate (suppression + consent +
        // preference) — the same seam the marketing composer and the beta send ride, run under the
        // audience's consent category (see above).
        const decision = await resolveSendGate(r.profileId, 'email', sendCategory, { email: r.email })
        if (!decision.allowed) continue
        // The unsubscribe link toggles the lifecycle preference (the broad email opt-out); a global
        // broadcast unsubscribe is a hard opt-out regardless of the send's gate category.
        unsubscribeUrl = buildUnsubscribeUrl({ baseUrl: SITE_URL, profileId: r.profileId, category: 'lifecycle' })
        manageUrl = buildManageEmailsUrl({ baseUrl: SITE_URL, profileId: r.profileId, category: 'lifecycle' })
      } else {
        // Profile-less imported lead (only the `all_contacts` audience yields these). There is no profile
        // to run the member send-gate against, so gate by the hard suppression list (global OR root-space)
        // and rely on resolveSegment's not-unsubscribed filter — the opt-out subscriber model the owner
        // asked for. Unsubscribe rides the per-address root-space token (records a root-space suppression,
        // which isSuppressed then honors on the next send). A missing root space id → skip (fail-closed).
        if (!rootSpaceId) continue
        if (await isSuppressed(r.email, rootSpaceId)) continue
        unsubscribeUrl = buildSpaceUnsubscribeUrl({ baseUrl: SITE_URL, spaceId: rootSpaceId, email: r.email })
        // The per-Space /unsubscribe?s=&e= landing IS a preference center (opt down individual topics or
        // unsubscribe from everything), so "Manage emails" points a profile-less lead at that same token page.
        manageUrl = unsubscribeUrl
      }
      const { firstName, lastName } = splitName(names.get(r.contactId) ?? null)
      // Per-recipient contact vars, plus the shared product vars resolved above (a product is the same for
      // every recipient, so it rides the fallbacks bag).
      const vars = mergeVars({ firstName, lastName, email: r.email })
      const fallbacks = { ...MERGE_TAG_DEFAULT_FALLBACKS, ...productVars }

      // Compile per recipient so the footer carries THIS recipient's unsubscribe link, then
      // resolve merge tags: HTML gets escaped values (default), text + subject stay raw.
      const compiled = compileEmailDoc(doc, { unsubscribeUrl, manageUrl })
      const html = applyMergeTags(compiled.html, vars, { fallbacks })
      const text = applyMergeTags(compiled.text, vars, { fallbacks, escape: false })
      const subject = applyMergeTags(subjectTemplate, vars, { fallbacks, escape: false })

      // Tag the campaign id so its delivery/engagement events attribute EXACTLY (not by the old
      // segment+window heuristic). It rides two channels Resend echoes back on the webhook: a
      // custom header and a tag. The recorder (lib/suppression.recordEmailEvent) writes whichever
      // it finds to email_events.campaign_id, and getCampaignMetrics counts by it.
      // The send identity. BROADCAST (default) is unchanged: the campaign From, the brand Reply-To, and the
      // one-click unsubscribe headers. CONVERSATION swaps in the conversational From, a per-recipient
      // reply address that routes back to this recipient's thread, a Message-ID for client threading, and
      // DROPS List-Unsubscribe (this is transactional 1:1 human mail, not bulk).
      let emailFrom = fromHeader
      let emailReplyTo: string | undefined = replyTo
      let emailHeaders: Record<string, string> = { ...listUnsubscribeHeaders(unsubscribeUrl), 'X-Campaign-Id': campaignId }

      if (conversationMode) {
        const conv = await openOrGetConversation({
          kind: 'crm',
          externalEmail: r.email,
          ownerProfileId: ownerProfileId!,
          subject,
          contactId: r.contactId,
          memberProfileId: r.profileId ?? null,
          // Scope spine (ADR-827): first-class campaign scope, dual-written next to the legacy
          // metadata.campaign_id convention the workspace/webhook readers still consume.
          scopeKind: 'campaign',
          scopeId: campaignId,
          metadata: { campaign_id: campaignId },
        })
        // A DB hiccup (or an unmigrated table) → conv is null; fall back to the broadcast identity for THIS
        // recipient so the send still lands (the reply just won't thread).
        if (conv) {
          const messageId = newConversationMessageId(conv.ref)
          emailFrom = conversationFromHeader
          emailReplyTo = buildConversationReplyAddress(conv.ref)
          emailHeaders = { 'Message-ID': messageId, 'X-Campaign-Id': campaignId }
          await appendConversationMessage({
            conversationId: conv.id,
            direction: 'outbound',
            authorKind: 'leader',
            authorId: ownerProfileId!,
            body: text,
            bodyHtml: html,
            externalMessageId: messageId,
            mirror: {
              ownerProfileId: ownerProfileId!,
              subjectKind: r.profileId ? 'profile' : 'contact',
              subjectId: r.profileId ?? r.contactId,
              subject,
              // The mirrored touch carries the campaign lane too (ADR-827 scope spine).
              scope: { kind: 'campaign', id: campaignId },
            },
          })
        }
      }

      // The BULK lane, dripped. A campaign is mail nobody is sitting and waiting for, so it must
      // never be the reason a welcome email misses the daily sending quota (LIVE-091: on
      // 2026-07-17 a 356-recipient campaign took the quota and two welcomes dead-lettered behind
      // it). `bulkRunAfter` staggers when each job becomes DUE so the fan-out cannot fill the
      // claim window either — the claim is ordered by run_after and knows nothing about lanes.
      await enqueueEmail(
        {
          to: r.email,
          from: emailFrom,
          ...(emailReplyTo ? { replyTo: emailReplyTo } : {}),
          subject,
          html,
          text,
          headers: emailHeaders,
          tags: [{ name: 'campaign_id', value: campaignId }],
        },
        { lane: 'bulk', runAfter: bulkRunAfter(count, fanOutStartedAt) },
      )
      count++
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[email-studio] sendCampaignNow send loop failed', { campaignId, queuedSoFar: count, error: message })
    // The atomic claim above already flipped the row to 'sending'. A failure AFTER the claim (the
    // likely one: resolveSegment / loadContactNames throwing before any recipient is enqueued) must
    // NOT strand the row in 'sending' — it could then never be re-sent (sendCampaignNow refuses a
    // 'sending' row, and there is no 'sending' -> draft/scheduled transition). Reset the status back to
    // the pre-claim value so the campaign is re-sendable. Best-effort; nothing is ever marked 'sent'.
    // 2026-09-05 (scan2 L5-04): that reset was fire-and-forget (its result discarded) and it erased
    // the evidence: a send that had already queued N emails went back to 'draft' as if nothing
    // happened. It is now recorded as 'failed' (re-sendable: failed -> send) with the count queued so
    // far on recipient_count and the error on send_error, the write is checked and retried, and the
    // operator copy says exactly what happened.
    const recorded = await recordSendFailed(campaignId, count, message)
    return fail(sendStoppedCopy(count, recorded))
  }

  // 2026-09-05 (scan2 L5-04): this write's result used to be discarded, so a failed update returned
  // `ok` while the row stayed at 'sending' forever (and could never be re-sent). Check it; if it fails,
  // get the row out of 'sending' the other way and tell the operator the truth.
  const { error: sentError } = await db
    .from('campaigns')
    .update({ status: 'sent', recipient_count: count, sent_at: new Date().toISOString() })
    .eq('id', campaignId)
  if (sentError) {
    console.error('[email-studio] sendCampaignNow could not mark the campaign sent', {
      campaignId,
      queued: count,
      error: sentError.message,
    })
    const recorded = await recordSendFailed(
      campaignId,
      count,
      `Queued ${count} emails but could not record the sent status: ${sentError.message}`,
    )
    return fail(sentUnrecordedCopy(count, recorded))
  }

  return ok({ recipientCount: count })
}

// ── Lifecycle transitions: pause / cancel ────────────────────────────────────────

/**
 * Pause a campaign. Best-effort while sending (the in-flight loop is not interrupted, but a
 * scheduled campaign will not fire and the status reflects the hold). Guarded by the pure
 * state machine: only a scheduled or sending campaign can pause.
 */
export async function pauseCampaign(campaignId: string): Promise<ActionResult<{ status: CampaignStatus }>> {
  const row = await loadCampaign(campaignId)
  if (!row) return fail('That campaign no longer exists.')
  const next = nextCampaignStatus(row.status, 'pause')
  if (!next) return fail(`A ${row.status} campaign cannot be paused.`)
  const db = createAdminClient()
  const { error } = await db.from('campaigns').update({ status: next }).eq('id', campaignId)
  if (error) return fail('Could not pause this campaign.')
  return ok({ status: next })
}

/** Cancel a campaign (terminal). A scheduled or paused campaign can be cancelled; an
 *  in-flight send cannot (pause it first). Guarded by the state machine. */
export async function cancelCampaign(campaignId: string): Promise<ActionResult<{ status: CampaignStatus }>> {
  const row = await loadCampaign(campaignId)
  if (!row) return fail('That campaign no longer exists.')
  const next = nextCampaignStatus(row.status, 'cancel')
  if (!next) return fail(`A ${row.status} campaign cannot be cancelled.`)
  const db = createAdminClient()
  const { error } = await db.from('campaigns').update({ status: next, scheduled_for: null }).eq('id', campaignId)
  if (error) return fail('Could not cancel this campaign.')
  return ok({ status: next })
}
