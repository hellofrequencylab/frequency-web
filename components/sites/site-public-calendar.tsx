import { type ProgramEvent, type ProgramMonth } from '@/lib/spaces/leadership'
import { loadSpacePageDoc } from '@/lib/spaces/page-doc'
import { SITE_URL } from '@/lib/site'
import { appOrigin } from '@/lib/sites/host'
import { loadPublicSpaceWindow, loadSpaceUpcomingFeed } from '@/lib/calendar/public-month'
import { guestFeedState } from '@/lib/calendar/guest-live'
import { memberLayerChoices } from '@/lib/calendar/member-calendar'
import { monthGridWindow } from '@/lib/calendar/month-window'
import { dayInZone } from '@/lib/time/zone'
import { SpaceUpcomingFeed } from '@/components/spaces/space-upcoming-feed'
import { CalendarSubscribeMenu } from '@/components/events/calendar-subscribe-menu'
import { CalendarWorkspace } from '@/components/spaces/calendar-workspace'
import { loadSpaceCalendarMonth } from '@/app/(main)/spaces/[slug]/(profile)/calendar/actions'
import { retreatShort } from '@/components/sites/admin/site-calendar'

// THE WEBSITE'S CALENDAR (LIVE-869, reworked by LIVE-872 on the owner's ask 2026-10-08: "I wanted the Hearts
// on Fire Frequency calendar on the main home page, not the admin version"). The Space's own Frequency
// calendar, exactly as a visitor sees it on the Space's Calendar tab (app/(main)/spaces/[slug]/(profile)/
// calendar/page.tsx, its guest half): the Up next band, the month grid and the subscribe menu, over the
// same gated public reads, without the sky overlay (astronomy-engine stays on the Space page's route; see
// lib/astrology/chart.test.ts). A Menswork website draws it as its `calendar` page and as a section at the end
// of Home. The admin Yearly Calendar stays behind the admin links.

/** The website page that is the public calendar, when the Space lists it among its pages. */
export const SITE_CALENDAR_SLUG = 'calendar'

/** "Oct 29 – 31, 2027", the rail card's line. */
export const retreatDates = (e: ProgramEvent) => `${retreatShort(e).replace('–', ' – ')}, ${e.dayKey.slice(0, 4)}`

/** The year's retreat (the multi-day event named a retreat, else the first multi-day one) and its month. */
export function findRetreat(events: ProgramEvent[], months: ProgramMonth[]) {
  const event = events.find((e) => e.endDayKey && /\bretreat\b/i.test(e.title)) ?? events.find((e) => e.endDayKey)
  const month = event ? months.find((m) => event.dayKey.startsWith(`${m.year}-${String(m.month0 + 1).padStart(2, '0')}`)) : null
  return event && month ? { event, month } : null
}

export async function SitePublicCalendar({
  space,
  brandName,
}: {
  space: { id: string; slug: string; timeZone: string | null; preferences?: unknown }
  brandName: string
}) {
  const now = new Date()
  const initialYear = now.getUTCFullYear()
  const initialMonth1 = now.getUTCMonth() + 1
  const grid = monthGridWindow(initialYear, initialMonth1)
  const [guestEvents, upcomingRows] = await Promise.all([
    loadPublicSpaceWindow(space.id, grid.fromDay, grid.toDay),
    loadSpaceUpcomingFeed(space.id, dayInZone(now, space.timeZone)),
  ])
  const httpsUrl = `${SITE_URL}/spaces/${space.slug}/calendar.ics`
  return (
    <CalendarWorkspace
      eventOrigin={appOrigin()}
      slug={space.slug}
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
      guestFirstUse={guestFeedState(guestEvents).isFirstUse}
      adminEvents={[]}
      dayNotes={[]}
      plans={[]}
      subscribe={
        <CalendarSubscribeMenu
          httpsUrl={httpsUrl}
          webcalUrl={httpsUrl.replace(/^https?:\/\//, 'webcal://')}
          title={`${brandName} in your calendar`}
          description={`Subscribe once and ${brandName}'s events show up in Google or Apple Calendar, and stay current on their own.`}
        />
      }
      upcoming={<SpaceUpcomingFeed rows={upcomingRows} eventOrigin={appOrigin()} />}
      memberLayers={memberLayerChoices(guestEvents)}
      skyMarkers={[]}
      loadGuestMonth={loadSpaceCalendarMonth.bind(null, space.slug)}
    />
  )
}

/** The first photo on the website page whose slug names `word` (the Desert Retreat page's hero), else null. */
export async function pagePhoto(preferences: unknown, brandName: string, word: string): Promise<string | null> {
  const pages = (preferences as { pages?: { slug?: unknown }[] } | null)?.pages ?? []
  const slug = pages.map((p) => (typeof p?.slug === 'string' ? p.slug : '')).find((s) => s.includes(word))
  if (!slug) return null
  const doc = await loadSpacePageDoc(preferences, brandName, slug)
  for (const block of doc.content ?? []) {
    const image = (block?.props as Record<string, unknown> | undefined)?.image
    if (typeof image === 'string' && /^https:\/\//.test(image)) return image.split('?')[0]
  }
  return null
}
