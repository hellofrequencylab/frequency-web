import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { IndexTemplate } from '@/components/templates'
import { listPublicCalendarEvents } from '@/lib/events/store'
import { formatEventWhen } from '@/lib/time/zone'
import { eventDayKey } from '@/lib/events/calendar-grid'
import { SITE_URL } from '@/lib/site'
import { EventCalendar, type CalendarEvent } from '@/components/events/event-calendar'
import { CalendarSubscribeMenu } from '@/components/events/calendar-subscribe-menu'
import { pageContentMetadata } from '@/lib/page-content'

// THE MASTER FREQUENCY CALENDAR (Events EC3). A month grid of every upcoming PUBLIC event across the
// network; clicking one opens a truncated popup with a "Go to Event" link. A guest can subscribe the
// whole thing into any calendar app via the public master .ics feed (/events/calendar.ics). Composes
// the IndexTemplate (PAGE-FRAMEWORK Template B) — the rail falls through to 'global', no page-chrome
// edit needed. The grid + feed share ONE authoritative read (listPublicCalendarEvents ->
// public_calendar_feed) so they can never drift.

export function generateMetadata() {
  return pageContentMetadata('/events/calendar', {
    title: 'Events calendar',
    description: 'Every upcoming public event across Frequency, on one calendar you can subscribe to.',
  })
}

export default async function EventsCalendarPage() {
  // Default the grid to the current month; the read returns everything upcoming (a bounded window the
  // client grid pages over). The server clock (UTC) seeds the initial month — the grid buckets each
  // event on its own stored day regardless of the viewer's zone.
  const now = new Date()
  const initialYear = now.getUTCFullYear()
  const initialMonth1 = now.getUTCMonth() + 1

  const rows = await listPublicCalendarEvents()

  // Pre-format each event server-side (the timezone lib never ships to the client): the short chip
  // time, the full popup when-line (both in the event's own zone), and the day key the grid buckets on.
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

  const httpsUrl = `${SITE_URL}/events/calendar.ics`
  const webcalUrl = httpsUrl.replace(/^https?:\/\//, 'webcal://')

  return (
    <IndexTemplate
      trail={[
        { href: '/events', label: 'Events' },
        { href: '/events/calendar', label: 'Calendar' },
      ]}
      title="Events calendar"
      description="Every upcoming public event across Frequency, in one place. Subscribe to add them to your own calendar."
      action={
        <CalendarSubscribeMenu
          httpsUrl={httpsUrl}
          webcalUrl={webcalUrl}
          title="Frequency events in your calendar"
          description="Subscribe once and every upcoming public Frequency event shows up in Google or Apple Calendar, and stays current on its own."
        />
      }
    >
      <div className="space-y-4">
        <EventCalendar events={events} initialYear={initialYear} initialMonth1={initialMonth1} />

        {events.length === 0 && (
          <p className="rounded-xl border border-dashed border-border bg-surface px-4 py-6 text-center text-sm text-muted">
            No upcoming public events yet. Check back soon, or subscribe to be notified as they are added.
          </p>
        )}

        <div>
          <Link
            href="/events"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-muted transition-colors hover:text-text"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Back to events
          </Link>
        </div>
      </div>
    </IndexTemplate>
  )
}
