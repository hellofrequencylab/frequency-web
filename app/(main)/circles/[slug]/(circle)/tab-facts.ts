import 'server-only'
import { cache } from 'react'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCircleActivePractice, type Practice } from '@/lib/practices'
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
  circleEventScopeFilter,
  circleEventVisibilities,
  selectUpcomingForCircle,
  type CircleEventRow,
  type CircleUpcomingEvent,
} from '@/lib/events/circle-upcoming'

// ── THE IO HALF OF THE TAB STRIP ────────────────────────────────────────────────────────────────
//
// Each tab on a Circle hides when it has nothing (lib/circles/tabs.ts holds that rule and every
// reason for it). This file answers the three questions the rule needs — has it got events, has it
// got a Journey running, has it got a practice — and it answers them ONCE.
//
// EVERY LOADER HERE IS `cache()`d, and that is the whole design. The shell asks each question to
// decide whether to render a tab; the tab BODY under it then asks the same question to render the
// content. The second ask is a request memo hit, so a Circle pays for the read once no matter how
// many surfaces need the answer. That is the loadCircleShell idiom (lib/circles/store.ts) applied
// to the strip, and it is why the tab pages below import from here instead of querying themselves.
//
// FAIL-SAFE THROUGHOUT. A read that throws returns the empty answer, which hides the tab rather
// than breaking the Circle page. A hidden tab is a small loss; a 500 on a community's front door
// is not.
//
// WHY IT LIVES BESIDE THE ROUTES rather than in lib/circles/: it is the shell's own composition
// layer, shared by the shell and its five tab bodies and by nothing else. lib/circles/tabs.ts stays
// pure and database-free so the rules stay unit-testable, which is the split ADR-841/843 asks for.

/** How many events the Events tab lists before it points at the full index. */
export const CIRCLE_EVENTS_TAB_LIMIT = 30

/**
 * "Insider" for event visibility: someone on this Circle's roster also sees its members-only
 * (`circle_only`) events.
 *
 * IT TAKES ROSTER FACTS, NOT CAPABILITIES, AND THAT IS THE POINT. This value is the memo key for
 * the events read, and the shell and the Events tab MUST derive the same one or the strip and the
 * body disagree about what is listed (and the Circle pays for the query twice). Membership and
 * host-ship are both known from the shell's own roster load, before any capability resolution, so
 * both callers can compute it at the same moment. The one viewer this rounds down is a steward who
 * manages a Circle they never joined: they see the tab only once it has a public event on it.
 */
export function circleEventInsider(facts: { isMember: boolean; isHost: boolean }): boolean {
  return facts.isMember || facts.isHost
}

/**
 * This Circle's upcoming events, with a repeating series folded to its next date (ADR-897).
 *
 * Selection rules (which events belong to a Circle, who may see them listed) stay in the pure,
 * unit-tested lib/events/circle-upcoming.ts; this only does the read. The query over-fetches on
 * purpose: a daily series would otherwise fill every row and hide a one-off six weeks out.
 */
export const loadCircleUpcomingEvents = cache(
  async (
    circleId: string,
    insider: boolean,
  ): Promise<{ events: CircleUpcomingEvent[]; hasMore: boolean }> => {
    const filter = circleEventScopeFilter(circleId)
    if (!filter) return { events: [], hasMore: false }

    // ONE clock for the read, the fold and the selection rules. `seriesUpcomingFloor` is midnight
    // TODAY in the community's zone: events.starts_at stores the host's wall clock kept as UTC
    // parts, so a raw `new Date()` cutoff is already tomorrow by 5pm Pacific and would drop
    // tonight's gathering.
    const floor = seriesUpcomingFloor(dayInZone(new Date(), HOME_TZ))
    const fetchLimit = seriesFetchLimit(CIRCLE_EVENTS_TAB_LIMIT)

    try {
      const admin = createAdminClient()
      const { data } = await admin
        .from('events')
        .select(
          `id, title, slug, location, starts_at, scope_id, scope_type, scope_circle_id, ${SERIES_COLUMNS}`,
        )
        // Belongs to THIS Circle: created for it (scope_id) or placed on it (scope_circle_id).
        // Both are equality matches on this circle's own uuid, so the shared sentinel scope_id
        // that standalone public events carry can never match. The scope_type half of the rule is
        // applied by selectUpcomingForCircle below.
        .or(filter)
        .eq('status', 'published')
        .eq('is_cancelled', false)
        .is('removed_at', null)
        .in('visibility', circleEventVisibilities(insider))
        .gte('starts_at', floor)
        .order('starts_at', { ascending: true })
        .limit(fetchLimit)

      const rows = (data ?? []) as unknown as (CircleEventRow & SeriesFields)[]
      const collapsed = collapseSeriesRows(rows, {
        upcomingFrom: floor,
        perSeries: TEASER_CARDS_PER_SERIES,
      })
      const { events, hasMore } = selectUpcomingForCircle(
        collapsed,
        circleId,
        new Date(floor),
        CIRCLE_EVENTS_TAB_LIMIT,
      )
      // Two ways there is more to see: more series than the cap, or a read that came back full.
      return { events, hasMore: hasMore || rows.length >= fetchLimit }
    } catch {
      return { events: [], hasMore: false }
    }
  },
)

/** The Journey this Circle is moving through together, if any. */
export interface CircleRun {
  id: string
  startedAt: string
  plan: { id: string; title: string; slug: string; emoji: string | null; summary: string | null }
}

/**
 * The Circle's ACTIVE Run and the Journey behind it (ADR-252), newest first. At most one is
 * surfaced: a Circle goes through one Journey at a time, and the strip has one Journey tab.
 *
 * Two reads, not a join, mirroring listSpaceCirclesWithRuns (lib/circles/store.ts).
 */
export const loadCircleActiveRun = cache(async (circleId: string): Promise<CircleRun | null> => {
  if (!circleId) return null
  try {
    const admin = createAdminClient()
    const { data: runs } = await admin
      .from('journey_runs')
      .select('id, plan_id, started_at')
      .eq('circle_id', circleId)
      .eq('status', 'active')
      .order('started_at', { ascending: false })
      .limit(1)

    const run = (runs ?? [])[0] as { id: string; plan_id: string; started_at: string } | undefined
    if (!run) return null

    const { data: plan } = await admin
      .from('journey_plans')
      .select('id, title, slug, emoji, summary')
      .eq('id', run.plan_id)
      .maybeSingle()
    if (!plan) return null

    const p = plan as { id: string; title: string; slug: string; emoji: string | null; summary: string | null }
    return {
      id: String(run.id),
      startedAt: String(run.started_at),
      plan: {
        id: String(p.id),
        title: p.title,
        slug: p.slug,
        emoji: p.emoji ?? null,
        summary: p.summary ?? null,
      },
    }
  } catch {
    return null
  }
})

/** The host-assigned practice for this Circle, memoized across the shell and the Practice tab. */
export const loadCirclePractice = cache(async (circleId: string): Promise<Practice | null> => {
  if (!circleId) return null
  try {
    return await getCircleActivePractice(circleId)
  } catch {
    return null
  }
})

/** Everything the strip needs to know about what this Circle actually has. */
export interface CircleContentFacts {
  upcomingEventCount: number
  hasActiveJourney: boolean
  hasAssignedPractice: boolean
}

/**
 * The three content questions, asked in parallel. One `await` in the shell, three round trips that
 * overlap rather than queue, and every one of them memoized for the tab body that needs it next.
 */
export async function loadCircleContentFacts(
  circleId: string,
  insider: boolean,
): Promise<CircleContentFacts> {
  const [events, run, practice] = await Promise.all([
    loadCircleUpcomingEvents(circleId, insider),
    loadCircleActiveRun(circleId),
    loadCirclePractice(circleId),
  ])
  return {
    upcomingEventCount: events.events.length,
    hasActiveJourney: !!run,
    hasAssignedPractice: !!practice,
  }
}
