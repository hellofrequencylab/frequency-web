import 'server-only'
import { listSpaceCalendarEvents, listCalendarEngagement } from '@/lib/events/store'
import { formatEventWhen, eventInstant } from '@/lib/time/zone'
import { eventDayKey } from '@/lib/events/calendar-grid'
import type { CalendarEvent } from './item'
import { listPublicUnavailableItems } from './entries-store'
import { guestLiveItems } from './guest-live'

// THE PUBLIC SPACE CALENDAR, one window at a time (ADR-1385, LIVE-414). The public Calendar tab loads
// its first month on the server and every other month through this, so browsing back or far forward is
// never an empty grid. It composes the EXISTING gated reader (listSpaceCalendarEvents: tenancy, hosting
// and shares, each re-gated), the public Unavailable projection, and guestLiveItems so pencil/planning
// never appear and cancelled stays for the date-square footer. It never reimplements a gate.

type SpaceCalendarRow = Awaited<ReturnType<typeof listSpaceCalendarEvents>>[number]

/** Public event rows as calendar items (the pre-formatted when-labels keep the tz lib server-side). */
export async function spaceEventRowsToItems(rows: SpaceCalendarRow[]): Promise<CalendarEvent[]> {
  const engagement = rows.length ? await listCalendarEngagement(rows.map((r) => r.id)) : new Map()
  return rows
    .map((ev): CalendarEvent | null => {
      const dayKey = eventDayKey(ev.starts_at)
      if (!dayKey) return null
      const eng = engagement.get(ev.id)
      return {
        slug: ev.slug,
        title: ev.title,
        dayKey,
        timeLabel: formatEventWhen(ev.starts_at, ev.time_zone, { style: 'time', withZone: false }),
        whenLabel: formatEventWhen(ev.starts_at, ev.time_zone, { style: 'full' }),
        startInstantIso: eventInstant(ev.starts_at, ev.time_zone)?.toISOString() ?? null,
        location: ev.location,
        goingCount: eng?.going ?? 0,
        coverUrl: eng?.coverUrl ?? null,
        coverFocus: eng?.coverFocus ?? null,
        isCancelled: !!ev.is_cancelled,
        layer: 'events',
      }
    })
    .filter((e): e is CalendarEvent => e !== null)
}

/** Every public item of a Space in [fromDay, toDay). */
export async function loadPublicSpaceWindow(spaceId: string, fromDay: string, toDay: string): Promise<CalendarEvent[]> {
  const [rows, unavailable] = await Promise.all([
    listSpaceCalendarEvents(spaceId, { fromDay, paintCancelled: true }),
    listPublicUnavailableItems(spaceId, fromDay, toDay),
  ])
  const inWindow = rows.filter((r) => {
    const key = eventDayKey(r.starts_at)
    return !!key && key < toDay
  })
  return guestLiveItems([...(await spaceEventRowsToItems(inWindow)), ...unavailable])
}
