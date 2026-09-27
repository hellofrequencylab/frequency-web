import Link from 'next/link'
import { CalendarDays, Users } from 'lucide-react'
import { getSpaceContentData } from '@/lib/spaces/content-data'
import { formatEventWhen } from '@/lib/time/zone'
import { WidgetCard } from '@/components/modules/module-card'
import { Avatar } from '@/components/ui/avatar'
import type { Space } from '@/lib/spaces/types'

// ── THE SPACE RAIL (LIVE-518) ─────────────────────────────────────────────────
// The right rail's SPACE-SCOPED page panels: what the Space the member is standing in has coming
// up, which Circles it runs, and who runs it. Selected by the `/spaces` rule in
// lib/layout/rail-panels.ts and rendered through the RAIL_PANELS registry like every other panel,
// so nothing in the rail's render loop had to learn the word "Space".
//
// WHY THESE THREE EXIST AT ALL. Every /spaces route used to fall through to DEFAULT_PANELS
// (`pulse`, `activenow`, `newcircles`, `events`), not one of which knows which Space is on screen:
// a member inside Royal Temple got platform pulse, platform presence, OTHER communities' newest
// circles and platform-wide events. The rail beside a membership surface spent 100% of itself
// recruiting the member out of the membership.
//
// ONE READ FOR ALL THREE, and usually ZERO. Each panel awaits getSpaceContentData, which reads
// through the request-cached round in lib/spaces/content-data.ts keyed on (spaceId, slug). So
// three panels cost ONE round, and on a Space profile route that round has already been paid by
// the page body (components/spaces/space-landing.tsx) and by the anchor menu
// (buildSpaceProfileNav -> getSpaceSectionPresence), BOTH of which key it on the same
// (space.id, space.slug) pair this file passes. Hence no N+1 and no new waterfall: the rail joins
// a read the route was already making. Passing a DIFFERENT slug would mint a second cache entry,
// which is the one way to make this expensive, and it is why the slug always comes off the
// resolved Space row and never off the raw path.
//
// VISIBILITY. The Space is resolved by the rail through getVisibleSpaceBySlug (a private Space
// resolves only for its owner or an active member), and every reader used here is the same
// visitor-safe one the Space's own PUBLIC page renders from: listEventsForSpace filters to
// published + public/unlisted, getSpaceCommunity is the public Circles reader (ADR-1094) and is
// viewer-aware, getSpaceTeam is the roster the public Team block shows. So a non-member sees in
// this rail exactly what they can already see on the page beside it, and nothing more. A
// signed-out visitor never reaches here at all: app/(main)/layout.tsx serves them publicChrome(),
// which mounts no rail.
//
// HONEST EMPTY. Each panel returns null when its own slice is empty, and all three returning null
// is a legitimate outcome for a brand-new Space. The rail then shows its standing panels and says
// nothing about this Space, which is the honest reading; it never paints a heading over nothing.

/** Rows per panel. Three: the rail is a glance, and the footer link is the way through. */
const ROWS = 3

/** The one content read, shared by the three panels through React.cache (see the note above). The
 *  slug comes off the resolved row so the cache key matches the page's. */
function spaceContent(space: Space) {
  return getSpaceContentData(space.id, {
    name: space.brandName ?? space.name,
    type: space.type,
    slug: space.slug,
  })
}

/** What a member calls this Space: its brand name when it has one, else its name. */
function displayName(space: Space): string {
  return space.brandName ?? space.name
}

/** This Space's next gatherings. The demo filter is load-bearing rather than tidiness: the Calendar
 *  tab this panel's footer links to is gated on `spaceHasPublicUpcomingEvents`, which excludes demo
 *  rows, so without it a demo-only Space would offer a door onto a tab that does not exist. */
export async function SpaceEventsPanel({ space }: { space: Space }) {
  const data = await spaceContent(space)
  const events = (data.events ?? []).filter((e) => !e.isCancelled && !e.isDemo).slice(0, ROWS)
  if (events.length === 0) return null

  return (
    <WidgetCard title={`Upcoming at ${displayName(space)}`}>
      <div className="space-y-0.5">
        {events.map((event) => (
          <Link
            key={event.id}
            href={`/events/${event.slug}`}
            className="flex items-center gap-3 rounded-control px-1 py-2 transition-colors hover:bg-surface-elevated"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control bg-success-bg text-success">
              <CalendarDays className="h-4 w-4" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-body-sm font-semibold text-text">{event.title}</p>
              <p className="text-meta text-subtle">
                {/* formatEventWhen, never `new Date(iso)`: events.starts_at holds the host's WALL
                    CLOCK as UTC parts, so a local parse moves a 6:30 PM fire circle into the small
                    hours of the next day for every viewer west of UTC (LIVE-514 / LIVE-516). */}
                {formatEventWhen(event.startsAt, event.timeZone, { style: 'full', withZone: false })}
                {event.location ? ` · ${event.location}` : ''}
              </p>
            </div>
          </Link>
        ))}
      </div>
      <div className="px-1 pt-3">
        <Link
          href={`/spaces/${space.slug}/calendar`}
          className="text-body-sm font-semibold text-primary-strong transition-colors hover:text-primary-hover"
        >
          Full calendar →
        </Link>
      </div>
    </WidgetCard>
  )
}

/** This Space's Circles: the way in. "Circles", never "Community" — a Space's community IS its
 *  Circles, and no Space-level label is called Community (ADR-1091 / ADR-1013 §3, NAMING.md). */
export async function SpaceCirclesPanel({ space }: { space: Space }) {
  const data = await spaceContent(space)
  const circles = (data.community ?? []).slice(0, ROWS)
  if (circles.length === 0) return null
  // Safe by construction: the Circles tab is gated on the SAME rows (presence.circles is
  // `community.length > 0` in getSpaceSectionPresence), so a populated panel always has a tab.
  const allHref = data.communityHref

  return (
    <WidgetCard title={`Circles at ${displayName(space)}`}>
      <div className="space-y-0.5">
        {circles.map((circle) => (
          <Link
            key={circle.id}
            href={`/circles/${circle.slug}`}
            className="flex items-center gap-3 rounded-control px-1 py-2 transition-colors hover:bg-surface-elevated"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control bg-primary-bg text-primary-strong">
              <Users className="h-4 w-4" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-body-sm font-semibold text-text">{circle.name}</p>
              <p className="text-meta text-subtle">
                {circle.type === 'online' ? 'Online' : circle.neighborhood || 'In person'}
                {' · '}
                {circle.memberCount.toLocaleString()} member{circle.memberCount === 1 ? '' : 's'}
              </p>
            </div>
          </Link>
        ))}
      </div>
      {allHref && (
        <div className="px-1 pt-3">
          <Link
            href={allHref}
            className="text-body-sm font-semibold text-primary-strong transition-colors hover:text-primary-hover"
          >
            All circles →
          </Link>
        </div>
      )}
    </WidgetCard>
  )
}

/** Who runs this Space: the active operator roster (getSpaceTeam). No footer link, because the
 *  Team section exists on the profile only when the operator placed that block, so there is no
 *  door this panel can promise. A member with no handle has no profile page and is therefore not
 *  linked, rather than linked somewhere that 404s. */
export async function SpaceTeamPanel({ space }: { space: Space }) {
  const data = await spaceContent(space)
  const team = (data.team ?? []).slice(0, ROWS)
  if (team.length === 0) return null

  return (
    <WidgetCard title={`The people at ${displayName(space)}`}>
      <div className="space-y-0.5">
        {team.map((member) => {
          const row = (
            <>
              <Avatar src={member.avatarUrl} name={member.name} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-body-sm font-semibold text-text">{member.name}</p>
                {member.handle && <p className="truncate text-meta text-subtle">@{member.handle}</p>}
              </div>
            </>
          )
          return member.handle ? (
            <Link
              key={member.profileId}
              href={`/people/${member.handle}`}
              className="flex items-center gap-3 rounded-control px-1 py-2 transition-colors hover:bg-surface-elevated"
            >
              {row}
            </Link>
          ) : (
            <div key={member.profileId} className="flex items-center gap-3 rounded-control px-1 py-2">
              {row}
            </div>
          )
        })}
      </div>
    </WidgetCard>
  )
}
