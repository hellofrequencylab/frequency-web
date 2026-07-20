// PER-CONTACT ENGAGEMENT STATS — the read-model rollup behind the contact card's engagement row
// (ADR-372 Phase 1 · docs/CRM-MASTER-BUILD-PLAN.md §Phase 1 / §C). Best practice (Activity Schema,
// HubSpot, Customer.io): keep the immutable event log (contact_interactions) and derive denormalized
// read models from it, rather than mutating a dark scalar. This is a COMPUTE-ON-READ reader — no table,
// no nightly refresh: it counts sent / opened / clicked / replied + last-touch + recency for one
// person, from `contact_interactions` (every logged touch) unioned with `email_events` (Resend
// opens/clicks by email, which the timeline does not fold row-by-row).
//
// SHAPE (mirrors lib/crm/timeline.ts): the PURE aggregator (`summarizeEngagement`) has no Supabase/Next
// imports, so it is unit-testable in isolation; the IO reader (`getContactEngagementStats`) reaches the
// two service-role tables through the untyped admin client (ADR-246). FAIL-SAFE: every read degrades to
// an all-zero stat block on any error, so the card never breaks on a stats miss.

import { createAdminClient } from '@/lib/supabase/admin'
import { escapeLike } from '@/lib/search-sanitize'
import type { ContactInteraction } from './interactions'

/** A minimal email_events row shape for the aggregator (event_type is all we count on). */
export interface EmailEventLite {
  event_type: string
  created_at: string
}

/** How recent the last touch is, bucketed for a plain badge (no raw day counts on the card). */
export type RecencyBand = 'none' | 'today' | 'this_week' | 'this_month' | 'stale'

/** The per-contact engagement rollup surfaced on the card's stat row. */
export interface EngagementStats {
  /** Outbound email + in-house messages we sent them. */
  sent: number
  /** Email opens (from email_events). */
  opened: number
  /** Email link clicks (from email_events). */
  clicked: number
  /** Inbound touches from them (a reply: inbound email or in-house message). */
  replied: number
  /** Every logged touch across every channel (the timeline depth). */
  touches: number
  /** ISO timestamp of the most recent touch, or null when there is none. */
  lastTouchAt: string | null
  /** Whole days since the last touch, or null when there is none. */
  recencyDays: number | null
  /** The last-touch recency, bucketed. */
  recencyBand: RecencyBand
}

/** An empty rollup — the fail-safe default and the "no engagement yet" state. */
export const EMPTY_ENGAGEMENT_STATS: EngagementStats = {
  sent: 0,
  opened: 0,
  clicked: 0,
  replied: 0,
  touches: 0,
  lastTouchAt: null,
  recencyDays: null,
  recencyBand: 'none',
}

const DAY_MS = 86_400_000

/** Bucket a day count into a recency band. Pure. */
export function recencyBandFor(days: number | null): RecencyBand {
  if (days == null) return 'none'
  if (days <= 0) return 'today'
  if (days < 7) return 'this_week'
  if (days < 30) return 'this_month'
  return 'stale'
}

/**
 * Roll up engagement for one person from their logged touches + their email events. Pure and
 * deterministic (takes `now` so recency is testable):
 *   • sent    = outbound email + outbound in-house message interactions.
 *   • replied = inbound email + inbound in-house message interactions.
 *   • opened / clicked = email_events of type 'opened' / 'clicked'.
 *   • touches = every interaction row.
 *   • lastTouchAt = the newest interaction occurredAt (email opens are not a "touch you made").
 * A blank / unparseable timestamp never counts toward recency.
 */
export function summarizeEngagement(
  interactions: ContactInteraction[],
  emailEvents: EmailEventLite[],
  now: number = Date.now(),
): EngagementStats {
  const list = interactions ?? []
  const events = emailEvents ?? []

  let sent = 0
  let replied = 0
  let lastTouch = 0

  for (const i of list) {
    const isMessage = i.channel === 'email' || i.channel === 'sms' || i.channel === 'in_app'
    if (isMessage && i.direction === 'outbound') sent += 1
    if (isMessage && i.direction === 'inbound') replied += 1
    const t = Date.parse(i.occurredAt)
    if (!Number.isNaN(t) && t > lastTouch) lastTouch = t
  }

  let opened = 0
  let clicked = 0
  for (const e of events) {
    if (e.event_type === 'opened') opened += 1
    else if (e.event_type === 'clicked') clicked += 1
  }

  const lastTouchAt = lastTouch > 0 ? new Date(lastTouch).toISOString() : null
  const recencyDays = lastTouch > 0 ? Math.max(0, Math.floor((now - lastTouch) / DAY_MS)) : null

  return {
    sent,
    opened,
    clicked,
    replied,
    touches: list.length,
    lastTouchAt,
    recencyDays,
    recencyBand: recencyBandFor(recencyDays),
  }
}

// ── IO: gather the two sources for one person, then aggregate. Service-role, FAIL-SAFE. ─────────────

/**
 * Compute the engagement rollup for one person: all their interactions (across every stitched identity
 * subject id) unioned with their email events (by lowercased email). The caller (a staff-gated contact
 * surface) has already authorized the scope; this is a service-role read. FAIL-SAFE: an all-zero block
 * on any error, so the stat row degrades to "no engagement yet" rather than breaking the page.
 */
export async function getContactEngagementStats(
  subjectIds: (string | null | undefined)[],
  email: string | null | undefined,
): Promise<EngagementStats> {
  const ids = [...new Set((subjectIds ?? []).filter((s): s is string => typeof s === 'string' && s.length > 0))]
  const needle = (email ?? '').trim().toLowerCase()
  if (ids.length === 0 && !needle) return EMPTY_ENGAGEMENT_STATS

  try {
    const db = createAdminClient() as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          in: (col: string, vals: string[]) => { limit: (n: number) => Promise<{ data: unknown[] | null; error: unknown }> }
          ilike: (col: string, val: string) => { limit: (n: number) => Promise<{ data: unknown[] | null; error: unknown }> }
        }
      }
    }

    const [interRes, eventRes] = await Promise.all([
      ids.length
        ? db.from('contact_interactions').select('channel, direction, occurred_at').in('subject_id', ids).limit(2000)
        : Promise.resolve({ data: [], error: null }),
      needle
        ? db.from('email_events').select('event_type, created_at').ilike('email', escapeLike(needle)).limit(2000)
        : Promise.resolve({ data: [], error: null }),
    ])

    // Map the raw rows to the aggregator's minimal shapes (only the fields it counts on).
    const interactions = ((interRes.data ?? []) as Record<string, unknown>[]).map(
      (r) =>
        ({
          channel: r.channel,
          direction: r.direction,
          occurredAt: String(r.occurred_at ?? ''),
        }) as unknown as ContactInteraction,
    )
    const events = ((eventRes.data ?? []) as Record<string, unknown>[]).map((r) => ({
      event_type: String(r.event_type ?? ''),
      created_at: String(r.created_at ?? ''),
    }))

    return summarizeEngagement(interactions, events)
  } catch {
    return EMPTY_ENGAGEMENT_STATS
  }
}
