// Email Studio — Phase 6: PER-CAMPAIGN email analytics (server-only).
//
// Aggregates the shared `email_events` ledger (recorded by the Resend webhook via
// lib/suppression.recordEmailEvent) down to ONE campaign. Mirrors the query style of
// lib/beta/stats.getBetaEmailEngagement, but scoped to a single campaign's send.
//
// ── ATTRIBUTION (read this before trusting the numbers) ───────────────────────────────
// GAP: `email_events` carries NO campaign_id and NO contact_id — only { email, event_type,
// provider_id (the Resend id), created_at, payload }. The Phase-4 send loop
// (app/(main)/admin/marketing/campaigns/actions.sendCampaign) enqueues each email WITHOUT
// tagging a campaign id into the payload or a header, so there is no direct event → campaign
// link today. See getCampaignMetrics's doc comment for the smallest recommended fix.
//
// BEST AVAILABLE ATTRIBUTION (implemented here): a campaign event is one whose recipient
// address is in the campaign's audience AND whose timestamp falls inside the send window.
//   1. The audience = the campaign's segment resolved to member-contact emails
//      (lib/studio/campaigns.resolveSegment), lower-cased to match recordEmailEvent's norm.
//   2. The window = [sent_at, sent_at + ATTRIBUTION_WINDOW_DAYS]. Bounding the window keeps a
//      LATER campaign to the same people from bleeding into this campaign's totals.
// Known imperfections (documented, not hidden): (a) the segment is resolved NOW, so a contact
// who unsubscribed or was added after the send shifts membership slightly; (b) two campaigns
// to the same address inside the same window can double-count an open/click. Both vanish once
// the send tags a real campaign_id (the recommended Phase-4 change).
//
// Open-rate caveat: since Apple Mail Privacy Protection (iOS 15+/MPP) pre-fetches images, an
// "opened" event fires even when the human never opened the mail. Treat openRate as a soft
// upper bound and WEIGHT CLICKS as the real engagement signal.

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveSegment } from '@/lib/studio/campaigns'

const DAY_MS = 24 * 60 * 60 * 1000

/** How long after send we still credit an event to the campaign. Bounds cross-campaign bleed. */
export const ATTRIBUTION_WINDOW_DAYS = 30

/** The Resend event types we tally, as stored in `email_events.event_type` (the webhook strips
 *  the `email.` prefix). `unsubscribed` is included for forward-compatibility: Resend does not
 *  emit it and the webhook does not record it today, so it is ~0 until instrumented (real opt-outs
 *  live in email_suppressions / contacts.consent_state, not this ledger). */
const COUNTED_TYPES = [
  'sent',
  'delivered',
  'opened',
  'clicked',
  'bounced',
  'unsubscribed',
  'complained',
] as const

/** Raw event tallies for one campaign's send. All whole numbers, never negative. */
export interface EventCounts {
  sent: number
  delivered: number
  opened: number
  clicked: number
  bounced: number
  unsubscribed: number
  complained: number
}

/** The three engagement rates, each a FRACTION in [0, 1] (a component renders them as %). */
export interface CampaignRates {
  /** opened / delivered. Soft upper bound — inflated by Apple MPP; weight clickRate. */
  openRate: number
  /** clicked / delivered. The reliable engagement signal. */
  clickRate: number
  /** bounced / sent. */
  bounceRate: number
}

/** Everything the analytics panel needs for one campaign: raw counts, rates, and two flags
 *  (`hasSent` lets the UI show an empty state; `attributedRecipients` is the audience size the
 *  counts were matched against). Superset of the documented { sent, delivered, ... } shape. */
export interface CampaignMetrics extends EventCounts, CampaignRates {
  /** False when the campaign has no `sent_at` (draft / scheduled). The panel shows an empty state. */
  hasSent: boolean
  /** Distinct addresses in the attributed audience (the segment resolved to member emails). */
  attributedRecipients: number
}

const ZERO_COUNTS: EventCounts = {
  sent: 0,
  delivered: 0,
  opened: 0,
  clicked: 0,
  bounced: 0,
  unsubscribed: 0,
  complained: 0,
}

/**
 * PURE, zero-safe rate math. Every denominator is guarded so a campaign with no sends / no
 * deliveries yields 0 (never NaN or Infinity). Unit-tested in analytics.test.ts.
 *   • openRate  = delivered > 0 ? opened  / delivered : 0
 *   • clickRate = delivered > 0 ? clicked / delivered : 0
 *   • bounceRate = sent     > 0 ? bounced / sent      : 0
 */
export function computeRates(counts: EventCounts): CampaignRates {
  const ratio = (num: number, den: number): number => (den > 0 ? num / den : 0)
  return {
    openRate: ratio(counts.opened, counts.delivered),
    clickRate: ratio(counts.clicked, counts.delivered),
    bounceRate: ratio(counts.bounced, counts.sent),
  }
}

function db(): SupabaseClient {
  return createAdminClient()
}

/** The send window + audience a campaign's events are matched against, or null when the campaign
 *  has not sent (no `sent_at`) or resolves to no recipients. */
interface Attribution {
  emails: Set<string>
  windowStartIso: string
  windowEndIso: string
}

/**
 * Resolve a campaign's attribution seam: its recipient email set (lower-cased) and its send
 * window. Returns null when the campaign is missing, unsent, or has no resolvable recipients —
 * every caller treats null as "no data / not sent yet" and fails soft.
 */
async function loadAttribution(campaignId: string): Promise<Attribution | null> {
  if (!campaignId) return null

  const { data: campaign, error } = await db()
    .from('campaigns')
    .select('sent_at, segment')
    .eq('id', campaignId)
    .maybeSingle()

  if (error || !campaign?.sent_at) return null

  const sentAt = new Date(campaign.sent_at)
  if (Number.isNaN(sentAt.getTime())) return null

  // Resolve the segment to member-contact emails, normalized the SAME way recordEmailEvent
  // normalizes the ledger (trim + lower-case) so the two sides join.
  let recipients: { email: string }[] = []
  try {
    recipients = await resolveSegment(campaign.segment)
  } catch {
    recipients = []
  }
  const emails = new Set(recipients.map((r) => r.email.trim().toLowerCase()).filter(Boolean))
  if (emails.size === 0) return null

  const windowEnd = new Date(sentAt.getTime() + ATTRIBUTION_WINDOW_DAYS * DAY_MS)
  return {
    emails,
    windowStartIso: sentAt.toISOString(),
    windowEndIso: windowEnd.toISOString(),
  }
}

/** Fetch the campaign's attributed events (type + address + timestamp) inside the send window,
 *  filtered in memory to the recipient set. Selecting the window at the DB bounds the read; the
 *  Set-membership filter is what scopes it to the campaign. */
async function fetchAttributedEvents(
  attr: Attribution,
): Promise<{ eventType: string; createdAt: string }[]> {
  const { data, error } = await db()
    .from('email_events')
    .select('event_type, email, created_at')
    .gte('created_at', attr.windowStartIso)
    .lte('created_at', attr.windowEndIso)
  if (error || !data) return []
  return data
    .filter((r) => r.email && attr.emails.has(r.email.trim().toLowerCase()))
    .map((r) => ({ eventType: r.event_type, createdAt: r.created_at }))
}

/**
 * Per-campaign metrics: raw counts + guarded rates for ONE campaign's send.
 *
 * Attribution = recipient-email-set ∩ [sent_at, sent_at + ATTRIBUTION_WINDOW_DAYS] (see the file
 * header). FAIL-SOFT: an unsent / missing / empty-audience campaign returns all-zero metrics with
 * `hasSent: false`, so a render never throws.
 *
 * Open rates are UNRELIABLE post Apple MPP (image pre-fetch fires a false "opened"); treat
 * `openRate` as a ceiling and lead with `clickRate`.
 *
 * RECOMMENDATION FOR PHASE 4 (report only — not changed here): have sendCampaign tag the campaign
 * on each send so events join directly instead of by this window heuristic. Smallest change: pass
 * a Resend header, e.g. `headers: { 'X-Campaign-Id': campaign.id }`, in the enqueueEmail call, and
 * record it on the event (the webhook already receives the full Resend payload). A `campaign_id`
 * column on `email_events` would then make attribution exact and drop the segment re-resolve.
 */
export async function getCampaignMetrics(campaignId: string): Promise<CampaignMetrics> {
  const attr = await loadAttribution(campaignId)
  if (!attr) {
    return { ...ZERO_COUNTS, ...computeRates(ZERO_COUNTS), hasSent: false, attributedRecipients: 0 }
  }

  const events = await fetchAttributedEvents(attr)
  const counts: EventCounts = { ...ZERO_COUNTS }
  const countable = new Set<string>(COUNTED_TYPES)
  for (const e of events) {
    if (countable.has(e.eventType)) counts[e.eventType as keyof EventCounts] += 1
  }

  return {
    ...counts,
    ...computeRates(counts),
    hasSent: true,
    attributedRecipients: attr.emails.size,
  }
}

/** One day of the engagement timeline: an ISO date (YYYY-MM-DD) with that day's open + click tallies. */
export interface CampaignTimelinePoint {
  day: string
  opened: number
  clicked: number
}

/** A campaign's engagement over daily buckets, for a small sparkline. `opens` / `clicks` are the
 *  per-day series (oldest → newest) aligned to `days`; empty when the campaign has not sent. */
export interface CampaignTimeline {
  days: string[]
  opens: number[]
  clicks: number[]
  points: CampaignTimelinePoint[]
}

const EMPTY_TIMELINE: CampaignTimeline = { days: [], opens: [], clicks: [], points: [] }

/**
 * Daily open/click buckets across the campaign's send window (up to today, capped at the
 * attribution window). Same attribution as getCampaignMetrics. FAIL-SOFT to an empty timeline for
 * an unsent / empty-audience campaign, so a sparkline simply renders nothing.
 */
export async function getCampaignTimeline(campaignId: string): Promise<CampaignTimeline> {
  const attr = await loadAttribution(campaignId)
  if (!attr) return EMPTY_TIMELINE

  const start = new Date(attr.windowStartIso)
  // Cap the visible span at "today" so we do not draw empty future days past the send.
  const end = new Date(Math.min(Date.now(), new Date(attr.windowEndIso).getTime()))
  const dayKey = (d: Date) => d.toISOString().slice(0, 10)

  // Seed one bucket per calendar day from send day → today (inclusive), so gaps read as zeros.
  const buckets = new Map<string, { opened: number; clicked: number }>()
  for (let t = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
       t <= end.getTime();
       t += DAY_MS) {
    buckets.set(dayKey(new Date(t)), { opened: 0, clicked: 0 })
  }

  const events = await fetchAttributedEvents(attr)
  for (const e of events) {
    if (e.eventType !== 'opened' && e.eventType !== 'clicked') continue
    const key = dayKey(new Date(e.createdAt))
    const b = buckets.get(key)
    if (!b) continue
    if (e.eventType === 'opened') b.opened += 1
    else b.clicked += 1
  }

  const points: CampaignTimelinePoint[] = [...buckets.entries()].map(([day, v]) => ({
    day,
    opened: v.opened,
    clicked: v.clicked,
  }))
  return {
    days: points.map((p) => p.day),
    opens: points.map((p) => p.opened),
    clicks: points.map((p) => p.clicked),
    points,
  }
}
