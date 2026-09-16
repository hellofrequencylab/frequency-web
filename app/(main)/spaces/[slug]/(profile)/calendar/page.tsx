import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getMyProfileId } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { setActiveSpace } from '@/lib/spaces/active-space'
import { listSpaceCalendarEvents } from '@/lib/events/store'
import { SITE_URL } from '@/lib/site'
import { EventCalendar } from '@/components/events/event-calendar'
import { spaceEventRowsToItems } from '@/lib/calendar/public-month'
import { listPublicUnavailableItems } from '@/lib/calendar/entries-store'
import { monthGridWindow } from '@/lib/calendar/month-window'
import { loadSpaceCalendarMonth } from './actions'
import { listDayNotes } from '@/lib/calendar/day-notes-store'
import { CalendarSubscribeMenu } from '@/components/events/calendar-subscribe-menu'
import { spaceProfileMetadata } from '@/lib/spaces/profile-metadata'

// THE PER-SPACE CALENDAR TAB (Events EC2, ADR-1385). A month grid or list of the Space's events; clicking one opens
// a truncated popup with a "Go to Event" link. Guests can subscribe the whole Space calendar into any
// calendar app via the public per-space .ics feed (Events EC1). The identity hero + tab chrome come from
// the (profile) layout; this is the body.

// Its OWN canonical + title. Without this the tab inherits the Space ROOT's metadata and declares
// itself a duplicate of a page it is not (FINALIZE-PLAN §9.5).
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  return spaceProfileMetadata(slug, {
    segment: 'calendar',
    label: 'Calendar',
    describe: (brandName) => `Every upcoming event at ${brandName}, on one calendar you can subscribe to.`,
  })
}

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

  // The page's own month forward (the gated reader, up to its row limit), plus any time the team chose
  // to show as Unavailable in this month's grid. Every other month arrives through
  // loadSpaceCalendarMonth as the visitor browses (ADR-1385), so earlier months are not falsely empty.
  const grid = monthGridWindow(initialYear, initialMonth1)
  const [rows, unavailable, dayNotes] = await Promise.all([
    listSpaceCalendarEvents(space.id, { fromDay: grid.fromDay }),
    listPublicUnavailableItems(space.id, grid.fromDay, grid.toDay),
    listDayNotes(space.id, { publicOnly: true }),
  ])
  const events = [...(await spaceEventRowsToItems(rows)), ...unavailable]

  const brandName = space.brandName ?? space.name
  const httpsUrl = `${SITE_URL}/spaces/${slug}/calendar.ics`
  const webcalUrl = httpsUrl.replace(/^https?:\/\//, 'webcal://')

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lead font-bold text-text">Calendar</h2>
          <p className="text-body-sm text-muted">Upcoming events from {brandName}. Subscribe to add them to your own calendar.</p>
        </div>
        <CalendarSubscribeMenu
          httpsUrl={httpsUrl}
          webcalUrl={webcalUrl}
          title={`${brandName} in your calendar`}
          description={`Subscribe once and ${brandName}'s events show up in Google or Apple Calendar, and stay current on their own.`}
        />
      </div>

      <EventCalendar
        events={events}
        initialYear={initialYear}
        initialMonth1={initialMonth1}
        loadMonth={loadSpaceCalendarMonth.bind(null, slug)}
        dayNotes={dayNotes}
      />

      {rows.length === 0 && (
        <p className="rounded-card border border-dashed border-border bg-surface px-4 py-6 text-center text-body-sm text-muted">
          No upcoming events yet. Check back soon, or subscribe to be notified when {brandName} adds one.
        </p>
      )}
    </div>
  )
}
