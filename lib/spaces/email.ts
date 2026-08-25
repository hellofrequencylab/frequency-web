// Per-Space EMAIL: the send backbone (ENTITY-SPACES-BUILD §C Phase 3, "Email / marketing / comms").
// This is the SEAM the email surface agent calls. It sends a Space's email through the EXISTING
// Resend sender (lib/email.ts), fail-closed and anti-spam-safe, and writes a per-recipient ledger
// (outreach_sends). It is the Email analog of lib/spaces/memberships.ts / lib/spaces/booking.ts:
// backed by the service-role admin client plus untyped casts (the new tables/columns are not in the
// generated DB types yet, ADR-246). The server is the authority for "which space" and "what may this
// caller do here" (P5): every write re-checks authorization; reads fail-safe (false/0), writes fail
// CLOSED on any miss.
//
// ANTI-SPAM IS THE WHOLE POINT. sendSpaceCampaign sends NOTHING unless ALL of these hold, in order:
//   (a) the caller has canEditProfile on the Space (owner / admin / editor);
//   (b) the Space's email KILL-SWITCH (spaces.email_enabled) is ON (default OFF, fail-closed);
//   (c) today's send count for the Space is under the conservative DAILY CAP;
//   (d) the recipient clears the lane's CONSENT BAR (ADR-1040) and is not suppressed (GLOBAL or
//       this-Space) -> otherwise logged as 'suppressed', not sent. The bar is the marketing double
//       opt-in for every lane except an event host mailing that event's own guests, which clears at
//       'transactional' (still blocked by suppression, a hard unsubscribe, and the per-topic mute).
// Each accepted send carries a per-Space From + Reply-To and an RFC 8058 List-Unsubscribe header with
// a per-Space unsubscribe token, and writes one outreach_sends row with the provider id + status.
//
// OUT OF SCOPE (counsel / cost gated): a custom per-Space sender domain with DKIM (we reuse the shared
// Resend `send.` subdomain), SMS / A2P, AUP/DPA legal copy, SES at scale. v1 caps volume conservatively.

import { createAdminClient } from '@/lib/supabase/admin'
import { spaceAllowanceHeadroom } from '@/lib/pricing/space-allowance'
import { featureGatesLive } from '@/lib/pricing/settings'
import { getMyProfileId } from '@/lib/auth'
import { getSpaceById } from '@/lib/spaces/store'
import { getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { spaceFunctionAccess, spaceFunctionAvailable } from '@/lib/spaces/functions'
import { sendRawEmail, listUnsubscribeHeaders } from '@/lib/email'
import { bulkRunAfter, enqueue, type JobHandler } from '@/lib/queue/outbox'
import { suppress } from '@/lib/suppression'
import { buildSpaceUnsubscribeUrl } from '@/lib/unsubscribe-tokens'
import { type ActionResult, ok, fail } from '@/lib/action-result'
import { canEmailContact, type ContactPurpose } from '@/lib/crm/contact-consent'
import { isContactTopicMuted } from '@/lib/comms/contact-preferences'
import type { NotificationTopic } from '@/lib/notification-preferences'
import { normalizeEmailTopic } from './email-topics'
import { recordContactInteraction } from '@/lib/crm/interactions'
import { mapResendEventToInteraction, resendIdempotencyKey, type ResendTimelineEventType } from './email-timeline'
import { encodeSendToken, injectTracking } from './email-tracking'
import { randomUUID } from 'crypto'
import { briefError } from '@/lib/log'

// ── Tunables (documented v1 values) ─────────────────────────────────────────────────────────────

/** The conservative per-Space per-day send CAP (v1). A Space may send at most this many emails per
 *  calendar day (UTC), counted from outreach_sends rows created today.
 *
 *  🔴 THIS IS A DELIVERABILITY LIMIT, NOT A PLAN LIMIT (ADR-917). It is the anti-spam volume guard: a
 *  v1 Space ramps reputation slowly, and a misconfigured or hostile send can never blast. It applies
 *  identically on every plan, INCLUDING the paid ones, because Resend's shared sending domain does not
 *  care what someone pays us.
 *
 *  Until Phase 3b it was also the ONLY live cap, which made a free Space's real ceiling ~15,000 sends
 *  a month against a published free allowance of 300: fifty times the number on the pricing page. The
 *  PLAN allowance is now enforced separately below (`space_email` in feature-meters.ts, per calendar
 *  month), so the two limits are the two different things they always were. Whichever binds first
 *  wins, which on the free plan is the monthly allowance and on Collective is this daily throttle. */
export const DAILY_SEND_CAP = 500

/** Hard ceiling on recipients accepted in a single sendSpaceCampaign call, so one request can never
 *  attempt an unbounded batch (the daily cap still applies across calls). */
const MAX_RECIPIENTS_PER_CALL = 1000

/** How often (in accepted sends) the loop re-reads the live daily count, so concurrent sends can't
 *  each blow the cap. A small window bounds the worst-case overshoot to ~RECHECK_EVERY per racing call
 *  while keeping the extra count reads cheap. */
const RECHECK_EVERY = 25

/** The token a caller puts in the email body where the PER-RECIPIENT unsubscribe link belongs. The
 *  send loop replaces every occurrence with that recipient's own space-scoped unsubscribe URL before
 *  sending, so a single rendered `html` yields a correct one-click link for each person (the RFC 8058
 *  List-Unsubscribe header carries the same URL). An html with no token simply sends as-is. */
export const SPACE_UNSUBSCRIBE_PLACEHOLDER = '%%SPACE_UNSUBSCRIBE_URL%%'

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://frequencylocal.com'

// ── Types ────────────────────────────────────────────────────────────────────────────────────────

/** One recipient of a Space send: an email plus an optional Space contact id (for the ledger link). */
export interface SpaceRecipient {
  contactId?: string
  email: string
}

/** Which lane a send belongs to, which is what decides the CONSENT BAR it must clear (ADR-1040).
 *
 *  `marketing` (the DEFAULT, and everything except one caller) — a bulk send from a Space to its
 *  contact book. Held to the double opt-in: a contact must be explicitly `subscribed`.
 *
 *  `event_host` — an event's own host messaging that event's own guest list, from the event's Manage
 *  hub. Attending is the affirmative act (the same reasoning ADR-797 applied to joining), so this
 *  clears at the `transactional` bar. It is NOT a way to skip consent: suppression, a hard
 *  `unsubscribed`, the per-topic 'events' mute, the kill switch, the daily cap, and the plan allowance
 *  all still block it, and every send still carries a one-click unsubscribe. The relaxation applies
 *  ONLY in combination with topic 'events' (consentPurposeForLane enforces the pairing), and the
 *  interactive owner-composer entry strips the lane, so the generic campaign composer cannot reach it. */
export type SpaceSendLane = 'marketing' | 'event_host'

/** The input to sendSpaceCampaign. `campaignId` links the sends to a saved campaign (optional for a
 *  one-off). subject + html are the rendered email; recipients is the resolved audience. `topic` tags
 *  the send (marketing / events / dispatches) so the per-recipient mute gate honors that topic; absent
 *  or invalid falls back to 'marketing' (the pre-topic behavior). `lane` picks the consent bar and
 *  defaults to 'marketing' — see SpaceSendLane. */
export interface SendSpaceCampaignInput {
  campaignId?: string
  subject: string
  html: string
  topic?: NotificationTopic
  lane?: SpaceSendLane
  recipients: SpaceRecipient[]
}

/** What sendSpaceCampaign reports back: how many were actually sent, skipped as suppressed, or failed. */
export interface SendSpaceCampaignResult {
  sent: number
  suppressed: number
  failed: number
}

// ── PURE helpers (no IO, unit-testable) ──────────────────────────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Normalize an email for comparison + storage (trim + lowercase). */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

/** Clean a raw recipient list: normalize each email, drop blank / malformed addresses, de-dupe by
 *  address (first wins, so a contactId is kept), and cap the batch. Pure + fail-closed: a bad entry
 *  is DROPPED, never sent to. */
export function normalizeRecipients(raw: SpaceRecipient[] | null | undefined): SpaceRecipient[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const out: SpaceRecipient[] = []
  for (const r of raw) {
    const email = typeof r?.email === 'string' ? normalizeEmail(r.email) : ''
    if (!email || !EMAIL_RE.test(email) || seen.has(email)) continue
    seen.add(email)
    const rec: SpaceRecipient = { email }
    if (typeof r.contactId === 'string' && r.contactId.trim()) rec.contactId = r.contactId.trim()
    out.push(rec)
    if (out.length >= MAX_RECIPIENTS_PER_CALL) break
  }
  return out
}

/**
 * The CONSENT PURPOSE a send must clear, from its lane and topic (ADR-1040). PURE + total.
 *
 * `marketing` for everything, EXCEPT the one pairing the owner ruled on: the `event_host` lane
 * carrying topic 'events' — an event's host mailing that event's own guests — which clears at
 * `transactional`. Both halves are required, so a caller cannot relax the bar by tagging arbitrary
 * content 'events', and cannot relax it by claiming the lane while sending marketing.
 *
 * `transactional` is NOT "no consent". evaluateContactConsent still refuses a suppressed address and
 * a hard `unsubscribed`; what it allows through is `unknown` — a guest the Space has never had a
 * chance to collect an opt-in from, which under the old bar meant an event host's list was always
 * empty (every recipient logged 'suppressed' and nothing shipped).
 */
export function consentPurposeForLane(
  lane: SpaceSendLane | undefined,
  topic: NotificationTopic,
): ContactPurpose {
  return lane === 'event_host' && topic === 'events' ? 'transactional' : 'marketing'
}

/** The per-Space From line. v1 reuses the shared verified sender domain (no per-Space DKIM yet), but
 *  shows the Space's brand NAME so the inbox reads as the Space, not "Frequency". Falls back to the
 *  configured EMAIL_FROM when no brand name is set. */
export function spaceFromLine(brandName: string | null | undefined, fallbackFrom: string): string {
  const name = (brandName ?? '').trim()
  if (!name) return fallbackFrom
  // Derive the address from EMAIL_FROM ("Name <addr>" or a bare "addr"); keep the verified address,
  // swap the display name to the Space's. Sanitize the name so it can never break the header.
  const m = fallbackFrom.match(/<([^>]+)>/)
  const addr = m ? m[1] : fallbackFrom
  const safeName = name.replace(/["\r\n<>]/g, '').slice(0, 78)
  return `${safeName} <${addr}>`
}

// ── IO seam: the untyped admin-client builders (tables not in generated types yet, ADR-246) ───────

type SpaceEmailRow = { email_enabled?: boolean | null }

/** Read spaces.email_enabled for a Space directly (the column is not in the generated types yet, so
 *  reach it untyped). FAIL-SAFE to false: any error reads as "disabled" so we never send on a blip. */
async function readEmailEnabled(spaceId: string): Promise<boolean> {
  try {
    const db = createAdminClient() as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          eq: (col: string, val: string) => { maybeSingle: () => Promise<{ data: SpaceEmailRow | null }> }
        }
      }
    }
    const { data } = await db.from('spaces').select('email_enabled').eq('id', spaceId).maybeSingle()
    return data?.email_enabled === true
  } catch {
    return false
  }
}

/** Count this calendar month's (UTC) outreach_sends for a Space. THE number the `space_email` plan
 *  allowance is enforced against (ADR-917), and the same number the usage readout beside the meter
 *  shows, so the figure a member is told and the figure they hit are one figure.
 *  FAIL-SAFE 0, the opposite direction from countTodaySends: a failed read must not invent usage that
 *  refuses a send or triggers an upsell prompt. Under-enforcing is recoverable. */
export async function countMonthSends(spaceId: string): Promise<number> {
  const startOfMonth = new Date()
  startOfMonth.setUTCDate(1)
  startOfMonth.setUTCHours(0, 0, 0, 0)
  try {
    const db = createAdminClient() as unknown as {
      from: (t: string) => {
        select: (c: string, opts: { count: 'exact'; head: true }) => {
          eq: (col: string, val: string) => {
            neq: (col: string, val: string) => {
              gte: (col: string, val: string) => Promise<{ count: number | null }>
            }
          }
        }
      }
    }
    const { count } = await db
      .from('outreach_sends')
      .select('id', { count: 'exact', head: true })
      .eq('space_id', spaceId)
      .neq('status', 'suppressed')
      .gte('created_at', startOfMonth.toISOString())
    return typeof count === 'number' ? count : 0
  } catch {
    return 0
  }
}

/** Count today's (UTC) outreach_sends for a Space, so the daily cap can be enforced. Counts every row
 *  EXCEPT those skipped as 'suppressed' (a suppressed recipient never touched the provider, so it must
 *  not consume the send budget). FAIL-CLOSED for the cap: on a read error, return the cap so the send
 *  is refused rather than risk exceeding it. */
async function countTodaySends(spaceId: string): Promise<number> {
  const startOfDay = new Date()
  startOfDay.setUTCHours(0, 0, 0, 0)
  try {
    const db = createAdminClient() as unknown as {
      from: (t: string) => {
        select: (c: string, opts: { count: 'exact'; head: true }) => {
          eq: (col: string, val: string) => {
            neq: (col: string, val: string) => {
              gte: (col: string, val: string) => Promise<{ count: number | null }>
            }
          }
        }
      }
    }
    const { count } = await db
      .from('outreach_sends')
      .select('id', { count: 'exact', head: true })
      .eq('space_id', spaceId)
      .neq('status', 'suppressed')
      .gte('created_at', startOfDay.toISOString())
    return typeof count === 'number' ? count : DAILY_SEND_CAP
  } catch {
    return DAILY_SEND_CAP
  }
}

/** Insert one outreach_sends ledger row. Service-role; swallows errors (logged) so a ledger write
 *  failure never throws into the send loop (the email already went; the row is best-effort). */
async function recordSend(row: {
  /** Optional explicit row id. The 'sent' path pre-generates the send id so a per-recipient tracking
   *  token can be minted BEFORE the html is sent; passing it here keys the ledger row to that token so
   *  space_email_events.send_id resolves. Omitted (DB default uuid) for suppressed/failed rows. */
  id?: string
  spaceId: string
  campaignId?: string
  contactId?: string
  email: string
  /** The DB's own CHECK already models the async lifecycle — queued | sent | delivered | bounced |
   *  complained | failed | suppressed — and only this type was narrower. A campaign row is 'queued'
   *  the moment it reaches the outbox: the send itself happens in the drain, and the delivery
   *  webhook moves it on from there (LIVE-099). */
  status: 'queued' | 'sent' | 'failed' | 'suppressed'
  resendId?: string | null
  error?: string | null
}): Promise<void> {
  try {
    const db = createAdminClient() as unknown as {
      from: (t: string) => { insert: (rows: Record<string, unknown>[]) => Promise<{ error: unknown }> }
    }
    await db.from('outreach_sends').insert([
      {
        ...(row.id ? { id: row.id } : {}),
        space_id: row.spaceId,
        campaign_id: row.campaignId ?? null,
        contact_id: row.contactId ?? null,
        email: row.email,
        status: row.status,
        resend_id: row.resendId ?? null,
        error: row.error ?? null,
      },
    ])
  } catch (err) {
    console.error('[spaces/email] recordSend failed:', err instanceof Error ? err.message : String(err))
  }
}

// ── PUBLIC SEAM ──────────────────────────────────────────────────────────────────────────────────

/** Is a Space allowed to send email right now? The per-Space KILL-SWITCH read. FAIL-SAFE to false:
 *  an unknown Space, a read error, or an unset flag all read as "cannot send". */
export async function isSpaceEmailEnabled(spaceId: string): Promise<boolean> {
  if (!spaceId) return false
  return readEmailEnabled(spaceId)
}

/**
 * Flip a Space's email KILL-SWITCH. Gated on canEditProfile (owner / admin / editor). Turning email
 * ON REQUIRES `acknowledged === true`: the owner affirms they have permission to email these people
 * and will follow anti-spam rules (CAN-SPAM / one-click unsubscribe). Turning OFF needs no
 * acknowledgement (stopping sends is always allowed). Fail-closed on permission and on a missing ack.
 */
export async function setSpaceEmailEnabled(
  spaceId: string,
  enabled: boolean,
  acknowledged: boolean,
): Promise<ActionResult> {
  const profileId = await getMyProfileId()
  if (!profileId) return fail('Sign in to manage email for this space.')

  const space = await getSpaceById(spaceId)
  if (!space) return fail('Space not found.')

  const caps = await getSpaceCapabilities(space, profileId)
  if (!caps.canEditProfile)
    return fail('You do not have permission to manage email for this space.')
  // PER-SPACE FUNCTION GATE (per-space-roles Phase 2, defense in depth). Email is PLAN-GATED with an
  // admin default role; the resolver folds the plan entitlement and the per-Space min-role, so the page
  // render gate and this write gate agree.
  if (!spaceFunctionAccess(space, 'email', caps.role))
    return fail('Email is not available on this space plan, or your role cannot use it.')

  // Enabling REQUIRES the explicit acknowledgement (the anti-spam affirmation). Disabling does not.
  if (enabled && acknowledged !== true) {
    return fail('Confirm you have permission to email these people and will follow anti-spam rules before turning email on.')
  }

  try {
    const db = createAdminClient() as unknown as {
      from: (t: string) => {
        update: (patch: Record<string, unknown>) => {
          eq: (col: string, val: string) => Promise<{ error: unknown }>
        }
      }
    }
    const { error } = await db.from('spaces').update({ email_enabled: enabled }).eq('id', spaceId)
    if (error) return fail('Could not update email settings. Try again.')
  } catch {
    return fail('Could not update email settings. Try again.')
  }
  return ok()
}

/**
 * Send a Space campaign / one-off to a recipient list. The anti-spam, fail-closed send pipeline. In
 * order: gate on canEditProfile; refuse if the Space's kill-switch is off; enforce the per-Space
 * daily cap; filter suppressed recipients (global OR this-Space, logged as 'suppressed'); send each
 * remaining recipient through the existing Resend sender with a per-Space From + Reply-To and an RFC
 * 8058 List-Unsubscribe header carrying a per-Space unsubscribe token; and write one outreach_sends
 * row per recipient with the resulting status + resend id. Returns the {sent, suppressed, failed}
 * tallies. Fail-closed: on any gate miss it returns an error and sends NOTHING.
 */
export async function sendSpaceCampaign(
  spaceId: string,
  input: SendSpaceCampaignInput,
): Promise<ActionResult<SendSpaceCampaignResult>> {
  // (a) AuthZ: only an editor+ of THIS Space may send as it.
  const profileId = await getMyProfileId()
  if (!profileId) return fail('Sign in to send email for this space.')

  const space = await getSpaceById(spaceId)
  if (!space) return fail('Space not found.')

  const caps = await getSpaceCapabilities(space, profileId)
  if (!caps.canEditProfile)
    return fail('You do not have permission to send email for this space.')
  // PER-SPACE FUNCTION GATE (per-space-roles Phase 2, defense in depth) — see setSpaceEmailEnabled above.
  if (!spaceFunctionAccess(space, 'email', caps.role))
    return fail('Email is not available on this space plan, or your role cannot use it.')

  // Authz passed; the kill-switch + cap + consent + suppression + ledger all live in the shared
  // delivery core, which both this interactive path and the SYSTEM (cron) path call.
  // The LANE is stripped here (ADR-1040): the relaxed `event_host` consent bar belongs to the event
  // Manage hub's broadcast, which enters through sendSpaceCampaignSystem behind the event's own
  // 'event.editSettings' gate. The generic owner composer must never be able to reach it, so this
  // entry point cannot carry a lane at all rather than relying on its callers not to set one.
  return deliverSpaceCampaign(space, { ...input, lane: 'marketing' })
}

/**
 * SYSTEM send: deliver a Space campaign WITHOUT an interactive caller session. This is the entry point
 * for the scheduled-send cron (R4, lib/spaces/campaigns-send-due.ts), which runs off a CRON_SECRET, not
 * a signed-in owner. The scheduling ACTION (scheduleSpaceCampaign) already gated on canEditProfile when
 * the owner scheduled the campaign, so the cron does not re-check a per-caller permission (there is no
 * caller). It DOES re-run every anti-spam gate in the delivery core: the Space is resolved (not found ->
 * error), the per-Space `email` function must be enabled, the kill-switch must be ON, the daily cap
 * applies, and each recipient is consent + suppression gated. Fail-closed on any miss; sends NOTHING.
 */
export async function sendSpaceCampaignSystem(
  spaceId: string,
  input: SendSpaceCampaignInput,
): Promise<ActionResult<SendSpaceCampaignResult>> {
  const space = await getSpaceById(spaceId)
  if (!space) return fail('Space not found.')
  // PER-SPACE FUNCTION GATE (defense in depth): the Space's email function must still be turned on,
  // guarding against a Space that disabled email after a campaign was scheduled.
  //
  // ⚠️ This asks `spaceFunctionAvailable` (enabled only), NOT `spaceFunctionAccess(space,'email',null)`.
  // It used to ask the latter, on the reasoning that "a null role checks the space-level default".
  // It does not: `atLeastSpaceRole` is fail-closed, so a null role clears no minimum and the email
  // function's default is 'admin' — the call returned false for every Space, and this entry point
  // therefore refused EVERY send since the gate was added. All four callers were affected: the event
  // Manage broadcast, the Space message center, the scheduled-campaign cron, and the drip runner.
  // A system caller has no space role by construction; the role half of the gate belongs to the
  // surface that authorized it (ADR-1041).
  if (!spaceFunctionAvailable(space, 'email'))
    return fail('Email is turned off for this space.')
  return deliverSpaceCampaign(space, input)
}

/**
 * The shared, post-authorization delivery core. Called by BOTH sendSpaceCampaign (interactive, after
 * the canEditProfile gate) and sendSpaceCampaignSystem (cron, no session). Enforces the kill-switch,
 * daily cap, consent + suppression, per-recipient unsubscribe, and the outreach_sends ledger + CRM
 * timeline. `space` is the already-resolved Space (both callers resolve it first). Fail-closed.
 */
async function deliverSpaceCampaign(
  space: NonNullable<Awaited<ReturnType<typeof getSpaceById>>>,
  input: SendSpaceCampaignInput,
): Promise<ActionResult<SendSpaceCampaignResult>> {
  const spaceId = space.id

  // (b) KILL-SWITCH: fail closed if email is not explicitly enabled for this Space.
  if (!(await isSpaceEmailEnabled(spaceId))) {
    return fail('Email is turned off for this space. Turn it on in settings before sending.')
  }

  // Validate the payload up front (nothing sends on a malformed campaign).
  const subject = (input?.subject ?? '').trim()
  const html = input?.html ?? ''
  if (!subject || !html.trim()) {
    return fail('Add a subject and a message before sending.')
  }

  const recipients = normalizeRecipients(input?.recipients)
  if (recipients.length === 0) {
    return fail('Add at least one valid recipient before sending.')
  }

  // The topic this campaign is tagged with (ADR-799 C). Each recipient's per-topic mute is checked
  // against THIS topic below. Absent/invalid -> 'marketing' (the pre-topic behavior), so a legacy
  // campaign, a drip, or any un-updated caller sends exactly as before.
  const sendTopic = normalizeEmailTopic(input?.topic)

  // The CONSENT BAR for this send (ADR-1040). 'marketing' for every lane but one: an event host
  // mailing that event's own guests clears at 'transactional'. Resolved once, outside the loop.
  const sendPurpose = consentPurposeForLane(input?.lane, sendTopic)

  // (c) DAILY CAP: how many more may this Space send today? countTodaySends reflects EVERY non-
  // suppressed outreach_sends row for today (including ones this call writes and any CONCURRENT call's),
  // so it is the single live source of truth for the cap. We read it once up front to bail early.
  let liveSentToday = await countTodaySends(spaceId)
  if (DAILY_SEND_CAP - liveSentToday <= 0) {
    return fail(`This space hit its daily send limit of ${DAILY_SEND_CAP}. Try again tomorrow.`)
  }

  // (c2) THE PLAN ALLOWANCE — sends per calendar month, the `space_email` meter (ADR-917). A separate
  // question from the daily throttle above: that one protects the shared sending domain, this one is
  // what the plan grants. `null` = nothing to enforce (an unlimited plan, the root hub, the gates not
  // live, or a failed read), so the beta and every fail-safe path behave exactly as before.
  // The grandfather rule rides along in spaceAllowanceHeadroom: a Space that already sent more than
  // its allowance this month is stopped from sending MORE, never billed, blocked, or rolled back.
  let monthHeadroom: number | null = null
  try {
    // Skip the month COUNT entirely while the gates are not live: the answer is fixed, and this runs
    // on every campaign send through the whole beta.
    if (await featureGatesLive()) {
      monthHeadroom = await spaceAllowanceHeadroom(spaceId, 'space_email', await countMonthSends(spaceId))
    }
  } catch {
    monthHeadroom = null
  }
  if (monthHeadroom !== null && monthHeadroom <= 0) {
    return fail('This space has used its email allowance for this month. It resets on the 1st, and moving up a plan raises it.')
  }

  const fallbackFrom = process.env.EMAIL_FROM ?? 'Frequency <noreply@send.frequencylocal.com>'
  const fromLine = spaceFromLine(space.brandName ?? space.name, fallbackFrom)
  // Reply-To: only set when the owner configured a real reply address; v1 has none on the Space, so
  // replies go to the verified sender. (A per-Space reply inbox is a later, additive step.)

  let sent = 0
  let suppressed = 0
  let failed = 0
  // One clock for the whole fan-out, so bulkRunAfter staggers each job against the same origin
  // rather than against the moment its own iteration happened to run.
  const fanOutStartedAt = new Date()

  for (const rec of recipients) {
    // (c continued) RACE-SAFE CAP: re-read the live count every RECHECK_EVERY accepted sends, so two
    // concurrent sends can't both blow past the cap (the up-front read alone would let each send its
    // own full budget). Each accepted send writes a row that countTodaySends sees, so a fresh read
    // already includes this call's rows AND the other call's. Fail-closed: a read error returns the
    // cap, which stops the loop. We re-read keyed on `sent` (suppressed skips don't write a budget row).
    if (sent > 0 && sent % RECHECK_EVERY === 0) {
      liveSentToday = await countTodaySends(spaceId)
    }
    // Stop once the day's live total reaches the cap (counts concurrent senders too).
    if (liveSentToday >= DAILY_SEND_CAP) break
    // Stop once this month's PLAN allowance is used up. Decremented locally per accepted send rather
    // than re-counted (the only rows moving the number are the ones this loop writes). A suppressed
    // recipient never touched the provider, so it consumes neither budget.
    if (monthHeadroom !== null && monthHeadroom <= 0) break

    // (d) CONSENT + SUPPRESSION (campaign double-opt-in, enforced): canEmailContact composes the
    // GLOBAL + this-Space suppression list AND the contact's marketing consent_state, then runs the
    // pure policy. A campaign is a MARKETING send, so a contact must be explicitly `subscribed`:
    // an `unsubscribed`, hard-suppressed, OR `unknown` (never opted in) address is SKIPPED, logged as
    // 'suppressed' (it never touched the provider, so it does not consume the daily budget), and never
    // sent. FAIL-CLOSED: canEmailContact denies on any read error, so a lookup blip skips the send.
    // PLUS the softer per-topic opt-down: a contact who muted the 'marketing' topic for THIS Space in the
    // preference center is skipped even if consent_state is subscribed. This gate was defined
    // (isContactTopicMuted, "consulted in real time at send time") but never actually wired into the send
    // loop; wiring it here keeps that promise, and matters more now that a membership join can flip a
    // contact to subscribed (ADR-797) while a prior topic opt-down must still be honored.
    // The consent gate's PURPOSE is the lane's (sendPurpose, resolved above). ADR-799 C originally held
    // every space broadcast to 'marketing' regardless of topic; ADR-1040 carves out exactly one pairing
    // (lane 'event_host' + topic 'events'), because under the blanket rule an event host's own guest
    // list was structurally empty — an RSVP creates no subscribed contact, so every recipient was
    // logged 'suppressed' and the event CRM's headline feature delivered nothing. Every other lane is
    // unchanged. The softer per-topic mute below uses the campaign's OWN topic either way.
    const emailable = (await canEmailContact(rec.email, sendPurpose, spaceId)).allowed
    const topicMuted = emailable
      ? await isContactTopicMuted({ email: rec.email, spaceId, topic: sendTopic })
      : false
    if (!emailable || topicMuted) {
      suppressed++
      await recordSend({
        spaceId,
        campaignId: input.campaignId,
        contactId: rec.contactId,
        email: rec.email,
        status: 'suppressed',
      })
      continue
    }

    // (e) RFC 8058 per-Space one-click unsubscribe: a space-scoped token in the List-Unsubscribe
    // header + the POST endpoint. Unsubscribing records a suppression for THIS Space only.
    const unsubscribeUrl = buildSpaceUnsubscribeUrl({ baseUrl: BASE_URL, spaceId, email: rec.email })
    const headers = listUnsubscribeHeaders(unsubscribeUrl)
    // Personalize the body's unsubscribe link for THIS recipient (the header carries the same URL).
    // A body with no placeholder is sent unchanged, so this is safe for any html.
    let personalizedHtml = html.split(SPACE_UNSUBSCRIBE_PLACEHOLDER).join(unsubscribeUrl)

    // ENGAGEMENT TRACKING (additive, FAIL-SAFE): pre-generate this send's ledger id so a per-recipient
    // opaque token maps opens/clicks back to THIS exact row, then inject an open pixel + rewrite links
    // through the click endpoint. ANY error here falls back to the ORIGINAL personalizedHtml and an
    // untracked send — tracking must NEVER block or corrupt the email. The generated id is passed to
    // recordSend so outreach_sends.id == the token's send id (space_email_events.send_id resolves).
    const sendId = randomUUID()
    try {
      const token = encodeSendToken(sendId)
      personalizedHtml = injectTracking(personalizedHtml, token, BASE_URL)
    } catch {
      // swallow — send the un-tracked html rather than fail the send.
    }

    try {
      // ── THROUGH THE OUTBOX, NOT INLINE (LIVE-099) ────────────────────────────────────────
      // This loop used to call sendRawEmail directly, which is the one thing lib/email.ts's own
      // header forbids: "the spine: queue all email, never send inline (ADR-026)". The sibling
      // campaign sender (lib/email-studio/send.ts) has always queued. So the platform had TWO
      // campaign senders with opposite reliability postures, and this was the one with no
      // durability, no retry, no lane and no dead-letter surface — a Space campaign that hit the
      // daily quota simply vanished, which is exactly the failure that cost 359 emails on
      // 2026-07-17 on the OTHER sender (LIVE-091).
      //
      // The BULK lane, dripped: a campaign is mail nobody is sitting and waiting for, so it must
      // never spend the quota a welcome email is queued behind. bulkRunAfter staggers when each
      // job becomes DUE, because the claim is ordered by run_after and knows nothing about lanes.
      await enqueue(
        SPACE_CAMPAIGN_EMAIL_KIND,
        {
          to: rec.email,
          subject,
          html: personalizedHtml,
          from: fromLine,
          headers,
          // The ledger row this job must move on at drain time (runSpaceCampaignEmail below). The
          // generic 'email' kind DISCARDS sendRawEmail's provider id, which would strand this row
          // at 'queued' forever and blind both webhook matchers — that is why campaigns get their
          // own kind rather than riding the shared one.
          outreachSendId: sendId,
        },
        { lane: 'bulk', runAfter: bulkRunAfter(sent, fanOutStartedAt) },
      )
      // The row is QUEUED, not sent — the send happens in the drain (runSpaceCampaignEmail moves
      // the row to 'sent' + resend_id when Resend accepts) and the delivery webhook moves it on
      // from there. The ledger id still equals the tracking token's send id, so opens and clicks
      // resolve exactly as before. The caps count a job we have COMMITTED to send, which is what
      // makes the in-window check honest against a fresh countTodaySends.
      {
        sent++
        // Track our own accepted send against the live count so the cap holds between re-reads (a
        // fresh countTodaySends would also count this row; this keeps the in-window check honest).
        liveSentToday++
        // Same for the month's PLAN allowance (ADR-917). Null means nothing is being enforced.
        if (monthHeadroom !== null) monthHeadroom--
        await recordSend({
          id: sendId,
          spaceId,
          campaignId: input.campaignId,
          contactId: rec.contactId,
          email: rec.email,
          status: 'queued',
        })
        // CRM TIMELINE (ADR-378): log the outbound touch on the unified contact_interactions timeline,
        // owner-scoped to the Space's owner. STRICTLY owner+subject scoped — only when this recipient
        // maps to a contacts row (rec.contactId) AND the Space has a known owner; an ungated platform
        // Space (ownerProfileId null) records NOTHING (no platform-owner sentinel). Exactly-once on
        // campaign:<campaignId>:<contactId> when a campaign id is present (a re-send folds to a no-op);
        // a one-off send carries no key. Best-effort + fail-safe: a logging failure never breaks a send.
        if (rec.contactId && space.ownerProfileId) {
          try {
            await recordContactInteraction(
              {
                ownerProfileId: space.ownerProfileId,
                subjectKind: 'contact',
                subjectId: rec.contactId,
                channel: 'email',
                direction: 'outbound',
                summary: subject,
                source: 'engagement',
                metadata: { provider: 'resend', resend_id: null, campaign_id: input.campaignId ?? null },
                idempotencyKey: input.campaignId ? `campaign:${input.campaignId}:${rec.contactId}` : null,
                // Scope spine (ADR-827): first-class campaign scope, dual-written next to the
                // legacy metadata.campaign_id convention.
                scope: input.campaignId ? { kind: 'campaign', id: input.campaignId } : null,
              },
              spaceId,
            )
          } catch {
            // swallow — the email already sent; the timeline row is best-effort.
          }
        }
      }
    } catch (err) {
      failed++
      await recordSend({
        spaceId,
        campaignId: input.campaignId,
        contactId: rec.contactId,
        email: rec.email,
        status: 'failed',
        error: briefError(err),
      })
    }
  }

  return ok({ sent, suppressed, failed })
}

// ── Outbox seam: the drain half of a campaign send ────────────────────────────────────────────────
// deliverSpaceCampaign COMMITS a recipient by writing the outreach_sends row at 'queued' and
// enqueueing a job of this kind. This handler runs at drain time and moves that SAME row on:
//   • Resend accepts → 'sent' + resend_id — the id both webhook matchers below resolve a Space
//     send by. Without it a campaign row can never leave 'queued', per-Space bounce/complaint
//     suppression can never fire for campaign recipients, and spaceDeliverability ("sent =
//     everything except queued") under-reports every campaign.
//   • Sending disabled / globally suppressed at drain time (sendRawEmail returns id null) →
//     'failed' with the reason, restoring the pre-outbox behavior where a no-op was visible.
//   • Provider error → THROW: the outbox retries with backoff and the row honestly stays 'queued'.
//     A job that exhausts max_attempts dead-letters with the row still 'queued' — the DLQ surface
//     is the gate that notices.
// The ledger update targets still-'queued' rows only (a webhook that raced us keeps its later
// status) and is best-effort: the email is already accepted, so a ledger blip must never re-send.
export const SPACE_CAMPAIGN_EMAIL_KIND = 'space-campaign-email'

export const runSpaceCampaignEmail: JobHandler = async (p) => {
  // Malformed jobs surface as dead-letters for inspection (the push handler's posture).
  if (!p.to || !p.subject || typeof p.outreachSendId !== 'string') {
    throw new Error('space-campaign-email job missing to, subject, or outreachSendId')
  }
  const { id } = await sendRawEmail({
    to: p.to as string,
    subject: p.subject as string,
    html: (p.html as string) ?? '',
    headers: (p.headers as Record<string, string> | undefined) ?? undefined,
    from: typeof p.from === 'string' ? p.from : undefined,
  })
  try {
    const db = createAdminClient() as unknown as {
      from: (t: string) => {
        update: (patch: Record<string, unknown>) => {
          eq: (c: string, v: string) => { eq: (c: string, v: string) => Promise<{ error: unknown }> }
        }
      }
    }
    const { error } = await db
      .from('outreach_sends')
      .update(
        id
          ? { status: 'sent', resend_id: id }
          : { status: 'failed', error: 'sending disabled or address suppressed at drain time' },
      )
      .eq('id', p.outreachSendId)
      .eq('status', 'queued')
    if (error) throw error
  } catch (err) {
    console.error(
      '[spaces/email] campaign ledger update failed:',
      err instanceof Error ? err.message : String(err),
    )
  }
}

// ── Webhook seam: update a Space send on a provider bounce / complaint ────────────────────────────

/**
 * Resolve a Space send from a Resend email id and apply a bounce / complaint outcome. Called by the
 * Resend webhook (app/api/webhooks/resend/route.ts) IN ADDITION to the existing global handling, so
 * the global flow is unchanged. If an outreach_sends row matches the resend id, its status is set to
 * the event ('bounced' | 'complained') and a SPACE-SCOPED suppression is recorded for that address +
 * Space (so that Space stops re-mailing the person). Returns true when a Space send was matched +
 * handled, false when no Space send owns this id (the caller then relies on the global path only).
 * Best-effort + fail-safe: any error returns false and is logged, never thrown.
 */
export async function handleSpaceSendWebhook(
  resendId: string | null | undefined,
  eventType: 'bounced' | 'complained',
): Promise<boolean> {
  if (!resendId) return false
  try {
    const db = createAdminClient() as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          eq: (col: string, val: string) => {
            maybeSingle: () => Promise<{ data: { id: string; space_id: string; email: string } | null }>
          }
        }
        update: (patch: Record<string, unknown>) => {
          eq: (col: string, val: string) => Promise<{ error: unknown }>
        }
      }
    }
    const { data: row } = await db
      .from('outreach_sends')
      .select('id, space_id, email')
      .eq('resend_id', resendId)
      .maybeSingle()
    if (!row) return false

    // Set the ledger row's status to the provider outcome.
    await db
      .from('outreach_sends')
      .update({ status: eventType, updated_at: new Date().toISOString() })
      .eq('id', row.id)

    // Record a SPACE-SCOPED suppression so this Space stops re-mailing the address. A complaint is
    // also globally significant, but the global webhook path already adds the GLOBAL suppression; we
    // only add the per-Space row here.
    await suppress(row.email, eventType === 'bounced' ? 'hard_bounce' : 'complaint', row.space_id)
    return true
  } catch (err) {
    console.error(
      '[spaces/email] handleSpaceSendWebhook failed:',
      err instanceof Error ? err.message : String(err),
    )
    return false
  }
}

/** Resolve a contact id for an email WITHIN a Space on the CRM hub (lowercased exact match). Per-space
 *  tenancy (ADR-624): an address can be a separate contact in each Space, so scope to the sending Space
 *  so a bounce/open attributes to that Space's contact and `.maybeSingle()` stays single-row (an unscoped
 *  lookup would throw on a multi-row address). Service-role read, FAIL-SAFE to null on any miss/error.
 *  authz-delegated: read-only resolve at the webhook seam. */
async function resolveContactIdByEmail(email: string, spaceId: string): Promise<string | null> {
  const addr = normalizeEmail(email)
  if (!addr || !spaceId) return null
  try {
    const db = createAdminClient() as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          eq: (col: string, val: string) => {
            eq: (col: string, val: string) => { maybeSingle: () => Promise<{ data: { id?: string } | null }> }
          }
        }
      }
    }
    const { data } = await db.from('contacts').select('id').eq('space_id', spaceId).eq('email', addr).maybeSingle()
    return typeof data?.id === 'string' && data.id.length ? data.id : null
  } catch {
    return null
  }
}

/** Read a Space's owner_profile_id directly (untyped — the column is loosely projected, ADR-246).
 *  FAIL-SAFE to null on any miss/error, so a blip records nothing rather than mis-attributing. */
async function readSpaceOwner(spaceId: string): Promise<string | null> {
  try {
    const db = createAdminClient() as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          eq: (col: string, val: string) => {
            maybeSingle: () => Promise<{ data: { owner_profile_id?: string | null } | null }>
          }
        }
      }
    }
    const { data } = await db.from('spaces').select('owner_profile_id').eq('id', spaceId).maybeSingle()
    return typeof data?.owner_profile_id === 'string' && data.owner_profile_id.length ? data.owner_profile_id : null
  } catch {
    return null
  }
}

/**
 * Project a Resend engagement / deliverability event onto the CRM timeline (ADR-378). Called by the
 * Resend webhook for opened / clicked / bounced / complained, IN ADDITION to the existing global +
 * Space-suppression handling, so those flows are unchanged. STRICTLY owner+subject scoped: it only
 * records when (a) an outreach_sends row owns this resend id (so this is a SPACE send, not a platform
 * email), (b) the Space has a known owner, and (c) the recipient resolves to a contacts row. A pure
 * platform email (no Space send) records NOTHING — there is no platform-owner sentinel. Exactly-once on
 * resend:<email_id>:<type>, so a redelivered webhook folds to a no-op. Best-effort + fail-safe: any
 * error is swallowed (logged) and never thrown back into the webhook.
 */
export async function handleSpaceSendEngagement(
  resendId: string | null | undefined,
  eventType: ResendTimelineEventType,
): Promise<void> {
  if (!resendId) return
  const shape = mapResendEventToInteraction(eventType)
  if (!shape) return
  const idempotencyKey = resendIdempotencyKey(resendId, eventType)
  if (!idempotencyKey) return
  try {
    const db = createAdminClient() as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          eq: (col: string, val: string) => {
            maybeSingle: () => Promise<{
              data: { space_id: string; contact_id: string | null; email: string } | null
            }>
          }
        }
      }
    }
    const { data: row } = await db
      .from('outreach_sends')
      .select('space_id, contact_id, email')
      .eq('resend_id', resendId)
      .maybeSingle()
    // No Space send owns this id -> a pure platform email. Owner + subject are unknown, so DO NOTHING.
    if (!row) return

    const ownerProfileId = await readSpaceOwner(row.space_id)
    if (!ownerProfileId) return // an ungated platform Space: never invent an owner.

    const contactId =
      typeof row.contact_id === 'string' && row.contact_id.length
        ? row.contact_id
        : await resolveContactIdByEmail(row.email, row.space_id)
    if (!contactId) return // recipient never mapped to a contacts row -> no subject to scope to.

    await recordContactInteraction(
      {
        ownerProfileId,
        subjectKind: 'contact',
        subjectId: contactId,
        channel: 'email',
        direction: shape.direction,
        summary: shape.summary,
        source: 'resend',
        metadata: { provider: 'resend', resend_id: resendId, event: eventType },
        idempotencyKey,
      },
      row.space_id,
    )
  } catch (err) {
    console.error(
      '[spaces/email] handleSpaceSendEngagement failed:',
      err instanceof Error ? err.message : String(err),
    )
  }
}
