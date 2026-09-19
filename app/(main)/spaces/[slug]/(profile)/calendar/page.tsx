import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { notFound } from 'next/navigation'
import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { setActiveSpace } from '@/lib/spaces/active-space'
import { SITE_URL } from '@/lib/site'
import { EventCalendar } from '@/components/events/event-calendar'
import { EmptyState } from '@/components/ui/empty-state'
import { loadPublicSpaceWindow } from '@/lib/calendar/public-month'
import { guestFeedState, guestLiveItems } from '@/lib/calendar/guest-live'
import { monthGridWindow, yearHorizonWindow } from '@/lib/calendar/month-window'
import { loadSpaceCalendarMonth } from './actions'
import { CalendarSubscribeMenu } from '@/components/events/calendar-subscribe-menu'
import { spaceProfileMetadata } from '@/lib/spaces/profile-metadata'
import { getSpaceCapabilities, resolveSpaceManageAccess } from '@/lib/spaces/entitlements'
import { spaceFunctionAccess } from '@/lib/spaces/functions'
import { loadAdminCalendar } from '@/lib/calendar/admin-calendar'
import { StaffCalendar } from '../../settings/calendar/staff-calendar'
import { CalendarModeToggle } from '@/components/spaces/calendar-mode-toggle'
import { CalendarPmConsole } from '@/components/spaces/calendar-pm-console'
import { CalendarListView } from '@/components/spaces/calendar-list-view'
import { CalendarTimelineView } from '@/components/spaces/calendar-timeline-view'
import { CalendarProjectsView } from '@/components/spaces/calendar-projects-view'
import {
  calendarViewBlurb,
  firstSearchParam,
  parseAdminCalendarView,
  parseTimelineMonth,
  type CalendarAdminView,
} from '@/lib/calendar/admin-views'
import { listIndexItems, selectListItem } from '@/lib/calendar/list-index'
import { monthTimelineBars, monthTimelineDays } from '@/lib/calendar/month-timeline'
import { projectBoard } from '@/lib/calendar/project-board'
import { loadEventCoreStats } from '@/lib/events/event-stats'

// THE PER-SPACE CALENDAR TAB (Events EC2, ADR-1385, ADR-1464). A month grid or list of the Space's
// events; clicking one opens a truncated popup with a "Go to Event" link. Guests can subscribe the
// whole Space calendar into any calendar app via the public per-space .ics feed (Events EC1). The
// identity hero + tab chrome come from the (profile) layout; this is the body.
//
// FIVE VIEWS (ADR-1464). Guest and Admin stay the two grids. List is the index plus viewer.
// Timeline is the month as a time scale. Projects is the stage kanban over ENTRY_STAGES.
//
// ADMIN / GUEST (ADR-1389, amended by ADR-1450, ADR-1454, ADR-1456, ADR-1457, ADR-1458, ADR-1464).
// A viewer who manages the Space lands on ADMIN: the production console (CalendarPmConsole).
// Pencil, Planning, and Production are their own lanes. The board lists cancelled. Operator
// views switch in the segmented control. Guest and ordinary members go through guestLiveItems:
// live chips plus the C0 cancelled footer. Pencil and planning stay off that feed. StaffCalendar
// is the date map and the settings drawer, not a second guest month. The server never loads the
// private layer for a guest: the mode is decided here, before any admin read.

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  return spaceProfileMetadata(slug, {
    segment: 'calendar',
    label: 'Calendar',
    describe: (brandName) => `Every upcoming event at ${brandName}, on one calendar you can subscribe to.`,
  })
}

export default async function SpaceCalendarPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{
    view?: string | string[]
    item?: string | string[]
    y?: string | string[]
    m?: string | string[]
  }>
}) {
  const [{ slug }, query] = await Promise.all([params, searchParams])
  const { view } = query
  const caller = await getCallerProfile()
  const viewerProfileId = caller?.id ?? null
  const space = await getVisibleSpaceBySlug(slug, viewerProfileId)
  if (!space) notFound()
  setActiveSpace(space)

  const { canManage, staffViewing } = viewerProfileId
    ? await resolveSpaceManageAccess(space, viewerProfileId, caller?.webRole)
    : { canManage: false, staffViewing: false }
  const adminAllowed =
    staffViewing ||
    (canManage && spaceFunctionAccess(space, 'events', (await getSpaceCapabilities(space, viewerProfileId)).role))
  const calendarView: CalendarAdminView = adminAllowed && view !== 'guest' ? parseAdminCalendarView(view) : 'guest'

  const now = new Date()
  const initialYear = now.getUTCFullYear()
  const initialMonth1 = now.getUTCMonth() + 1
  const todayKey = now.toISOString().slice(0, 10)

  const brandName = space.brandName ?? space.name
  const httpsUrl = `${SITE_URL}/spaces/${slug}/calendar.ics`
  const webcalUrl = httpsUrl.replace(/^https?:\/\//, 'webcal://')
  const subscribe = (
    <CalendarSubscribeMenu
      httpsUrl={httpsUrl}
      webcalUrl={webcalUrl}
      title={`${brandName} in your calendar`}
      description={`Subscribe once and ${brandName}'s events show up in Google or Apple Calendar, and stay current on their own.`}
    />
  )

  const chrome = (body: ReactNode) => (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lead font-bold text-text">Calendar</h2>
          <p className="text-body-sm text-muted">{calendarViewBlurb(calendarView, brandName)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {adminAllowed && <CalendarModeToggle slug={slug} mode={calendarView} />}
          {subscribe}
        </div>
      </div>
      {body}
    </div>
  )

  if (calendarView !== 'guest') {
    if (calendarView === 'list') {
      const admin = await loadAdminCalendar(space.id, {
        canManage,
        year: initialYear,
        month1: initialMonth1,
        now,
        entryWindow: yearHorizonWindow(initialYear),
      })
      const items = listIndexItems(admin.events)
      const selected = selectListItem(items, firstSearchParam(query.item))
      const stats = canManage && selected?.eventId ? await loadEventCoreStats(selected.eventId) : null
      return chrome(<CalendarListView slug={slug} items={items} selected={selected} stats={stats} />)
    }

    if (calendarView === 'timeline') {
      const month = parseTimelineMonth(query.y, query.m, { year: initialYear, month1: initialMonth1 })
      const admin = await loadAdminCalendar(space.id, {
        canManage,
        year: month.year,
        month1: month.month1,
        now,
      })
      return chrome(
        <CalendarTimelineView
          slug={slug}
          year={month.year}
          month1={month.month1}
          days={monthTimelineDays(month.year, month.month1, todayKey)}
          bars={monthTimelineBars(admin.events, month.year, month.month1)}
        />,
      )
    }

    if (calendarView === 'projects') {
      const admin = await loadAdminCalendar(space.id, {
        canManage,
        year: initialYear,
        month1: initialMonth1,
        now,
        entryWindow: yearHorizonWindow(initialYear),
      })
      return chrome(<CalendarProjectsView slug={slug} columns={projectBoard(admin.events)} canManage={canManage} />)
    }

    const admin = await loadAdminCalendar(space.id, { canManage, year: initialYear, month1: initialMonth1, now })
    return chrome(
      <CalendarPmConsole events={admin.events}>
        <StaffCalendar
          slug={space.slug}
          events={admin.events}
          initialYear={initialYear}
          initialMonth1={initialMonth1}
          canEdit={canManage}
          dayNotes={admin.dayNotes}
        />
      </CalendarPmConsole>,
    )
  }

  const grid = monthGridWindow(initialYear, initialMonth1)
  const events = guestLiveItems(await loadPublicSpaceWindow(space.id, grid.fromDay, grid.toDay))
  const feed = guestFeedState(events)

  return chrome(
    <>
      <EventCalendar
        events={events}
        initialYear={initialYear}
        initialMonth1={initialMonth1}
        loadMonth={loadSpaceCalendarMonth.bind(null, slug)}
      />
      {feed.isFirstUse && (
        <EmptyState
          variant="first-use"
          title="Nothing on the calendar yet."
          description={`${brandName} has not published a gathering. Subscribe and new dates will land in your own calendar.`}
        />
      )}
    </>,
  )
}
