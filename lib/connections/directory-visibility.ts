// The PURE predicate behind "may this member be listed to that viewer?" (ADR-186 controls,
// ADR-TBD). Framework-free and unit-testable, so the four member-facing privacy columns on
// `profiles` are decided in ONE place instead of re-derived (or, as happened, forgotten) at each
// surface that lists people.
//
// 🔴 WHY THIS EXISTS. The rule was enforced in exactly one reader, the `members_near` RPC
// (supabase/migrations/20260609060000_connection_layer_foundation.sql:122-128), which powers only
// the nearby BANDING on /network. The Community directory itself, and /search?tab=people, read
// `profiles` straight through the service-role client with `.eq('is_active', true)` and nothing
// else, so a member who switched "Show me in the Community directory" OFF, or turned Ghost mode
// ON ("You're invisible to discovery"), stayed fully listed and findable by name. The setting
// rendered as saved and did nothing. A rule that lives in one reader is a rule that is bypassed
// by the second one; this module is the shared reader the second path calls.
//
// ── THE SQL THIS MIRRORS, clause for clause ───────────────────────────────────────────────────
// `members_near` candidate CTE, 20260609060000_connection_layer_foundation.sql, as amended by
// 20270344000100_members_near_honours_target_radius_and_connections.sql:
//
//   :123  where p.directory_visible = true            → isListable / isSurfaceableNearby
//   :124    and p.ghost_mode = false                  → both
//   :125    and p.discoverable_by = 'community'       → nearby only, WIDENED by the amendment to
//                                                       'community' OR ('connections' AND an
//                                                       accepted friendship with the viewer)
//   :126    and p.location_band <> 'hidden'           → nearby only
//   :127    and p.home_geocell_lat is not null        → nearby only (no home → no proximity)
//   :128    and p.id <> <the viewer>                  → nearby only (the directory lists self)
//
// A directory listing is NOT a location surface, so the three location clauses (:125-:127) apply
// to the nearby band alone: "Who can find me nearby" and "Location precision others see" govern
// being surfaced BY LOCATION (that is their copy in components/settings/connection-prefs-form.tsx),
// while "Show me in the Community directory" and Ghost mode govern being listed at all. The SQL
// and this file must agree on every clause above; lib/connections/directory-visibility.test.ts
// pins the migration text against these branches so they cannot drift apart silently.

import type { DiscoverableBy, LocationBand } from './location'

/** The four privacy columns every member-listing read must SELECT before it can decide. Spelled
 *  once so a caller cannot select three of them and silently skip the fourth. */
export const DIRECTORY_VISIBILITY_COLUMNS =
  'directory_visible, ghost_mode, discoverable_by, location_band' as const

/** The subset of a `profiles` row the predicate reads. Columns arrive from the DB as their
 *  declared types; `null`/`undefined` are tolerated and resolve to the column DEFAULT (visible,
 *  not ghosting, community, city) so a row that predates the columns lists as it always has. */
export interface DirectoryTarget {
  id: string
  directory_visible?: boolean | null
  ghost_mode?: boolean | null
  discoverable_by?: DiscoverableBy | string | null
  location_band?: LocationBand | string | null
  /** The fuzzed home cell; null until the member sets a home. Only the nearby surface reads it. */
  home_geocell_lat?: number | string | null
}

/** Who is looking. `connectionIds` is the set of profile ids the viewer holds an ACCEPTED
 *  friendship with (friendships.status = 'accepted', either side). Pass `null` for a surface with
 *  no viewer identity in hand; the 'connections' tier then fails closed to "not surfaced". */
export interface DirectoryViewer {
  id: string
  connectionIds: ReadonlySet<string>
}

// ── The shared clauses (SQL :123-:124) ────────────────────────────────────────────────────────
function listedAtAll(target: DirectoryTarget): boolean {
  // :123 — "Show me in the Community directory". Column default true; only an explicit false hides.
  if (target.directory_visible === false) return false
  // :124 — Ghost mode. Column default false; the form dims every other control beneath it, so it
  // wins over all of them here too.
  if (target.ghost_mode === true) return false
  return true
}

/** May `target` appear in an alphabetical / name-search member listing (the /network directory,
 *  /search?tab=people)? Honours `directory_visible` and `ghost_mode` — the two controls whose copy
 *  promises exactly that. Location controls do not apply: nothing about a name listing reveals
 *  where anyone is. The viewer's own row is listed on the same terms as everyone else's, so a
 *  member who opts out sees themselves gone, which is the only honest confirmation the switch did
 *  something. */
export function isListableInDirectory(target: DirectoryTarget): boolean {
  return listedAtAll(target)
}

/** May `target` be surfaced to `viewer` BY LOCATION (a nearby band, a proximity ordering, a map)?
 *  The full `members_near` candidate rule (:123-:128 plus the 'connections' widening). This is the
 *  TypeScript twin of the SQL, kept so a TS-side proximity read can never be looser than the RPC. */
export function isSurfaceableNearby(target: DirectoryTarget, viewer: DirectoryViewer | null): boolean {
  if (!listedAtAll(target)) return false
  // :128 — never surface the viewer to themselves.
  if (viewer && target.id === viewer.id) return false
  // :126 — 'hidden' means "no location shown", which on a location surface means "not shown".
  if (target.location_band === 'hidden') return false
  // :127 — no home cell, no proximity to compute.
  if (target.home_geocell_lat == null) return false
  // :125 — the tier. 'community' = anyone; 'connections' = an accepted friendship with the
  // viewer, and ONLY that (before the amendment this tier was silently identical to 'nobody');
  // 'nobody' and any unknown value fail closed.
  const tier = target.discoverable_by ?? 'community'
  if (tier === 'community') return true
  if (tier === 'connections') return viewer != null && viewer.connectionIds.has(target.id)
  return false
}

/** Build the viewer's accepted-connection set from `friendships` rows touching them. The table is
 *  canonically ordered (user_a_id < user_b_id), so the viewer can sit on either side; the far end
 *  is the connection. Only 'accepted' rows count — a pending request is not a connection. */
export function acceptedConnectionIds(
  viewerId: string,
  rows: ReadonlyArray<{ user_a_id: string; user_b_id: string; status: string }>,
): Set<string> {
  const out = new Set<string>()
  for (const f of rows) {
    if (f.status !== 'accepted') continue
    if (f.user_a_id === viewerId) out.add(f.user_b_id)
    else if (f.user_b_id === viewerId) out.add(f.user_a_id)
  }
  return out
}
