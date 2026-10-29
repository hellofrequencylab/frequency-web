import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { setActiveSpace } from '@/lib/spaces/active-space'
import { SITE_URL } from '@/lib/site'
import { loadPublicSpaceWindow, loadSpaceUpcomingFeed } from '@/lib/calendar/public-month'
import { guestFeedState } from '@/lib/calendar/guest-live'
import { memberLayerChoices } from '@/lib/calendar/member-calendar'
import { SpaceUpcomingFeed } from '@/components/spaces/space-upcoming-feed'
import { openingMonth } from '@/lib/calendar/open-month'
import { dayInZone } from '@/lib/time/zone'
import { astroMarkersInRange, widenDayRange } from '@/lib/calendar/astro-markers'
import { readSkyMarkersEnabled } from '@/lib/spaces/sky-markers'
import { monthGridWindow } from '@/lib/calendar/month-window'
import { loadSpaceCalendarMonth } from './actions'
import { CalendarSeo } from './calendar-seo'
import { CalendarSubscribeMenu } from '@/components/events/calendar-subscribe-menu'
import { spaceProfileMetadata } from '@/lib/spaces/profile-metadata'
import { getSpaceCapabilities, resolveSpaceManageAccess } from '@/lib/spaces/entitlements'
import { spaceFunctionAccess } from '@/lib/spaces/functions'
import { CalendarWorkspace } from '@/components/spaces/calendar-workspace'
import { asksForPublicCalendar, teamCalendarRedirect } from '@/lib/calendar/audience'
import { CalendarAudienceToggle } from '@/components/calendar-suite/audience-toggle'

// THE MERGED CALENDAR AND EVENTS PAGE (Events EC2, ADR-1385, ADR-1464, ADR-1467; merged by
// LIVE-520 on the owner's ask, "Calendar & Events should be all one page").
//
// Calendar and Events were two menu rows over one subject: this tab, and the Home page's `#events`
// section anchor beside it. They are one page now. This page composes, top to bottom:
//   · the Up next band  — what is next at this Space, soonest first, as a feed (SpaceUpcomingFeed).
//   · the control bar   — WHEN (month, zone, paging, jump), HOW (the surface switch, now drawn for a
//                         MEMBER too), WHAT (the layer filter, when there is more than one layer),
//                         ACTIONS (subscribe; plus Pencil / Fullscreen for the team).
//   · the month grid, or the month's agenda.
//
// ROLE BASED (owner ruling 2026-10-29): this is the PUBLIC calendar. A Space's admin who opens it is sent
// to the full suite at the console route, and can come back here with Public view (`?as=public`).
// lib/calendar/audience.ts holds the two addresses.
//
// Operators load Guest and Admin data once. Views slide in a client shell.
// Unsigned visitors stay Guest-only and never hit loadAdminCalendar.

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const base = await spaceProfileMetadata(slug, {
    segment: 'calendar',
    label: 'Calendar & Events',
    describe: (brandName) => `What's happening at ${brandName}: upcoming events with dates and times, on one calendar you can add to Google or Apple Calendar.`,
  })
  // The feed is the machine-readable twin of this page; point calendar apps and crawlers at it.
  return { ...base, alternates: { ...base.alternates, types: { 'text/calendar': `${SITE_URL}/spaces/${slug}/calendar.ics` } } }
}

export default async function SpaceCalendarPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{
    view?: string | string[]
    as?: string | string[]
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

  // ROLE BASED (owner ruling 2026-10-29). A Space's admin opening this tab lands on the full suite; the
  // public calendar below is what everyone else sees, and what an admin sees on asking for Public view.
  const adminWantsPublic = adminAllowed && asksForPublicCalendar(query)
  if (adminAllowed && !adminWantsPublic) redirect(teamCalendarRedirect(slug, query))

  const now = new Date()
  // The month in the link, else the CURRENT month in the Space's own day (lib/calendar/open-month.ts),
  // never the month of its first or its most events.
  const { year: initialYear, month1: initialMonth1, pinned: monthPinned } = openingMonth(now, space.timeZone, query)
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

  // ── THE SKY (LIVE-526) ────────────────────────────────────────────────────────────────────────
  //
  // Computed on the SERVER over a window WIDER than the opening month, and handed down whole. Both
  // halves of that are size decisions rather than style ones:
  //
  //   • On the server, because astronomy-engine is 116 KB minified in the browser build, while a
  //     26-month window of markers is 9.3 KB of JSON. Computing them in the grid (which is
  //     `'use client'`) would put the library on every phone that opens a Space calendar, straight
  //     into the budgets AGENTS.md keeps.
  //   • Wider than the month, because the grid browses months on its own through `loadGuestMonth`.
  //     One generous window means a reader can page a year either way and the sky is already there,
  //     with no change to `loadMonth`'s signature and no second round trip per month.
  //
  // OPT-IN, default off (owner decision): moon phases and zodiac ingresses suit some Spaces and
  // would read as noise on a coworking or trades Space. Gated on the `events` function too, the way
  // the public Shop tab is gated on BOTH `storefront.published` and the `shop` function.
  const skyOn = readSkyMarkersEnabled(space.preferences)
  const skyWindow = widenDayRange(grid.fromDay, grid.toDay, 13)
  const skyMarkers = skyOn ? astroMarkersInRange(skyWindow[0], skyWindow[1], space.timeZone) : []


  // The visitor's calendar, for a visitor and for an admin who asked to see it the way a visitor does.
  return (
    <>
      {adminWantsPublic ? (
        <div className="mb-3 flex justify-end">
          <CalendarAudienceToggle slug={slug} audience="public" />
        </div>
      ) : null}
      <CalendarSeo slug={slug} brandName={brandName} timeZone={space.timeZone} rows={upcomingRows} />
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
        monthPinned={monthPinned}
        guestEvents={guestEvents}
        guestFirstUse={feed.isFirstUse}
        adminEvents={[]}
        dayNotes={[]}
        plans={[]}
        subscribe={subscribe}
        upcoming={upcoming}
        memberLayers={memberLayers}
        skyMarkers={skyMarkers}
        loadGuestMonth={loadSpaceCalendarMonth.bind(null, slug)}
      />
    </>
  )
}
