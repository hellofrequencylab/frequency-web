// Selection rules for a Circle's "Upcoming events" block (components/widgets/circles/circle-events.tsx).
//
// Pure on purpose: WHICH events belong to a Circle, WHO may see them listed, and WHAT the block
// shows are all decidable without a database, so they are unit-tested (circle-upcoming.test.ts)
// instead of only being exercised against live rows. The module below owns the read; this file
// owns the rules.
//
// Three ways an event belongs to a Circle, all supported here:
//   1. CREATION scope — `events.scope_type` in ('circle','group') AND `events.scope_id` = circle id
//      (what /events/new?circle=<id> writes; 'group' is the pre-rename value still in the data).
//   2. PLACEMENT — `events.scope_circle_id` = circle id (an approved placement request,
//      lib/events/placement.ts). A placed event lives on that Circle's page too.
//   3. THE SPACE'S OWN CALENDAR — `events.space_id` = the Space's id, and ONLY for that Space's
//      SPACE CIRCLE (ADR-1393). See the block below; this arm is off for every other Circle.
//
// ── WHY ARM 3 EXISTS (measured in production, 2026-09-17) ────────────────────────────────────────
//
// A Space Circle is a Space's communications hub (ADR-1391), and arms 1 and 2 gave it NOTHING: an
// event booked on the Space's calendar carries `space_id`, not a circle scope. Royal Temple's Space
// Circle matched 0 events while Royal Temple the Space ran 12. Its What's On tab did not render at
// all, and the rail's "Upcoming events" box hid itself, so the Space's own hub said "Nothing
// scheduled yet" beside a Space with a full calendar. The same gap sat on House of Fates (4 events),
// Breathe & Shine (2), Danny Kenduck (2), Bahja Tours (1) and Victoria Angel Heart (1).
//
// 🔴 THE ROOT SPACE MUST NEVER REACH THIS ARM, and it is the reason the space id is a separate,
// explicitly-passed argument rather than something derived in here. EVERY personal Circle on the
// platform is stamped to the root tenant by `stampCircleSpaceId`, and root carries 33 events. A
// `spaceId` that fell through as root would publish the whole platform's calendar onto every
// personal Circle — the exact class of bug LIVE-075 closed across ten event call sites and LIVE-083
// closed on the Space profile. `spaceCircleEventScope` below is the ONE derivation, it refuses root
// and it refuses a Circle that is not its Space's Space Circle, and `belongsToCircle` re-checks the
// id in JS after the read so an over-broad query still could not leak.
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
  /** The owning Space (ADR-857). Read only by arm 3, for a Space Circle. */
  space_id?: string | null
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
export function circleEventScopeFilter(circleId: string, spaceId?: string | null): string | null {
  if (!UUID.test(circleId)) return null
  const arms = [`scope_id.eq.${circleId}`, `scope_circle_id.eq.${circleId}`]
  // Arm 3. Guarded by the same sanitizer, because this value is interpolated into a filter
  // expression too. A caller that hands over a non-uuid gets the two-arm filter rather than a
  // broken query or a thrown request.
  if (spaceId && UUID.test(spaceId)) arms.push(`space_id.eq.${spaceId}`)
  return arms.join(',')
}

/** A Circle whose Space's calendar also belongs to it, or `null` for every other Circle.
 *
 *  THE ONE DERIVATION of arm 3's space id, and the only place the three conditions are stated:
 *  the Circle is its Space's Space Circle (`is_space_primary`, ADR-1391), it has a Space, and that
 *  Space is not the root tenant. Fails CLOSED — an unknown shape, a missing flag or a root Space
 *  all return null, which drops the page back to arms 1 and 2 (today's behaviour) rather than
 *  widening it. See the 🔴 block in the file header for why root is the case that matters. */
export function spaceCircleEventScope(circle: {
  is_space_primary?: boolean | null
  space_id?: string | null
  space?: { type?: string | null } | null
}): string | null {
  if (circle.is_space_primary !== true) return null
  const spaceId = circle.space_id ?? null
  if (!spaceId || !UUID.test(spaceId)) return null
  if (circle.space?.type === 'root') return null
  return spaceId
}

/** True when the row is tied to this Circle by creation scope, by an approved placement, or (for a
 *  Space Circle only, and only when `spaceId` is passed) by the owning Space's own calendar. */
export function belongsToCircle(
  row: CircleEventRow,
  circleId: string,
  spaceId?: string | null,
): boolean {
  if (row.scope_circle_id === circleId) return true
  // Arm 3, re-checked in JS after the read. `spaceId` is only ever non-null for a Space Circle
  // (see spaceCircleEventScope), so this branch is unreachable on every other Circle.
  if (spaceId && row.space_id === spaceId) return true
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
  spaceId?: string | null,
): { events: CircleUpcomingEvent[]; hasMore: boolean } {
  const cutoff = now.getTime()
  const seen = new Set<string>()
  // Sort on the parsed instant, never on the raw string: Postgres can hand back either
  // `…Z` or `…+00:00`, and a lexicographic compare would order those two spellings wrongly.
  const eligible: { at: number; event: CircleUpcomingEvent }[] = []

  for (const row of rows) {
    if (seen.has(row.id)) continue
    if (!belongsToCircle(row, circleId, spaceId)) continue
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
