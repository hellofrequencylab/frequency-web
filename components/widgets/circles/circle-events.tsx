import { Suspense } from 'react'
import Link from 'next/link'
import { ModuleCard } from '@/components/modules/module-card'
import {
  UpcomingEventRows,
  UpcomingEventRowsSkeleton,
} from '@/components/events/upcoming-event-rows'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCircleContext } from '@/lib/circles/active-circle'
import { HOME_TZ, dayInZone } from '@/lib/time/zone'
import {
  SERIES_COLUMNS,
  TEASER_CARDS_PER_SERIES,
  collapseSeriesRows,
  seriesFetchLimit,
  seriesUpcomingFloor,
  type SeriesFields,
} from '@/lib/events/series'
import {
  CIRCLE_UPCOMING_LIMIT,
  circleEventScopeFilter,
  circleEventVisibilities,
  selectUpcomingForCircle,
  type CircleEventRow,
} from '@/lib/events/circle-upcoming'

// The Circle page's "Upcoming events" block (the `circle-events` layout module), and the lead box
// of the circle's side rail: what is on next, and the way in to it.
//
// THE WHOLE CARD, TITLE INCLUDED, LIVES BEHIND THE <Suspense>, so the block can render NOTHING when
// there is nothing booked. A rail module that draws an empty "none yet" box teaches the eye that the
// column is skippable, and takes the boxes that do have something down with it. Streaming is
// unaffected: the fallback is the same card wearing a dimension-matched skeleton, so a slow events
// query still never holds up the circle page or its sibling modules (PAGE-FRAMEWORK §5.2/§5.3).
//
// A host with an empty calendar loses nothing: "New event" is already in the Circle's Create menu
// (components/circles/circle-host-menu.tsx) and in the admin rail's quick-link bank.
//
// Selection rules (which events count, who may see them) are pure + unit-tested in
// lib/events/circle-upcoming.ts.

export const CircleEvents = async () => {
  const ctx = getCircleContext()
  if (!ctx) return null
  const { circle, isMember, canManage } = ctx

  return (
    <Suspense
      fallback={
        <ModuleCard title="Upcoming events">
          <UpcomingEventRowsSkeleton />
        </ModuleCard>
      }
    >
      <CircleUpcomingEvents circleId={circle.id} insider={isMember || canManage} />
    </Suspense>
  )
}

async function CircleUpcomingEvents({
  circleId,
  insider,
}: {
  circleId: string
  /** A member, Host, or steward of this Circle also sees its members-only events. */
  insider: boolean
}) {
  // ONE clock for the read, the fold and the selection rules. `seriesUpcomingFloor` is midnight
  // TODAY in the community's zone: events.starts_at stores the host's wall clock kept as UTC parts,
  // so a raw `new Date()` cutoff is already tomorrow by 5pm Pacific and drops tonight's gathering.
  const floor = seriesUpcomingFloor(dayInZone(new Date(), HOME_TZ))
  const filter = circleEventScopeFilter(circleId)
  // A daily series used to occupy all six fetched rows: the block showed five identical cards and
  // "See all events" was permanently lit. Folding without raising the LIMIT is worse (six rows
  // collapse to ONE card), so the read over-fetches first.
  const fetchLimit = seriesFetchLimit(CIRCLE_UPCOMING_LIMIT)

  let rows: (CircleEventRow & SeriesFields)[] = []
  if (filter) {
    const admin = createAdminClient()
    const { data } = await admin
      .from('events')
      .select(
        `id, title, slug, location, starts_at, scope_id, scope_type, scope_circle_id, ${SERIES_COLUMNS}`,
      )
      // Belongs to THIS Circle: created for it (scope_id) or placed on it (scope_circle_id).
      // Both are equality matches on this circle's own uuid, so the shared sentinel scope_id
      // that standalone public events carry can never match. The scope_type half of the rule
      // is applied by selectUpcomingForCircle below.
      .or(filter)
      .eq('status', 'published')
      .eq('is_cancelled', false)
      .is('removed_at', null)
      .in('visibility', circleEventVisibilities(insider))
      .gte('starts_at', floor)
      .order('starts_at', { ascending: true })
      .limit(fetchLimit)
    rows = (data ?? []) as unknown as (CircleEventRow & SeriesFields)[]
  }

  // A repeating event is ONE line in this block, showing its next date (ADR-897). The fold runs
  // before the selection rules: it is an order-preserving filter, so the ownership rule, the sort
  // and the cap below all see a list that already counts series rather than dates.
  const collapsed = collapseSeriesRows(rows, {
    upcomingFrom: floor,
    perSeries: TEASER_CARDS_PER_SERIES,
  })

  // Re-applies the ownership rule in JS: a row only lists if it really is this Circle's.
  // `floor` is handed in as the cutoff so the query, the fold and this filter share one clock.
  const { events, hasMore: moreSeries } = selectUpcomingForCircle(collapsed, circleId, new Date(floor))
  // Two ways there is more to see, and a block must never hide its own escape hatch: more SERIES
  // than the cap, or a read that came back full. Fifty rows of a daily series hide a sibling one-off
  // fifty-five days out, and the row count is the only signal that happened.
  const hasMore = moreSeries || rows.length >= fetchLimit

  // A Circle with nothing booked is the normal resting state, not a failure. It is also not worth a
  // box: the block renders nothing at all rather than an empty card in the rail.
  if (events.length === 0) return null

  return (
    <ModuleCard title="Upcoming events">
      <UpcomingEventRows events={events} />
      {hasMore && (
        <div className="mt-2 px-1">
          <Link href="/events" className="text-meta font-medium text-primary-strong hover:underline">
            See all events →
          </Link>
        </div>
      )}
    </ModuleCard>
  )
}
