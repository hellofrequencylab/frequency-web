// Spaces DIRECTORY discovery reads (ENTITY-SPACES-BUILD §A/§B, Phase 1 / Epic 1.8). The one
// query the in-app directory at /spaces calls to list the NETWORKED entity Spaces a member can
// browse: practitioners, businesses, organizations, coaching academies, event spaces.
//
// The discovery boundary is `spaces.visibility = 'network'` (ENTITY-SPACES-SYSTEM §1.3): only
// networked Spaces appear; Private/White-Label ones are walled off. The seeded ROOT space (the
// Frequency app itself) is excluded — it is the platform, not a listed entity. `visibility` is not
// in the generated DB types yet, so it is reached through an untyped client (ADR-246, the codebase
// pattern for not-yet-typed columns — see lib/spaces/membership.ts, lib/page-settings/store.ts).
//
// FAIL-SAFE by construction: any error (or a pre-migration column) yields `[]`, so the directory
// degrades to an empty state rather than throwing. REQUEST-CACHED (React.cache) keyed on the
// filter args, so the page renders it at most once per request.

import { cache } from 'react'
import { createAdminClient } from '@/lib/supabase/admin'
import { listFollowedSpaceIds } from './follows'
import type { SpaceType } from './types'

/** One networked Space as the directory consumes it — the brand anchor, the type, and a couple of
 *  cheap stats. Camel-cased; only the fields a directory card needs. */
export interface NetworkedSpace {
  id: string
  slug: string
  /** Display brand name when set, else the plain Space name (resolved here so cards stay dumb). */
  name: string
  type: SpaceType
  /** One-line positioning. Null when the Space hasn't set one. */
  tagline: string | null
  /** Operator-supplied logo URL, or null. Rendered via a plain <img> (an arbitrary URL). */
  logoUrl: string | null
  /** Count of ACTIVE members of this Space (space_members), or null when omitted/unavailable. */
  memberCount: number | null
}

/** How the catalog is ordered. `name` (A–Z) is the default; `newest` is most-recently created
 *  first; `members` is most members first. An unknown/absent value falls back to `name`. */
export type SpaceSort = 'name' | 'newest' | 'members'

/** The filters the directory passes in. All optional; absent = unfiltered. */
export interface DiscoveryFilters {
  /** Narrow to one entity type (practitioner / business / organization / coaching / event_space). */
  type?: string
  /** Free-text query over name / brand name / slug (case-insensitive substring). */
  q?: string
  /** When set with `onlyFollowed`, the viewer whose follows the directory intersects against (the
   *  "Following" filter). */
  followerProfileId?: string | null
  /** Narrow the result to the Spaces `followerProfileId` follows (the "Following" pill). Ignored
   *  when no `followerProfileId` is given (a signed-out viewer follows nothing). */
  onlyFollowed?: boolean
  /** Catalog ordering: name (A–Z, default) / newest (created_at desc) / members (member count desc). */
  sort?: SpaceSort
}

/** Coerce an arbitrary `?sort=` value to a known SpaceSort, defaulting to 'name'. Kept here so the
 *  page + the query share one definition of the valid set (no drift). PURE. */
export function normalizeSpaceSort(value: string | null | undefined): SpaceSort {
  return value === 'newest' || value === 'members' ? value : 'name'
}

// The columns the directory projects. `visibility` is selected too (it's the discovery filter) but
// is reached through the untyped client below, so it never hits the typed-row overload. `created_at`
// backs the "Newest" sort.
const COLS = 'id, slug, name, type, status, brand_name, brand_logo_url, tagline, created_at'

// `spaces.visibility` / `spaces.brand_*` aren't fully in the generated DB types, so reach the table
// through an untyped `from` accessor (ADR-246) and type the builder loosely here — the same shape
// lib/spaces/membership.ts uses for the not-yet-typed space_members table.
type SpaceDiscoveryRow = {
  id: string
  slug: string
  name: string
  type: string
  status: string
  brand_name: string | null
  brand_logo_url: string | null
  tagline: string | null
  created_at: string | null
}

type SpacesQuery = {
  select: (cols: string) => SpacesQuery
  eq: (col: string, val: string) => SpacesQuery
  neq: (col: string, val: string) => SpacesQuery
  or: (filter: string) => SpacesQuery
  order: (col: string, opts: { ascending: boolean }) => SpacesQuery
  limit: (n: number) => SpacesQuery
  then: (
    resolve: (r: { data: SpaceDiscoveryRow[] | null; error: unknown }) => unknown,
  ) => Promise<unknown>
}

type MemberCountRow = { space_id: string }

type MembersCountQuery = {
  select: (cols: string) => MembersCountQuery
  eq: (col: string, val: string) => MembersCountQuery
  in: (col: string, vals: string[]) => MembersCountQuery
  then: (
    resolve: (r: { data: MemberCountRow[] | null; error: unknown }) => unknown,
  ) => Promise<unknown>
}

/** The untyped admin-client `spaces` builder (visibility/brand_* aren't in the generated types). */
function spacesTable(): SpacesQuery {
  const db = createAdminClient() as unknown as { from: (table: string) => SpacesQuery }
  return db.from('spaces')
}

/** The untyped `space_members` builder (the table isn't in the generated types yet, ADR-246). */
function membersTable(): MembersCountQuery {
  const db = createAdminClient() as unknown as { from: (table: string) => MembersCountQuery }
  return db.from('space_members')
}

// A defensive ceiling so the query can never scan an unbounded table; filtering rides over this set.
// A generous headroom for any realistic count of networked Spaces in the directory.
const DISCOVERY_FETCH_LIMIT = 200

/** PostgREST `.or()` escaping: a value placed inside `ilike.*…*` must not carry the syntax
 *  characters that delimit the filter list (`,` `(` `)`) or the wildcard (`*`/`%`). Strip them so a
 *  crafted query can't break out of the OR group; the remaining substring still matches sensibly. */
function sanitizeQuery(q: string): string {
  return q.trim().replace(/[,()*%]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80)
}

/** Count ACTIVE members per Space across a set of ids — one grouped read, fail-safe to an empty
 *  map (so a missing space_members table or any error just omits counts). Cheap: a single query
 *  over the leading-column space_id index, counted in app code over the matched ids only. */
async function memberCountsFor(spaceIds: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>()
  if (spaceIds.length === 0) return counts
  try {
    const result = (await membersTable()
      .select('space_id')
      .eq('status', 'active')
      .in('space_id', spaceIds)) as { data: MemberCountRow[] | null; error: unknown }
    if (result.error || !result.data) return counts
    for (const row of result.data) {
      counts.set(row.space_id, (counts.get(row.space_id) ?? 0) + 1)
    }
    return counts
  } catch {
    return counts
  }
}

/**
 * List the NETWORKED entity Spaces for the in-app directory. Returns Spaces where
 * `visibility = 'network'` and `status = 'active'`, excluding the root space, optionally narrowed by
 * `type` and a free-text `q` over name/brand/slug. Each row carries its brand anchor, type, tagline,
 * and a cheap active-member count. Ordered by `sort`: name (A–Z, default) / newest (created_at desc)
 * in the DB; members (member count desc) after the grouped count read (counts arrive separately, so
 * that ordering is applied in app code). FAIL-SAFE: `[]` on any error. REQUEST-CACHED.
 */
export const listNetworkedSpaces = cache(
  async ({ type, q, followerProfileId, onlyFollowed, sort }: DiscoveryFilters = {}): Promise<NetworkedSpace[]> => {
    try {
      // The "Following" filter: resolve the viewer's followed Space ids up front. A signed-out viewer
      // (no profile) follows nothing, so the filtered directory is correctly empty. Fail-safe to an
      // empty set, so any error just yields no matches rather than throwing.
      const followedIds = onlyFollowed ? await listFollowedSpaceIds(followerProfileId ?? null) : null
      if (onlyFollowed && (!followedIds || followedIds.size === 0)) return []

      let query = spacesTable()
        .select(COLS)
        .eq('visibility', 'network')
        .eq('status', 'active')
        .neq('type', 'root')

      // Narrow to one type only when a known, non-empty value is passed (a stray param is ignored).
      const wantType = (type ?? '').trim()
      if (wantType) query = query.eq('type', wantType)

      // Free-text: case-insensitive substring over name, brand name, and slug.
      const needle = sanitizeQuery(q ?? '')
      if (needle) {
        const like = `*${needle}*`
        query = query.or(`name.ilike.${like},brand_name.ilike.${like},slug.ilike.${like}`)
      }

      // DB ordering: name (A–Z) is the default; newest sorts by created_at desc. "Most members"
      // rides the DB in name order here and is re-sorted by count below (counts arrive separately).
      const wantSort = normalizeSpaceSort(sort)
      const ordered =
        wantSort === 'newest'
          ? query.order('created_at', { ascending: false })
          : query.order('name', { ascending: true })

      const result = (await ordered.limit(DISCOVERY_FETCH_LIMIT)) as {
        data: SpaceDiscoveryRow[] | null
        error: unknown
      }

      if (result.error || !result.data) return []
      // The "Following" filter intersects the networked set with the viewer's follows (computed
      // above). When it's off, `followedIds` is null and every networked row passes.
      const rows = followedIds ? result.data.filter((r) => followedIds.has(r.id)) : result.data

      // One grouped member-count read over just the matched ids (cheap; fail-safe to no counts).
      const counts = await memberCountsFor(rows.map((r) => r.id))

      const spaces = rows.map((r) => ({
        id: r.id,
        slug: r.slug,
        name: r.brand_name?.trim() || r.name,
        type: r.type as SpaceType,
        tagline: r.tagline?.trim() || null, // Populated from the row (Wave B); the card omits it when null.
        logoUrl: r.brand_logo_url,
        memberCount: counts.get(r.id) ?? null,
      }))

      // "Most members" orders by the resolved active-member count (desc); a Space with no count
      // sinks to the bottom, ties fall back to name so the order stays stable. Name/Newest keep the
      // DB order above.
      if (wantSort === 'members') {
        spaces.sort((a, b) => (b.memberCount ?? -1) - (a.memberCount ?? -1) || a.name.localeCompare(b.name))
      }

      return spaces
    } catch {
      return []
    }
  },
)
