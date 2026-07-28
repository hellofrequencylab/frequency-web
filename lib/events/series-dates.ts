import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { HOME_TZ, dayInZone } from '@/lib/time/zone'
import {
  DEFAULT_RAIL_DATES,
  isSeriesCadence,
  seriesDates,
  seriesUpcomingFloor,
  type SeriesDate,
} from './series'

// The READ behind an event page's series rail (ADR-897): the next N live dates of the series this
// event belongs to, each linking to that date's own page.
//
// The fold in lib/events/series.ts is deliberately pure and never fetches — bypassing the caller's
// gates would turn a display helper into an RLS hole. So the fetching lives HERE, on the server,
// applying the SAME listing predicates the browse surfaces apply (published, public/unlisted,
// non-cancelled) rather than trusting the sibling relationship alone. An occurrence the viewer could
// not have found by browsing must not become findable through a rail.
//
// WHY A QUERY AND NOT ARITHMETIC: lib/events/recurrence.ts nextOccurrence() can compute dates from
// the cadence, but the materialised rows are the truth and can disagree — a host cancels one week, or
// the cron has not minted past the 60-day horizon yet. The rail shows dates that really exist.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface SeriesRailDate extends SeriesDate {
  isCurrent: boolean
}

/**
 * The next `limit` upcoming dates of the series `eventId` belongs to, earliest first.
 *
 * Returns [] for a non-recurring event, and [] on any error (a rail is an enhancement; it must never
 * break the event page). `anchorId` is the series key: the event's own id when it IS the anchor, else
 * its parent_event_id.
 */
export async function loadSeriesDates(opts: {
  eventId: string
  parentEventId: string | null
  recurrenceType: string | null
  limit?: number
}): Promise<SeriesRailDate[]> {
  const { eventId, parentEventId, recurrenceType } = opts
  const limit = opts.limit ?? DEFAULT_RAIL_DATES

  // A row belongs to a series if it carries a parent, or it is an anchor with a real cadence.
  const anchorId = parentEventId ?? (isSeriesCadence(recurrenceType) ? eventId : null)
  // The id is interpolated into a PostgREST `.or()` filter expression below, so this is the
  // sanitizer too (same rule as lib/events/circle-upcoming.ts circleEventScopeFilter).
  if (!anchorId || !UUID.test(anchorId)) return []

  try {
    const admin = createAdminClient()
    // The anchor row itself OR any child of it. Both halves carry the full listing gate.
    const { data, error } = await admin
      .from('events')
      .select('id, slug, starts_at, is_cancelled')
      .or(`id.eq.${anchorId},parent_event_id.eq.${anchorId}`)
      .eq('status', 'published')
      .in('visibility', ['public', 'unlisted'])
      .eq('is_cancelled', false)
      .is('removed_at', null)
      .order('starts_at', { ascending: true })
      // Over-fetch modestly: cancelled/undateable rows are filtered by the pure pass below.
      .limit(Math.max(limit * 4, 24))
    if (error || !Array.isArray(data)) return []

    // The floor is the community's wall-clock day, the same rule browse uses — never `new Date()`,
    // which after 5pm Pacific is already tomorrow in UTC and would drop tonight's date from the rail.
    const upcomingFrom = seriesUpcomingFloor(dayInZone(new Date(), HOME_TZ))
    const rows = data as Array<{
      id: string
      slug: string | null
      starts_at: string | null
      is_cancelled: boolean | null
    }>
    return seriesDates(rows, { upcomingFrom, limit }).map((d) => ({
      ...d,
      isCurrent: d.id === eventId,
    }))
  } catch {
    return []
  }
}
