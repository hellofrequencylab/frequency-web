import { eventDayKey } from '@/lib/events/calendar-grid'
import type { CalendarSurface } from './admin-views'
import type { CalendarEvent } from './item'
import type { CalendarLayerKey } from './registry'

// ─────────────────────────────────────────────────────────────────────────────
// THE MEMBER HALF OF THE SPACE CALENDAR (LIVE-520).
//
// Calendar and Events used to be TWO menu items over one subject: a dedicated Calendar tab
// (/spaces/<slug>/calendar) beside the Home page's `#events` section anchor. The owner's ask was
// "Calendar & Events should be all one page ... full calendar functions with different views and
// sorting. Upcoming events should be featured in a feed." This module is the pure half of that
// page: what a MEMBER or a signed-out visitor is offered, with no operator console in it.
//
// Three things live here, and they are pure on purpose — every one of them was previously either
// missing or buried inside a client component behind an `adminAllowed` branch, where nothing could
// test it:
//
//   · MEMBER_SURFACES   — the ways of looking a member may actually reach.
//   · upcomingFeedRows  — the "Up next" band: what is next, soonest first.
//   · memberLayerChoices — the filter a member can reach, and only when it filters something.
//
// 🔴 THERE IS NO GATE IN THIS FILE, AND THERE MUST NEVER BE ONE. Every row it is handed has
// already been through `listSpaceCalendarEvents` (tenancy + hosting + accepted shares, each
// re-gated on the event's own columns, then re-gated on its HOME space) and, on the grid path,
// `guestLiveItems`. The feed composes the SAME reader the month grid composes
// (lib/calendar/public-month.ts), so the band above the grid and the grid below it can never
// disagree about what a visitor may see. A second gate here would be a second answer.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The surfaces a member or a signed-out visitor is offered on the merged page: the month GRID and
 * the agenda LIST of the month it is showing. Both are real ways of reading the same set, and
 * `viewForSurface(surface, scope, 'guest')` already maps both onto the Guest panel — the control
 * to pick between them was simply never drawn for anyone but an operator.
 *
 * 🔴 WORKFLOW IS DELIBERATELY NOT HERE, and that is a decision rather than an omission. The
 * Workflow board is `workflowBoard(plans, adminEvents)` over `PLAN_STAGE_TRANSITIONS`: every card
 * on it is a `space_plans` row — the team's internal working record (notes, links, to-dos, people)
 * — and a visitor is never handed `plans` or `adminEvents` at all. Offering it to them would draw
 * a control over an empty set at best, and would invite a leak the day someone "fixed" the empty
 * board by feeding it. The List surface's `all` SCOPE is out for the same reason: the all-time
 * index panel is the event control console (stage pill, share links, stats), not a way of reading a
 * month. Guest preview is out because it is an audience, and a guest is already that audience.
 */
export const MEMBER_SURFACES: readonly CalendarSurface[] = ['grid', 'list'] as const

/** One row of the Up next band. The shape `components/events/upcoming-event-rows.tsx` renders, so
 *  the Space calendar's feed reads identically to the Channel strip and the Circle module instead
 *  of being a fourth hand-rolled event row. */
export interface UpcomingFeedRow {
  id: string
  title: string
  slug: string
  location: string | null
  starts_at: string
}

/** What the selector needs off a calendar row. Structural, so a `SpaceCalendarEvent` from the store
 *  satisfies it without this module importing the store (and therefore staying pure). */
export interface UpcomingFeedSource {
  id: string
  slug: string
  title: string
  starts_at: string
  location?: string | null
  is_cancelled?: boolean | null
}

/** How many gatherings the band features. Five is the owner's live set on Royal Temple today, and
 *  a band that runs longer than the month grid beside it stops being a band. */
export const UPCOMING_FEED_MAX = 5

/**
 * The Up next band: the soonest live gatherings on or after `fromDay`, in order, capped.
 *
 * `fromDay` is a YYYY-MM-DD in the SPACE's own zone, never the machine's and never UTC's. That is
 * the whole reason it is an argument: `starts_at` holds the event's wall clock as UTC parts
 * (lib/time/zone.ts), so comparing it against a UTC day drops tonight's 7 PM gathering from 5 PM
 * Pacific onward — the class of defect LIVE-514 and LIVE-516 are both instances of.
 *
 * A CANCELLED gathering never leads the band. On the grid a called-off date is muted footer text on
 * its own square (LIVE-414) and that is the honest place for it; at the top of a page under the
 * words "Up next" it would read as an invitation. The rows the reader is handed have usually been
 * filtered already (`listSpaceCalendarEvents` drops cancelled unless `paintCancelled`), so this is
 * the arm that holds when a caller passes the painting set.
 */
export function upcomingFeedRows(
  rows: readonly UpcomingFeedSource[],
  fromDay: string,
  limit: number = UPCOMING_FEED_MAX,
): UpcomingFeedRow[] {
  if (limit <= 0) return []
  const seen = new Set<string>()
  const kept: { row: UpcomingFeedRow; at: string }[] = []
  for (const row of rows) {
    if (!row || row.is_cancelled === true) continue
    if (typeof row.id !== 'string' || !row.id || seen.has(row.id)) continue
    const dayKey = eventDayKey(row.starts_at)
    if (!dayKey || dayKey < fromDay) continue
    seen.add(row.id)
    kept.push({
      row: {
        id: row.id,
        title: row.title,
        slug: row.slug,
        location: row.location ?? null,
        starts_at: row.starts_at,
      },
      at: row.starts_at,
    })
  }
  // The store's merge already sorts ascending; this re-asserts it so the selector is total on any
  // input order (a caller that concatenates two windows, a test that stages them shuffled).
  kept.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0))
  return kept.slice(0, limit).map((k) => k.row)
}

/**
 * The layer filter a member can reach — and it is offered ONLY when it would filter something.
 *
 * A public Space window carries at most two layers: `events` (the gatherings) and `unavailable`
 * (the times the Space has published as closed, as times and nothing else —
 * `public.space_public_unavailable`). A Space that publishes no Unavailable time has ONE layer, and
 * a one-option filter is a control that cannot change what you see: the honest-empty rule applied
 * to chrome rather than to content. So this returns `[]` below two layers, and the caller draws no
 * chips at all rather than a dead group.
 *
 * Order follows `CALENDAR_LAYERS` (events first) rather than the order items happened to arrive in,
 * so the chips do not reshuffle as the reader pages months.
 */
const MEMBER_LAYER_ORDER: readonly CalendarLayerKey[] = ['events', 'unavailable'] as const

export function memberLayerChoices(items: readonly Pick<CalendarEvent, 'layer'>[]): CalendarLayerKey[] {
  const present = new Set<CalendarLayerKey>()
  for (const item of items) present.add(item.layer ?? 'events')
  const choices = MEMBER_LAYER_ORDER.filter((key) => present.has(key))
  return choices.length > 1 ? choices : []
}
