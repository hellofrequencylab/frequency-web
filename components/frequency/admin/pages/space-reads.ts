import 'server-only'
import { cache } from 'react'
import { createAdminClient } from '@/lib/supabase/admin'
import { spaceEarningsSummary } from '@/lib/commerce/orders'
import { DAY_MS, type CheckinRow } from './checkin-stats'

// THE SPACE READS THE FREQUENCY ADMIN BODIES ADD (Overview, Contacts, Economy). Read-only, fail-quiet, and
// rendered only behind the Space console's manage gate (the bodies' callers authorized first).
//
// CHECK-INS. The verified check-in ledger is `engagement_events` (practice.verified), written by the event
// check-in action with `context.eventId` and `context.kind = 'event_checkin'` (app/(main)/events/actions.ts),
// the same rows loadEventCoreStats counts per event. A Space's check-ins are those rows for the Space's own
// events. A read failure returns null, so a body shows the design's empty value rather than a zero.
//
// REVENUE BY WEEK. spaceEarningsSummary is the one canonical earnings read (orders, tickets and gifts, with
// partial refunds netted). It takes a trailing window, so a week is the difference of two windows: the
// same arithmetic, never a second copy of it.

const EVENT_BATCH = 100
const MAX_EVENTS = 400
const MAX_ROWS = 20_000

/** The Space's events whose start falls after `sinceIso` (all of them when omitted), newest first, capped. */
async function spaceEventIds(spaceId: string, sinceIso?: string): Promise<string[]> {
  let q = createAdminClient().from('events').select('id').eq('space_id', spaceId)
  // Check-ins land on or after an event's day, so an event that started before the window holds none of
  // the window's rows (the margin covers a multi-day event).
  if (sinceIso) q = q.gte('starts_at', new Date(Date.parse(sinceIso) - 14 * DAY_MS).toISOString())
  const { data, error } = await q.order('starts_at', { ascending: false }).limit(MAX_EVENTS)
  if (error) throw error
  return ((data ?? []) as { id: string }[]).map((r) => r.id)
}

/** Every verified check-in on this Space's events since `sinceDays` ago (all time when omitted). Null on a
 *  read failure. Request-cached, so Overview's KPIs, chart and Needs-you share one read. */
export const loadSpaceCheckins = cache(async (spaceId: string, sinceDays?: number): Promise<CheckinRow[] | null> => {
  if (!spaceId) return []
  try {
    const since = sinceDays ? new Date(Date.now() - sinceDays * DAY_MS).toISOString() : undefined
    const ids = await spaceEventIds(spaceId, since)
    if (ids.length === 0) return []
    const out: CheckinRow[] = []
    for (let i = 0; i < ids.length && out.length < MAX_ROWS; i += EVENT_BATCH) {
      let q = createAdminClient()
        .from('engagement_events')
        .select('actor_profile_id, created_at')
        .eq('event_type', 'practice.verified')
        .eq('context->>kind', 'event_checkin')
        .in('context->>eventId', ids.slice(i, i + EVENT_BATCH))
      if (since) q = q.gte('created_at', since)
      const { data, error } = await q.limit(MAX_ROWS)
      if (error) throw error
      for (const r of (data ?? []) as { actor_profile_id: string | null; created_at: string }[]) {
        const at = Date.parse(r.created_at)
        if (r.actor_profile_id && Number.isFinite(at)) out.push({ profileId: r.actor_profile_id, at })
      }
    }
    return out
  } catch (error) {
    console.error('[frequency/admin] space check-ins read failed:', error)
    return null
  }
})

export interface RevenueSeries {
  /** Net cents per week, oldest first; the last week ends now. */
  weeks: number[]
  last30: number
  prior30: number
}

/** Net revenue per week for the last `weeks` weeks, and the last two 30-day windows. Null on a failure. */
export const loadSpaceRevenueSeries = cache(async (spaceId: string, weeks = 12): Promise<RevenueSeries | null> => {
  if (!spaceId) return null
  try {
    const windows = Array.from({ length: weeks }, (_, i) => (i + 1) * 7)
    const [cumulative, d30, d60] = await Promise.all([
      Promise.all(windows.map((days) => spaceEarningsSummary(spaceId, days, true))),
      spaceEarningsSummary(spaceId, 30, true),
      spaceEarningsSummary(spaceId, 60, true),
    ])
    const nets = cumulative.map((s) => s.netCents)
    // nets[i] covers the last (i+1) weeks; week i (newest first) is its difference from the window before.
    const newestFirst = nets.map((v, i) => v - (i === 0 ? 0 : nets[i - 1]))
    return { weeks: newestFirst.reverse(), last30: d30.netCents, prior30: d60.netCents - d30.netCents }
  } catch (error) {
    console.error('[frequency/admin] space revenue series read failed:', error)
    return null
  }
})
