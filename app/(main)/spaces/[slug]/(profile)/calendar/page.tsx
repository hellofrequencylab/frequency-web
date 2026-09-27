import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { notFound } from 'next/navigation'
import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { setActiveSpace } from '@/lib/spaces/active-space'
import { SITE_URL } from '@/lib/site'
import { loadPublicSpaceWindow, loadSpaceUpcomingFeed } from '@/lib/calendar/public-month'
import { guestFeedState } from '@/lib/calendar/guest-live'
import { memberLayerChoices } from '@/lib/calendar/member-calendar'
import { SpaceUpcomingFeed } from '@/components/spaces/space-upcoming-feed'
import { dayInZone } from '@/lib/time/zone'
import { monthGridWindow, operatorHorizonWindow } from '@/lib/calendar/month-window'
import { loadSpaceCalendarMonth } from './actions'
import { CalendarSubscribeMenu } from '@/components/events/calendar-subscribe-menu'
import { spaceProfileMetadata } from '@/lib/spaces/profile-metadata'
import { getSpaceCapabilities, resolveSpaceManageAccess } from '@/lib/spaces/entitlements'
import { spaceFunctionAccess } from '@/lib/spaces/functions'
import { loadAdminCalendar } from '@/lib/calendar/admin-calendar'
import { CalendarWorkspace } from '@/components/spaces/calendar-workspace'
import {
  calendarViewCookieName,
  firstSearchParam,
  parseConsoleFlag,
  resolveOperatorCalendarView,
} from '@/lib/calendar/admin-views'

// THE MERGED CALENDAR AND EVENTS PAGE (Events EC2, ADR-1385, ADR-1464, ADR-1467; merged by
// LIVE-520 on the owner's ask, "Calendar & Events should be all one page").
//
// Calendar and Events were two menu rows over one subject: this tab, and the Home page's `#events`
// section anchor beside it. They are one page now. This page composes, top to bottom:
//   · the Up next band  — what is next at this Space, soonest first, as a feed (SpaceUpcomingFeed).
//   · the control bar   — WHEN (month, zone, paging, jump), HOW (the surface switch, now drawn for a
//                         MEMBER too), WHAT (the layer filter, when there is more than one layer),
//                         ACTIONS (subscribe; plus Pencil / Fullscreen for the team).
//   · the month grid, or the month's agenda, or — for the team — List and Workflow.
//
// Operators load Guest and Admin data once. Views slide in a client shell.
// Unsigned visitors stay Guest-only and never hit loadAdminCalendar.

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  return spaceProfileMetadata(slug, {
    segment: 'calendar',
    label: 'Calendar & Events',
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
  // of this page reads it, so a guest's calendar view never names it. It rides the Space row already loaded above.
  const spaceTimeZone = adminAllowed ? space.timeZone : null

  const grid = monthGridWindow(initialYear, initialMonth1)
  // THE BAND'S FLOOR IS THE SPACE'S OWN DAY (LIVE-520), never UTC's. `starts_at` holds the wall
  // clock as UTC parts, so a UTC floor drops tonight's 7 PM gathering from 5 PM Pacific onward --
  // the family of defect LIVE-514 and LIVE-516 both belong to. `dayInZone` falls back to the home
  // zone when a Space has never said.
  const spaceDay = dayInZone(now, space.timeZone)
  // The Guest feed (ADR-1457): loadPublicSpaceWindow folds every month, this first one and each
  // browsed one, through guestLiveItems, so pencil and planning never reach a guest. Applying it
  // again here changed nothing and read as a second gate (LIVE-468).
  // Two reads, in parallel and over the same gated reader: the MONTH the grid opens on, and the
  // next few gatherings whatever month they fall in. The band deliberately has no month ceiling --
  // it answers "what is next" on a Space whose current month happens to be empty, which is the
  // whole point of featuring it.
  const [guestEvents, upcomingRows] = await Promise.all([
    loadPublicSpaceWindow(space.id, grid.fromDay, grid.toDay),
    loadSpaceUpcomingFeed(space.id, spaceDay),
  ])
  const feed = guestFeedState(guestEvents)
  const upcoming = <SpaceUpcomingFeed rows={upcomingRows} />
  // The filter a member can reach, and only when it would filter something: derived from the window
  // the page actually loaded, so the chips describe this Space rather than the model's full set.
  const memberLayers = memberLayerChoices(guestEvents)

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
        upcoming={upcoming}
        memberLayers={memberLayers}
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
      upcoming={upcoming}
      memberLayers={memberLayers}
      loadGuestMonth={loadSpaceCalendarMonth.bind(null, slug)}
    />
  )
}
