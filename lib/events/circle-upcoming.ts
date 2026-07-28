// Selection rules for a Circle's "Upcoming events" block (components/widgets/circles/circle-events.tsx).
//
// Pure on purpose: WHICH events belong to a Circle, WHO may see them listed, and WHAT the block
// shows are all decidable without a database, so they are unit-tested (circle-upcoming.test.ts)
// instead of only being exercised against live rows. The module below owns the read; this file
// owns the rules.
//
// Two ways an event belongs to a Circle, both supported here:
//   1. CREATION scope — `events.scope_type` in ('circle','group') AND `events.scope_id` = circle id
//      (what /events/new?circle=<id> writes; 'group' is the pre-rename value still in the data).
//   2. PLACEMENT — `events.scope_circle_id` = circle id (an approved placement request,
//      lib/events/placement.ts). A placed event lives on that Circle's page too.
//
// SAFETY: every match is an equality against THIS circle's id. There is no wildcard and no
// fallback, so the shared sentinel scope_id that standalone `public` events carry can never
// match a Circle (different uuid AND scope_type 'public'). `belongsToCircle` re-checks the
// same rule in JS after the read, so an over-broad query could not leak the sentinel either.

/** Rows the Circle block lists before it points at the full Events index. */
export const CIRCLE_UPCOMING_LIMIT = 5

/** `events.scope_type` values that mean "this event was created for a Circle". 'group' is the
 *  pre-rename value still present in older rows. */
export const CIRCLE_SCOPE_TYPES = ['circle', 'group'] as const

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** The event columns the block reads and reasons about. */
export interface CircleEventRow {
  id: string
  title: string
  slug: string
  location: string | null
  starts_at: string | null
  scope_id: string | null
  scope_type: string | null
  scope_circle_id: string | null
}

/** A row ready to render (a real title, slug, and start time). */
export interface CircleUpcomingEvent {
  id: string
  title: string
  slug: string
  location: string | null
  starts_at: string
}

/**
 * Which `events.visibility` values may be LISTED on a Circle page.
 *   • Anyone: `public` only (the same rule the Events index applies to browse).
 *   • A member, Host, or steward of this Circle: also `circle_only`.
 * `unlisted` (anyone with the link) and `private` (invite only) are never listed, for anyone.
 */
export function circleEventVisibilities(insider: boolean): string[] {
  return insider ? ['public', 'circle_only'] : ['public']
}

/**
 * The PostgREST `.or()` filter for "belongs to this Circle": the creation scope id OR the
 * placement column, both plain equality on THIS circle's uuid (the simplest `.or()` form, the
 * one already used across lib/). The scope_type half of rule 1 is enforced in JS by
 * `belongsToCircle` rather than nested inside the filter expression, so the query string stays
 * a shape the repo already proves in production.
 *
 * Returns null when the id is not a uuid: the value is interpolated into a filter expression,
 * so this is the sanitizer too.
 */
export function circleEventScopeFilter(circleId: string): string | null {
  if (!UUID.test(circleId)) return null
  return `scope_id.eq.${circleId},scope_circle_id.eq.${circleId}`
}

/** True when the row is tied to this Circle by creation scope or by an approved placement. */
export function belongsToCircle(row: CircleEventRow, circleId: string): boolean {
  if (row.scope_circle_id === circleId) return true
  return (
    row.scope_id === circleId &&
    (CIRCLE_SCOPE_TYPES as readonly string[]).includes(row.scope_type ?? '')
  )
}

/**
 * The block's list: only events that belong to this Circle, only ones still to come, soonest
 * first, deduped by id, capped. `hasMore` is true when the Circle has more upcoming events than
 * the cap, so the block can point at the full list honestly.
 */
export function selectUpcomingForCircle(
  rows: CircleEventRow[],
  circleId: string,
  now: Date,
  limit: number = CIRCLE_UPCOMING_LIMIT,
): { events: CircleUpcomingEvent[]; hasMore: boolean } {
  const cutoff = now.getTime()
  const seen = new Set<string>()
  // Sort on the parsed instant, never on the raw string: Postgres can hand back either
  // `…Z` or `…+00:00`, and a lexicographic compare would order those two spellings wrongly.
  const eligible: { at: number; event: CircleUpcomingEvent }[] = []

  for (const row of rows) {
    if (seen.has(row.id)) continue
    if (!belongsToCircle(row, circleId)) continue
    if (!row.starts_at) continue
    const at = new Date(row.starts_at).getTime()
    if (!Number.isFinite(at) || at < cutoff) continue
    seen.add(row.id)
    eligible.push({
      at,
      event: {
        id: row.id,
        title: row.title,
        slug: row.slug,
        location: row.location,
        starts_at: row.starts_at,
      },
    })
  }

  eligible.sort((a, b) => a.at - b.at)
  return { events: eligible.slice(0, limit).map((e) => e.event), hasMore: eligible.length > limit }
}
