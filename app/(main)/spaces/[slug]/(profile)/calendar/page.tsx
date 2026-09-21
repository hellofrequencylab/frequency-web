import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { notFound } from 'next/navigation'
import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { setActiveSpace } from '@/lib/spaces/active-space'
import { SITE_URL } from '@/lib/site'
import { loadPublicSpaceWindow } from '@/lib/calendar/public-month'
import { guestFeedState, guestLiveItems } from '@/lib/calendar/guest-live'
import { monthGridWindow, yearHorizonWindow } from '@/lib/calendar/month-window'
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

  const grid = monthGridWindow(initialYear, initialMonth1)
  const guestEvents = guestLiveItems(await loadPublicSpaceWindow(space.id, grid.fromDay, grid.toDay))
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
    entryWindow: yearHorizonWindow(initialYear),
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
      initialYear={initialYear}
      initialMonth1={initialMonth1}
      guestEvents={guestEvents}
      guestFirstUse={feed.isFirstUse}
      adminEvents={admin.events}
      dayNotes={admin.dayNotes}
      plans={admin.plans}
      subscribe={subscribe}
      loadGuestMonth={loadSpaceCalendarMonth.bind(null, slug)}
    />
  )
}
