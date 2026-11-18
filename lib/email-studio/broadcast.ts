// Email Studio campaigns as Resend BROADCASTS (EMAIL-076).
//
// WHY. The Resend team's Transactional plan is Free: 100 emails a day. A platform campaign sent one
// email at a time through the outbox spends that allowance, and the sign-in links, reminders and DMs
// that come after it are refused or accepted and then failed (EMAIL-060). The same team's Marketing
// plan is Pro (unlimited broadcasts, 5,000 contacts), so a campaign sent as ONE broadcast to a
// per-campaign segment costs no transactional quota at all. Owner ruling 2026-11-18 (option A).
//
// HOW. sendCampaignNow still decides WHO (resolveSegment) and still runs the one send gate per
// recipient. Instead of queueing one email each, it hands the allowed recipients here:
//   1. a fresh Resend segment for this campaign,
//   2. one CSV contact import (upsert) into that segment, carrying each recipient's signed
//      "Manage emails" link as the `manage_url` contact property,
//   3. one broadcast to that segment, sent now.
// The html is compiled ONCE with Resend placeholders: {{{RESEND_UNSUBSCRIBE_URL}}} for the one-click
// opt-out (Resend runs it and sets List-Unsubscribe), {{{contact.manage_url}}} for the preference page,
// and {{{contact.first_name|there}}} style merge tags. A Resend-side unsubscribe comes back through the
// contact.updated webhook and becomes a root-Space suppression (app/api/webhooks/resend/route.ts).
//
// The import does not map Resend's own `unsubscribed` column, so an upsert never re-subscribes someone
// who opted out on Resend's page. Resend skips unsubscribed contacts in every broadcast.
//
// DARK until EMAIL_BROADCASTS_ENABLED is on (lib/env/string envFlag). Conversation-mode campaigns
// (1:1 replies) and the quiet-member trigger stay on the outbox.

import { Resend } from 'resend'
import { envFlag, envStringOrNull } from '@/lib/env/string'

/** The rollout switch. Off: every campaign takes the outbox path exactly as before. */
export function broadcastsEnabled(): boolean {
  return envFlag('EMAIL_BROADCASTS_ENABLED')
}

/** The Resend placeholder for the per-recipient one-click opt-out Resend generates. */
export const RESEND_UNSUBSCRIBE_PLACEHOLDER = '{{{RESEND_UNSUBSCRIBE_URL}}}'
/** The contact property that carries each recipient's signed "Manage emails" link. */
export const MANAGE_URL_PROPERTY = 'manage_url'
export const MANAGE_URL_PLACEHOLDER = `{{{contact.${MANAGE_URL_PROPERTY}}}}`

/** The contact fields Resend can personalize from, by our merge-tag token. */
const RESEND_CONTACT_FIELDS: Readonly<Record<string, string>> = {
  'contact.first_name': 'contact.first_name',
  'contact.last_name': 'contact.last_name',
  'contact.email': 'contact.email',
}

// Our merge-tag grammar (lib/email-studio/render.ts MERGE_TAG_RE): {{ token }} or {{ token | "fallback" }}.
// The lookarounds skip a Resend {{{placeholder}}} already in the html (the footer's unsubscribe and
// manage links), which the plain grammar would otherwise read as one of ours and erase.
const MERGE_TAG_RE = /(?<!\{)\{\{(?!\{)\s*([a-zA-Z0-9_.]+)\s*(?:\|\s*"([^"]*)")?\s*\}\}(?!\})/g

/** A fallback is written inside a Resend placeholder, so it can never carry the placeholder's own
 *  delimiters. Braces and pipes are dropped; the rest is HTML-escaped when `escape` is on. */
function placeholderFallback(raw: string, escape: boolean): string {
  const clean = raw.replace(/[{}|]/g, '').trim()
  return escape ? escapeHtml(clean) : clean
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

/**
 * Turn our per-recipient contact merge tags into Resend's placeholders, so ONE html serves the whole
 * segment and Resend fills each recipient in. A contact token becomes {{{contact.x|fallback}}} (the
 * inline fallback first, else the default bag); any other token (a product field) is resolved now from
 * `fallbacks`, because it is the same for every recipient. Pure + total.
 */
export function toResendMergeTags(
  input: string,
  fallbacks: Readonly<Record<string, string>>,
  opts: { escape?: boolean } = {},
): string {
  const escape = opts.escape !== false
  return input.replace(MERGE_TAG_RE, (_m, token: string, inline: string | undefined) => {
    const field = RESEND_CONTACT_FIELDS[token]
    const fallback = inline !== undefined ? inline : (fallbacks[token] ?? '')
    if (field) {
      const fb = placeholderFallback(fallback, escape)
      // contact.email always resolves, so it carries no fallback.
      return field === 'contact.email' || !fb ? `{{{${field}}}}` : `{{{${field}|${fb}}}}`
    }
    return escape ? escapeHtml(fallback) : fallback
  })
}

/** Resolve every merge tag to its fallback, with no per-recipient values. For the subject line, which
 *  stays static so a recipient can never see a raw placeholder in an inbox list. Pure. */
export function resolveStaticMergeTags(input: string, fallbacks: Readonly<Record<string, string>>): string {
  return input.replace(MERGE_TAG_RE, (_m, token: string, inline: string | undefined) =>
    inline !== undefined ? inline : (fallbacks[token] ?? ''),
  )
}

export interface BroadcastRecipient {
  email: string
  firstName: string
  lastName: string
  manageUrl: string
}

/** One RFC 4180 field: quoted when it holds a comma, quote, CR or LF; quotes doubled. A leading
 *  formula character is defused so a name can never run as a spreadsheet formula if the file is opened. */
function csvField(v: string): string {
  let s = v.replace(/\r?\n|\r/g, ' ')
  if (/^[=+\-@\t]/.test(s)) s = `'${s}`
  return /[",]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** The import file: one header row and one row per recipient, de-duplicated by lowercased address.
 *  Pure. */
export function contactsCsv(recipients: readonly BroadcastRecipient[]): string {
  const seen = new Set<string>()
  const lines = ['email,first_name,last_name,manage_url']
  for (const r of recipients) {
    const email = r.email.trim().toLowerCase()
    if (!email || seen.has(email)) continue
    seen.add(email)
    lines.push([email, r.firstName, r.lastName, r.manageUrl].map(csvField).join(','))
  }
  return `${lines.join('\n')}\n`
}

/** The broadcast name: the campaign id, so a re-run finds the broadcast it already made. */
export function broadcastName(campaignId: string): string {
  return `campaign:${campaignId}`
}

export interface BroadcastSendInput {
  campaignId: string
  from: string
  replyTo?: string
  subject: string
  previewText?: string
  html: string
  text: string
  recipients: readonly BroadcastRecipient[]
}

export interface BroadcastSendResult {
  broadcastId: string
  /** True when an earlier run already created this campaign's broadcast and nothing new was sent. */
  existing: boolean
}

/** How long to wait for the contact import, and how often to look. A Vercel function has 300 s. */
const IMPORT_WAIT_MS = 120_000
const IMPORT_POLL_MS = 2_000

type Sleep = (ms: number) => Promise<void>
const realSleep: Sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function client(): Resend {
  const key = envStringOrNull('RESEND_API_KEY')
  if (!key) throw new Error('RESEND_API_KEY is not set, so a broadcast cannot be sent.')
  return new Resend(key)
}

/** Make sure the `manage_url` contact property exists. Resend refuses an import that maps an
 *  undefined property. */
async function ensureManageUrlProperty(resend: Resend): Promise<void> {
  const listed = await resend.contactProperties.list()
  if (listed.error) throw new Error(`Could not read Resend contact properties: ${listed.error.message}`)
  if ((listed.data?.data ?? []).some((p) => p.key === MANAGE_URL_PROPERTY)) return
  const created = await resend.contactProperties.create({ key: MANAGE_URL_PROPERTY, type: 'string', fallbackValue: '' })
  if (created.error) throw new Error(`Could not create the Resend contact property: ${created.error.message}`)
}

/** The broadcast an earlier run of this campaign already created, if any. Read so a crash between
 *  "broadcast sent" and "campaign marked sent" never sends the campaign twice. */
async function findExistingBroadcast(resend: Resend, campaignId: string): Promise<string | null> {
  const name = broadcastName(campaignId)
  // The newest 100. A re-run follows its first attempt within minutes, so its broadcast is near the top.
  const listed = await resend.broadcasts.list({ limit: 100 })
  if (listed.error) throw new Error(`Could not read Resend broadcasts: ${listed.error.message}`)
  const hit = (listed.data?.data ?? []).find((b) => b.name === name)
  return hit ? hit.id : null
}

async function waitForImport(resend: Resend, importId: string, sleep: Sleep): Promise<void> {
  const deadline = Date.now() + IMPORT_WAIT_MS
  for (;;) {
    const got = await resend.contacts.imports.get(importId)
    if (got.error) throw new Error(`Could not read the Resend contact import: ${got.error.message}`)
    const status = got.data?.status
    if (status === 'completed') {
      const failed = got.data?.counts?.failed ?? 0
      if (failed > 0) console.warn('[email-studio] broadcast import skipped some contacts', { importId, failed })
      return
    }
    if (status === 'failed') throw new Error('The Resend contact import failed.')
    if (Date.now() >= deadline) throw new Error('The Resend contact import did not finish in time.')
    await sleep(IMPORT_POLL_MS)
  }
}

/**
 * Send one campaign as a Resend broadcast. Throws on any provider error, so the caller records the
 * campaign as failed (re-sendable) rather than sent. Idempotent per campaign: when a broadcast named
 * for this campaign already exists, nothing new is created or sent.
 */
export async function sendCampaignAsBroadcast(
  input: BroadcastSendInput,
  deps: { resend?: Resend; sleep?: Sleep } = {},
): Promise<BroadcastSendResult> {
  const resend = deps.resend ?? client()
  const sleep = deps.sleep ?? realSleep

  const existing = await findExistingBroadcast(resend, input.campaignId)
  if (existing) return { broadcastId: existing, existing: true }

  await ensureManageUrlProperty(resend)

  const segment = await resend.segments.create({ name: broadcastName(input.campaignId) })
  if (segment.error || !segment.data) throw new Error(`Could not create the Resend segment: ${segment.error?.message ?? 'no id'}`)
  const segmentId = segment.data.id

  const csv = contactsCsv(input.recipients)
  const imported = await resend.contacts.imports.create({
    file: new Blob([csv], { type: 'text/csv' }),
    columnMap: {
      email: 'email',
      firstName: 'first_name',
      lastName: 'last_name',
      properties: { [MANAGE_URL_PROPERTY]: { column: 'manage_url', type: 'string' } },
    },
    onConflict: 'upsert',
    segments: [{ id: segmentId }],
  })
  if (imported.error || !imported.data) throw new Error(`Could not import contacts to Resend: ${imported.error?.message ?? 'no id'}`)
  await waitForImport(resend, imported.data.id, sleep)

  const sent = await resend.broadcasts.create({
    name: broadcastName(input.campaignId),
    segmentId,
    from: input.from,
    ...(input.replyTo ? { replyTo: input.replyTo } : {}),
    subject: input.subject,
    ...(input.previewText ? { previewText: input.previewText } : {}),
    html: input.html,
    text: input.text,
    send: true,
  })
  if (sent.error || !sent.data) throw new Error(`Could not send the Resend broadcast: ${sent.error?.message ?? 'no id'}`)
  return { broadcastId: sent.data.id, existing: false }
}
