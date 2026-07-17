// Email Studio — Phase 6: PER-CAMPAIGN email analytics (server-only).
//
// Aggregates the shared `email_events` ledger (recorded by the Resend webhook via
// lib/suppression.recordEmailEvent) down to ONE campaign.
//
// ── ATTRIBUTION (read this before trusting the numbers) ───────────────────────────────
// EXACT, by campaign id. The send loop (send.sendCampaignNow + beta.sendApprovedBetaCampaign)
// stamps the campaign id on every recipient email via a Resend `X-Campaign-Id` header AND a
// `campaign_id` tag. Resend echoes both back on each delivery/engagement webhook, and
// recordEmailEvent writes the id to `email_events.campaign_id`. getCampaignMetrics then counts
// ONLY rows carrying this campaign's id — no unrelated transactional mail can leak in.
//
// This replaces an earlier HEURISTIC (segment audience ∩ a 30-day send window) that badly
// OVER-COUNTED: every welcome / notification / reminder sent to any segment member inside the
// window got credited to the campaign, so a 4-recipient send could read as "25 delivered". That
// heuristic is gone.
//
// LEGACY (untagged) campaigns — sent before exact attribution shipped — have NO campaign-tagged
// events. For those we do NOT guess. We report the campaign's real send size from its recorded
// `recipient_count` (as sent / delivered) and mark `attributionMode: 'legacy'`; open / click stay
// UNAVAILABLE (rates 0). The panel shows the count plus an honest "tracking starts next send" line
// rather than a fabricated engagement number.
//
// Open-rate caveat (exact mode): since Apple Mail Privacy Protection (iOS 15+/MPP) pre-fetches
// images, an "opened" event fires even when the human never opened the mail. Treat openRate as a
// soft upper bound and WEIGHT CLICKS as the real engagement signal.

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'

const DAY_MS = 24 * 60 * 60 * 1000

/** How many days of the send the engagement timeline draws (a display cap, not an attribution rule —
 *  attribution is now by campaign id, so this only bounds how far the sparkline extends). */
export const TIMELINE_WINDOW_DAYS = 30

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

/**
 * How a campaign's numbers were derived, so the UI can be honest about what it shows:
 *   • 'exact'  — counted from events tagged with this campaign's id. Rates are real.
 *   • 'legacy' — the campaign sent before exact attribution shipped, so it has no tagged events.
 *                sent / delivered come from the recorded recipient_count; open / click are
 *                UNAVAILABLE (0). The panel must NOT present those zeros as engagement.
 */
export type AttributionMode = 'exact' | 'legacy'

/** Everything the analytics panel needs for one campaign: raw counts, rates, and flags. Superset
 *  of the documented { sent, delivered, ... } shape. */
export interface CampaignMetrics extends EventCounts, CampaignRates {
  /** False when the campaign has no `sent_at` (draft / scheduled). The panel shows an empty state. */
  hasSent: boolean
  /** Whether the counts are exact (campaign-tagged events) or a legacy recipient_count fallback. */
  attributionMode: AttributionMode
  /** The send size we can stand behind: distinct tagged recipients in exact mode, or the recorded
   *  recipient_count in legacy mode. */
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

/** A campaign's send facts: when it went out and how many it went to. Null when the campaign is
 *  missing; `sentAt` null means it has not sent (draft / scheduled). */
interface CampaignSendInfo {
  sentAt: string | null
  recipientCount: number
}

/** Load a campaign's send facts. FAIL-SOFT to null on any read error so a render never throws. */
async function loadCampaignSendInfo(campaignId: string): Promise<CampaignSendInfo | null> {
  if (!campaignId) return null
  try {
    const { data, error } = await db()
      .from('campaigns')
      .select('sent_at, recipient_count')
      .eq('id', campaignId)
      .maybeSingle()
    if (error || !data) return null
    return {
      sentAt: (data.sent_at as string | null) ?? null,
      recipientCount: data.recipient_count == null ? 0 : Number(data.recipient_count),
    }
  } catch {
    return null
  }
}

/** One campaign-tagged event, the minimal shape the metrics + timeline need. */
interface TaggedEvent {
  eventType: string
  email: string
  createdAt: string
}

/**
 * Fetch every `email_events` row tagged with THIS campaign's id. This is the whole of exact
 * attribution: only events stamped at send carry the id, so nothing unrelated can join.
 * `campaign_id` is not in the generated types yet, so we read through an untyped handle (ADR-246).
 * FAIL-SOFT to [] on any error — including the column not existing before the migration applies —
 * so the caller cleanly falls back to the legacy recipient_count path.
 */
async function fetchCampaignEvents(campaignId: string): Promise<TaggedEvent[]> {
  try {
    const { data, error } = await (
      db() as unknown as {
        from: (t: string) => {
          select: (c: string) => {
            eq: (
              col: string,
              val: string,
            ) => Promise<{
              data: { event_type: string; email: string | null; created_at: string }[] | null
              error: unknown
            }>
          }
        }
      }
    )
      .from('email_events')
      .select('event_type, email, created_at')
      .eq('campaign_id', campaignId)
    if (error || !data) return []
    return data.map((r) => ({ eventType: r.event_type, email: r.email ?? '', createdAt: r.created_at }))
  } catch {
    return []
  }
}

/** Tally raw event-type counts from a campaign's tagged events. Pure. */
function tallyEvents(events: TaggedEvent[]): EventCounts {
  const counts: EventCounts = { ...ZERO_COUNTS }
  const countable = new Set<string>(COUNTED_TYPES)
  for (const e of events) {
    if (countable.has(e.eventType)) counts[e.eventType as keyof EventCounts] += 1
  }
  return counts
}

/**
 * Per-campaign metrics: raw counts + guarded rates for ONE campaign's send.
 *
 * EXACT attribution: counts come only from `email_events` rows tagged with this campaign's id
 * (stamped at send, written by the webhook). If the campaign sent but carries NO tagged events (a
 * legacy send, from before this shipped), we do NOT guess — we report the real send size from
 * `recipient_count` and mark `attributionMode: 'legacy'` with engagement unavailable.
 *
 * FAIL-SOFT: an unsent / missing campaign returns all-zero metrics with `hasSent: false`, so a
 * render never throws.
 *
 * Open rates are UNRELIABLE post Apple MPP (image pre-fetch fires a false "opened"); treat
 * `openRate` as a ceiling and lead with `clickRate`.
 */
export async function getCampaignMetrics(campaignId: string): Promise<CampaignMetrics> {
  const info = await loadCampaignSendInfo(campaignId)
  if (!info || !info.sentAt) {
    return {
      ...ZERO_COUNTS,
      ...computeRates(ZERO_COUNTS),
      hasSent: false,
      attributionMode: 'exact',
      attributedRecipients: 0,
    }
  }

  const events = await fetchCampaignEvents(campaignId)

  // EXACT: the campaign's send tagged its events, so count them directly.
  if (events.length > 0) {
    const counts = tallyEvents(events)
    const distinctRecipients = new Set(events.map((e) => e.email).filter(Boolean)).size
    return {
      ...counts,
      ...computeRates(counts),
      hasSent: true,
      attributionMode: 'exact',
      attributedRecipients: distinctRecipients,
    }
  }

  // LEGACY: an untagged historical send. Report the honest send size (recipient_count) as
  // sent / delivered; leave open / click / bounce at zero (UNAVAILABLE, not "zero engagement").
  const size = Math.max(0, info.recipientCount)
  const counts: EventCounts = { ...ZERO_COUNTS, sent: size, delivered: size }
  return {
    ...counts,
    ...computeRates(counts),
    hasSent: true,
    attributionMode: 'legacy',
    attributedRecipients: size,
  }
}

// ── ACCOUNT-WIDE OVERVIEW ──────────────────────────────────────────────────────────────────────
// The whole email_events ledger rolled up: the deliverability + engagement health of everything the
// platform sends (campaigns + transactional). Feeds the Marketing "Email performance" dashboard.

/** Everything the account-wide email dashboard needs: raw totals, the three campaign rates, plus
 *  complaint / unsubscribe rates and a couple of context facts. All fractions in [0,1]. */
export interface MarketingEmailOverview extends EventCounts, CampaignRates {
  /** complained / delivered. Spam-report rate; keep this under ~0.1% or deliverability suffers. */
  complaintRate: number
  /** unsubscribed / delivered. */
  unsubscribeRate: number
  /** delivered / sent. The share of attempted mail the mailbox providers accepted. */
  deliveryRate: number
  /** ISO timestamp of the most recent recorded event, or null when the ledger is empty. */
  lastEventAt: string | null
  /** How many campaigns have actually sent (status sent OR a sent_at), for context under the rates. */
  campaignsSent: number
}

const ZERO_OVERVIEW: MarketingEmailOverview = {
  ...ZERO_COUNTS,
  ...computeRates(ZERO_COUNTS),
  complaintRate: 0,
  unsubscribeRate: 0,
  deliveryRate: 0,
  lastEventAt: null,
  campaignsSent: 0,
}

/**
 * Roll the ENTIRE `email_events` ledger up into one overview (all campaigns + transactional mail). Uses
 * cheap head-only COUNT queries per event type (no row payloads), so it scales as the ledger grows.
 * FAIL-SOFT: any read error (including the table not existing) yields the all-zero overview, so the
 * dashboard renders an honest empty state rather than throwing.
 */
export async function getMarketingEmailOverview(): Promise<MarketingEmailOverview> {
  try {
    const client = db()
    const countType = async (eventType: string): Promise<number> => {
      const { count, error } = await client
        .from('email_events')
        .select('*', { count: 'exact', head: true })
        .eq('event_type', eventType)
      return error || count == null ? 0 : count
    }

    const [sent, delivered, opened, clicked, bounced, unsubscribed, complained] = await Promise.all(
      COUNTED_TYPES.map((t) => countType(t)),
    )
    const counts: EventCounts = { sent, delivered, opened, clicked, bounced, unsubscribed, complained }

    // campaignsSent + last event: two more cheap reads, both fail-soft.
    const { count: campaignsSent } = await client
      .from('campaigns')
      .select('*', { count: 'exact', head: true })
      .not('sent_at', 'is', null)
    const { data: latest } = await client
      .from('email_events')
      .select('created_at')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const ratio = (num: number, den: number): number => (den > 0 ? num / den : 0)
    return {
      ...counts,
      ...computeRates(counts),
      complaintRate: ratio(complained, delivered),
      unsubscribeRate: ratio(unsubscribed, delivered),
      deliveryRate: ratio(delivered, sent),
      lastEventAt: (latest as { created_at?: string } | null)?.created_at ?? null,
      campaignsSent: campaignsSent ?? 0,
    }
  } catch {
    return ZERO_OVERVIEW
  }
}

/** One day of the engagement timeline: an ISO date (YYYY-MM-DD) with that day's open + click tallies. */
export interface CampaignTimelinePoint {
  day: string
  opened: number
  clicked: number
}

/** A campaign's engagement over daily buckets, for a small sparkline. `opens` / `clicks` are the
 *  per-day series (oldest → newest) aligned to `days`; empty when the campaign has not sent or has
 *  no tagged engagement (e.g. a legacy send). */
export interface CampaignTimeline {
  days: string[]
  opens: number[]
  clicks: number[]
  points: CampaignTimelinePoint[]
}

const EMPTY_TIMELINE: CampaignTimeline = { days: [], opens: [], clicks: [], points: [] }

/**
 * Daily open/click buckets across the campaign's send window (up to today, capped at
 * TIMELINE_WINDOW_DAYS). EXACT attribution: only this campaign's tagged events feed the buckets.
 * FAIL-SOFT to an empty timeline for an unsent campaign or a legacy send with no tagged events, so
 * a sparkline simply renders nothing.
 */
export async function getCampaignTimeline(campaignId: string): Promise<CampaignTimeline> {
  const info = await loadCampaignSendInfo(campaignId)
  if (!info || !info.sentAt) return EMPTY_TIMELINE

  const sentAt = new Date(info.sentAt)
  if (Number.isNaN(sentAt.getTime())) return EMPTY_TIMELINE

  const events = await fetchCampaignEvents(campaignId)
  if (events.length === 0) return EMPTY_TIMELINE

  // Cap the visible span at "today" (and at the display window), so we do not draw empty future days.
  const windowEnd = sentAt.getTime() + TIMELINE_WINDOW_DAYS * DAY_MS
  const end = new Date(Math.min(Date.now(), windowEnd))
  const dayKey = (d: Date) => d.toISOString().slice(0, 10)

  // Seed one bucket per calendar day from send day → today (inclusive), so gaps read as zeros.
  const buckets = new Map<string, { opened: number; clicked: number }>()
  for (
    let t = Date.UTC(sentAt.getUTCFullYear(), sentAt.getUTCMonth(), sentAt.getUTCDate());
    t <= end.getTime();
    t += DAY_MS
  ) {
    buckets.set(dayKey(new Date(t)), { opened: 0, clicked: 0 })
  }

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
