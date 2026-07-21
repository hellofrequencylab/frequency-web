import { notFound } from 'next/navigation'
import { getMyProfileId } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { setActiveSpace } from '@/lib/spaces/active-space'
import { listSpaceCalendarEvents } from '@/lib/events/store'
import { formatEventWhen } from '@/lib/time/zone'
import { eventDayKey } from '@/lib/events/calendar-grid'
import { SITE_URL } from '@/lib/site'
import { EventCalendar, type CalendarEvent } from '@/components/events/event-calendar'
import { CalendarSubscribeMenu } from '@/components/events/calendar-subscribe-menu'

// THE PER-SPACE CALENDAR TAB (Events EC2). A month grid of the Space's upcoming events; clicking one opens
// a truncated popup with a "Go to Event" link. Guests can subscribe the whole Space calendar into any
// calendar app via the public per-space .ics feed (Events EC1). The identity hero + tab chrome come from
// the (profile) layout; this is the body.
export default async function SpaceCalendarPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const viewerProfileId = await getMyProfileId()
  const space = await getVisibleSpaceBySlug(slug, viewerProfileId)
  if (!space) notFound()
  setActiveSpace(space)

  // Default the grid to the current month; load this month's events forward (a bounded window the client
  // grid pages over). The server clock (UTC) seeds the initial month — close enough for the grid, which
  // buckets each event on its own stored day regardless of the viewer's zone.
  const now = new Date()
  const initialYear = now.getUTCFullYear()
  const initialMonth1 = now.getUTCMonth() + 1
  const fromDay = `${initialYear}-${String(initialMonth1).padStart(2, '0')}-01`

  const rows = await listSpaceCalendarEvents(space.id, { fromDay })

  // Pre-format each event server-side (the timezone lib never ships to the client): the short chip time,
  // the full popup when-line (both in the event's own zone), and the day key the grid buckets on.
  const events: CalendarEvent[] = rows
    .map((ev): CalendarEvent | null => {
      const dayKey = eventDayKey(ev.starts_at)
      if (!dayKey) return null
      return {
        slug: ev.slug,
        title: ev.title,
        dayKey,
        timeLabel: formatEventWhen(ev.starts_at, ev.time_zone, { style: 'time', withZone: false }),
        whenLabel: formatEventWhen(ev.starts_at, ev.time_zone, { style: 'full' }),
        location: ev.location,
        isCancelled: !!ev.is_cancelled,
      }
    })
    .filter((e): e is CalendarEvent => e !== null)

  const brandName = space.brandName ?? space.name
  const httpsUrl = `${SITE_URL}/spaces/${slug}/calendar.ics`
  const webcalUrl = httpsUrl.replace(/^https?:\/\//, 'webcal://')

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-text">Calendar</h2>
          <p className="text-sm text-muted">Upcoming events from {brandName}. Subscribe to add them to your own calendar.</p>
        </div>
        <CalendarSubscribeMenu
          httpsUrl={httpsUrl}
          webcalUrl={webcalUrl}
          title={`${brandName} in your calendar`}
          description={`Subscribe once and ${brandName}'s events show up in Google or Apple Calendar, and stay current on their own.`}
        />
      </div>

      <EventCalendar events={events} initialYear={initialYear} initialMonth1={initialMonth1} />

      {events.length === 0 && (
        <p className="rounded-xl border border-dashed border-border bg-surface px-4 py-6 text-center text-sm text-muted">
          No upcoming events yet. Check back soon, or subscribe to be notified when {brandName} adds one.
        </p>
      )}
    </div>
  )
}
