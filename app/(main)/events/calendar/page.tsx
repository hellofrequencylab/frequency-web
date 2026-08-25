import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { IndexTemplate } from '@/components/templates'
import { listPublicCalendarEvents, listCalendarEngagement, listSeriesAnchors } from '@/lib/events/store'
import { missingAnchorIds, planCalendarRepeats } from '@/lib/events/calendar-repeats'
import { formatEventWhen, eventInstant } from '@/lib/time/zone'
import { eventDayKey } from '@/lib/events/calendar-grid'
import { SITE_URL } from '@/lib/site'
import { EventCalendar, type CalendarEvent } from '@/components/events/event-calendar'
import { CalendarSubscribeMenu } from '@/components/events/calendar-subscribe-menu'
import { pageContentMetadata } from '@/lib/page-content'
import { resolveIndexHero } from '@/lib/layout/index-hero'

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
  // Enrich with "going" count + cover for the popup (kept out of the feed RPC; display-only), and
  // read the ANCHOR rows behind the repeating series. The anchors are a separate read because the
  // feed cannot carry them: it floors at `now() - 1 day`, so an established series' anchor date
  // passed out of the window long ago while its children keep arriving — and a child row says
  // `recurrence_type: 'none'` by DB CHECK, so the cadence exists nowhere else (LIVE-081 trap 2).
  const [engagement, anchors] = await Promise.all([
    listCalendarEngagement(rows.map((r) => r.id)),
    listSeriesAnchors(missingAnchorIds(rows)),
  ])

  // The Repeats plan: one chip per series, the next date of each series kept as a card, every later
  // date demoted to a dot, and the dates past the 60-day materialised horizon COMPUTED for display
  // (LIVE-081). Pure and unit-tested in lib/events/calendar-repeats.test.ts — the route file owns no
  // logic, per the sort.ts precedent.
  const repeats = planCalendarRepeats(rows, { anchors, now })
  const laterDateIds = new Set(repeats.laterDateIds)

  // Pre-format each event server-side (the timezone lib never ships to the client): the short chip
  // time, the full popup when-line (both in the event's own zone), and the day key the grid buckets on.
  // The absolute instant is passed too, so the client can offer a "show in my timezone" toggle (native Intl).
  const events: CalendarEvent[] = rows
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
        seriesKey: repeats.seriesKeyByEventId[ev.id] ?? null,
        isLaterDate: laterDateIds.has(ev.id),
      }
    })
    .filter((e): e is CalendarEvent => e !== null)

  const httpsUrl = `${SITE_URL}/events/calendar.ics`
  const webcalUrl = httpsUrl.replace(/^https?:\/\//, 'webcal://')

  // The hero band through the ONE browse-hero ladder (lib/layout/index-hero, PROG-P4). The calendar
  // sets no cover of its own, so it INHERITS the Events section hero through the copy cascade
  // (PROG-P6, ADR-1122) — the photo an operator uploaded for /events in June, which this page has
  // never shown. Its INDEX_HERO_DEFAULTS row takes `short`: a month grid is a work surface, and a
  // 24rem band would push the first week below the fold on a phone.
  const hero = await resolveIndexHero('/events/calendar')

  return (
    <IndexTemplate
      {...hero}
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
        <EventCalendar
          events={events}
          initialYear={initialYear}
          initialMonth1={initialMonth1}
          repeats={repeats.series}
        />

        {events.length === 0 && (
          <p className="rounded-card border border-dashed border-border bg-surface px-4 py-6 text-center text-body-sm text-muted">
            No upcoming public events yet. Check back soon, or subscribe to be notified as they are added.
          </p>
        )}

        <div>
          <Link
            href="/events"
            className="inline-flex items-center gap-1.5 text-body-sm font-medium text-muted transition-colors hover:text-text"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Back to events
          </Link>
        </div>
      </div>
    </IndexTemplate>
  )
}
