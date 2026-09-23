import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { notFound } from 'next/navigation'
import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { setActiveSpace } from '@/lib/spaces/active-space'
import { SITE_URL } from '@/lib/site'
import { loadPublicSpaceWindow } from '@/lib/calendar/public-month'
import { guestFeedState } from '@/lib/calendar/guest-live'
import { monthGridWindow, operatorHorizonWindow } from '@/lib/calendar/month-window'
import { loadSpaceCalendarMonth } from './actions'
import { CalendarSubscribeMenu } from '@/components/events/calendar-subscribe-menu'
import { spaceProfileMetadata } from '@/lib/spaces/profile-metadata'
import { getSpaceCapabilities, resolveSpaceManageAccess } from '@/lib/spaces/entitlements'
import { spaceFunctionAccess } from '@/lib/spaces/functions'
import { loadAdminCalendar } from '@/lib/calendar/admin-calendar'
import { readSpaceTimeZone } from '@/lib/spaces/space-zone'
import { CalendarWorkspace } from '@/components/spaces/calendar-workspace'
import {
  calendarViewCookieName,
  firstSearchParam,
  parseConsoleFlag,
  resolveOperatorCalendarView,
} from '@/lib/calendar/admin-views'

// THE PER-SPACE CALENDAR TAB (Events EC2, ADR-1385, ADR-1464, ADR-1467).
// Operators load Guest and Admin data once. Views slide in a client shell.
// Unsigned visitors stay Guest-only and never hit loadAdminCalendar.

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
    plan?: string | string[]
    console?: string | string[]
    y?: string | string[]
    m?: string | string[]
  }>
}) {
  const [{ slug }, query] = await Promise.all([params, searchParams])
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

  const now = new Date()
  const initialYear = now.getUTCFullYear()
  const initialMonth1 = now.getUTCMonth() + 1
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

  // THE SPACE'S OWN ZONE (LIVE-471), read once here so the console header, the staff drawer and Ask
  // Vera all name the same one. Null when the Space has never said; those surfaces then fall back to
  // the viewer's browser zone, which is what they all did before this row. Only the operator's half
  // of this page reads it, so a guest's calendar view does not pay for the query.
  const spaceTimeZone = adminAllowed ? await readSpaceTimeZone(space.id) : null

  const grid = monthGridWindow(initialYear, initialMonth1)
  // The Guest feed (ADR-1457): loadPublicSpaceWindow folds every month, this first one and each
  // browsed one, through guestLiveItems, so pencil and planning never reach a guest. Applying it
  // again here changed nothing and read as a second gate (LIVE-468).
  const guestEvents = await loadPublicSpaceWindow(space.id, grid.fromDay, grid.toDay)
  const feed = guestFeedState(guestEvents)

  if (!adminAllowed) {
    return (
      <CalendarWorkspace
        slug={slug}
        spaceId={space.id}
        brandName={brandName}
        adminAllowed={false}
        canManage={false}
        initialView="guest"
        initialListItem={null}
        initialPlanId={null}
        initialYear={initialYear}
        initialMonth1={initialMonth1}
        guestEvents={guestEvents}
        guestFirstUse={feed.isFirstUse}
        adminEvents={[]}
        dayNotes={[]}
        plans={[]}
        subscribe={subscribe}
        loadGuestMonth={loadSpaceCalendarMonth.bind(null, slug)}
      />
    )
  }

  const jar = await cookies()
  const remembered = jar.get(calendarViewCookieName(slug))?.value
  const initialView = resolveOperatorCalendarView(query.view, remembered)
  const admin = await loadAdminCalendar(space.id, {
    canManage,
    year: initialYear,
    month1: initialMonth1,
    now,
    // List and Workflow derive from this one read and never page, so the window is anchored on
    // today and runs well past the end of a season (lib/calendar/month-window.ts says why).
    entryWindow: operatorHorizonWindow(now),
  })

  return (
    <CalendarWorkspace
      slug={slug}
      spaceId={space.id}
      brandName={brandName}
      adminAllowed
      canManage={canManage}
      initialView={initialView}
      initialListItem={firstSearchParam(query.item) ?? null}
      initialPlanId={firstSearchParam(query.plan) ?? null}
      initialConsole={parseConsoleFlag(query.console)}
      initialYear={initialYear}
      initialMonth1={initialMonth1}
      guestEvents={guestEvents}
      guestFirstUse={feed.isFirstUse}
      adminEvents={admin.events}
      dayNotes={admin.dayNotes}
      plans={admin.plans}
      spaceTimeZone={spaceTimeZone}
      subscribe={subscribe}
      loadGuestMonth={loadSpaceCalendarMonth.bind(null, slug)}
    />
  )
}
