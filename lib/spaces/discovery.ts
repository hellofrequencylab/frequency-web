// Spaces DIRECTORY discovery reads (ENTITY-SPACES-BUILD §A/§B, Phase 1 / Epic 1.8). The one
// query the in-app directory at /spaces calls to list the NETWORKED entity Spaces a member can
// browse: practitioners, businesses, organizations, coaching academies, event spaces.
//
// The discovery boundary is TWO gates (ADR-811 §3): `spaces.visibility = 'network'`
// (ENTITY-SPACES-SYSTEM §1.3, the operator's listed/walled choice) AND `spaces.network_connected = true`
// (the Community Collective world switch — a standalone / Independent Space has left the graph, so it is
// never surfaced in cross-network discovery even if it is otherwise "network"-visible). Both must hold.
// The seeded ROOT space (the Frequency app itself) is excluded — it is the platform, not a listed entity.
// `visibility` is not in the generated DB types yet, so it is reached through an untyped client (ADR-246,
// the codebase pattern for not-yet-typed columns — see lib/spaces/membership.ts, lib/page-settings/store.ts).
//
// FAIL-SAFE by construction: any error (or a pre-migration column) yields `[]`, so the directory
// degrades to an empty state rather than throwing. REQUEST-CACHED (React.cache) keyed on the
// filter args, so the page renders it at most once per request.

import { cache } from 'react'
import { createAdminClient } from '@/lib/supabase/admin'
import { listFollowedSpaceIds } from './follows'
import { normalizeSpaceType } from './types'
import type { SpaceType } from './types'
import { spaceKind, spaceKindPillLabel } from './profile-data'
import { isSpaceKind, type SpaceKind } from './categories'
import { isSubjectKey } from '@/lib/taxonomy/subjects'
import { readHeaderCtaPreference, resolveHeaderCta } from './header-cta'
import { defaultPrimaryCtaLabel } from './profile-config'
import { foundingBadgesForSpaces } from '@/lib/founding/status'

/** The one resolved action a directory card paints (the operator-configured header CTA, resolved to a
 *  real surface label + href off the Space base path). */
export interface NetworkedSpaceAction {
  label: string
  href: string
}

/** One networked Space as the directory consumes it — the brand anchor, the type + category, the
 *  resolved action, and a few cheap stats. Camel-cased; only the fields a directory card needs. */
export interface NetworkedSpace {
  id: string
  slug: string
  /** Display brand name when set, else the plain Space name (resolved here so cards stay dumb). */
  name: string
  type: SpaceType
  /** The Space's KIND (what shape of thing it is, ADR-887). Read from preferences.profileData.kind
   *  (falling back to the legacy `category` key); a null / unknown value reads as 'business'. */
  kind: SpaceKind
  /** The label the kind pill DISPLAYS: the operator's custom pill-name override when set, else the
   *  kind's own label. Keeps `kind` for taxonomy/filtering while the pill can read a custom word. */
  kindLabel: string
  /** One-line positioning. Null when the Space hasn't set one. */
  tagline: string | null
  /** Operator-supplied logo URL, or null. Rendered via a plain <img> (an arbitrary URL). */
  logoUrl: string | null
  /** Operator-supplied cover/banner image URL (spaces.cover_image_url), or null. Leads the card. */
  coverUrl: string | null
  /** The card's action button: the operator-configured header CTA resolved to a label + href off the
   *  Space base path (`/spaces/<slug>`). Total (always resolves to at least the per-type default), so
   *  never null in practice; typed nullable so a card can defend against it. */
  action: NetworkedSpaceAction | null
  /** Count of ACTIVE members of this Space (space_members), or null when omitted/unavailable. */
  memberCount: number | null
  /** Count of members who FOLLOW this Space (space_follows), or null when unavailable. */
  followerCount: number | null
  /** Count of this Space's UPCOMING, non-cancelled, published events (events.starts_at > now), or null
   *  when unavailable. */
  upcomingEventCount: number | null
  /** Whether this Space is an ACTIVE Founding Business (a founding_members row, status='active'), so the
   *  card can paint the founding mark. Resolved for the WHOLE page in one batched read (never per card).
   *  A boolean only: the founder's locked rate is a private commercial term and never leaves the reader. */
  isFoundingBusiness: boolean
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
  /** Narrow to one SUBJECT (the shared vocabulary, lib/taxonomy/subjects.ts — the directory's primary
   *  pills, ADR-887). Absent, 'all', or an off-list value = no subject filter. There is no default
   *  subject, so a Space that never picked one matches no subject pill. */
  subject?: string
  /** Narrow to one KIND (business / practitioner / coach / studio / maker / venue). Absent, 'all', or
   *  an unknown value = no kind filter. Resolved in APP CODE through the same total reader the card
   *  pill uses (spaceKind: legacy `category` fallback + 'business' default), so the 'business' filter
   *  also matches Spaces that never picked one and pre-migration rows filter exactly like migrated
   *  ones. */
  kind?: SpaceKind | 'all' | string
  /** Catalog ordering: name (A–Z, default) / newest (created_at desc) / members (member count desc). */
  sort?: SpaceSort
}

/** Optional pagination window for the paged directory read. Absent = the whole (bounded) set. */
export interface DiscoveryPage {
  /** Max rows in the returned page. Absent = no slice (return from `offset` to the end). */
  limit?: number
  /** Rows to skip before the page (0-based). Absent = 0. */
  offset?: number
}

/** Coerce an arbitrary `?sort=` value to a known SpaceSort, defaulting to 'name'. Kept here so the
 *  page + the query share one definition of the valid set (no drift). PURE. */
export function normalizeSpaceSort(value: string | null | undefined): SpaceSort {
  return value === 'newest' || value === 'members' ? value : 'name'
}

// The columns the directory projects. `visibility` is selected too (it's the discovery filter) but
// is reached through the untyped client below, so it never hits the typed-row overload. `created_at`
// backs the "Newest" sort.
// `preferences` is projected so each row can resolve its subject + kind + its operator-configured
// header CTA action in app code (all live in the jsonb blob).
const COLS =
  'id, slug, name, type, status, brand_name, brand_logo_url, cover_image_url, tagline, created_at, preferences'

/** The jsonb path to a Space's stored SUBJECT (preferences.profileData.subject), used to filter in the
 *  DB. A missing path reads as NULL, which matches no subject (there is no default subject). The KIND
 *  filter deliberately does NOT get a DB path: its legacy-key fallback + 'business' default live in the
 *  spaceKind reader, so it filters in app code over the bounded fetch (same as the Following filter)
 *  and can never drift from what the card pill shows. */
const SUBJECT_PATH = 'preferences->profileData->>subject'

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
  cover_image_url: string | null
  tagline: string | null
  created_at: string | null
  preferences: unknown
}

type SpacesQuery = {
  select: (cols: string) => SpacesQuery
  eq: (col: string, val: string | boolean) => SpacesQuery
  neq: (col: string, val: string) => SpacesQuery
  or: (filter: string) => SpacesQuery
  order: (col: string, opts: { ascending: boolean }) => SpacesQuery
  limit: (n: number) => SpacesQuery
  then: (
    resolve: (r: { data: SpaceDiscoveryRow[] | null; error: unknown }) => unknown,
  ) => Promise<unknown>
}

type CountRow = { space_id: string }

type MembersCountQuery = {
  select: (cols: string) => MembersCountQuery
  eq: (col: string, val: string) => MembersCountQuery
  in: (col: string, vals: string[]) => MembersCountQuery
  then: (
    resolve: (r: { data: CountRow[] | null; error: unknown }) => unknown,
  ) => Promise<unknown>
}

type FollowsCountQuery = {
  select: (cols: string) => FollowsCountQuery
  in: (col: string, vals: string[]) => FollowsCountQuery
  then: (
    resolve: (r: { data: CountRow[] | null; error: unknown }) => unknown,
  ) => Promise<unknown>
}

type EventsCountQuery = {
  select: (cols: string) => EventsCountQuery
  eq: (col: string, val: string | boolean) => EventsCountQuery
  gt: (col: string, val: string) => EventsCountQuery
  in: (col: string, vals: string[]) => EventsCountQuery
  then: (
    resolve: (r: { data: CountRow[] | null; error: unknown }) => unknown,
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

/** The untyped `space_follows` builder (the table isn't in the generated types yet, ADR-246). */
function followsCountTable(): FollowsCountQuery {
  const db = createAdminClient() as unknown as { from: (table: string) => FollowsCountQuery }
  return db.from('space_follows')
}

/** The `events` builder, reached loosely so the not-yet-projected filter columns type cleanly. */
function eventsTable(): EventsCountQuery {
  const db = createAdminClient() as unknown as { from: (table: string) => EventsCountQuery }
  return db.from('events')
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
      .in('space_id', spaceIds)) as { data: CountRow[] | null; error: unknown }
    if (result.error || !result.data) return counts
    for (const row of result.data) {
      counts.set(row.space_id, (counts.get(row.space_id) ?? 0) + 1)
    }
    return counts
  } catch {
    return counts
  }
}

/** Count FOLLOWERS per Space across a set of ids — one grouped read over space_follows, fail-safe to an
 *  empty map (a missing table or any error just omits counts). Batched over the matched ids only, the
 *  SAME shape as memberCountsFor (no N+1). */
async function followerCountsFor(spaceIds: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>()
  if (spaceIds.length === 0) return counts
  try {
    const result = (await followsCountTable()
      .select('space_id')
      .in('space_id', spaceIds)) as { data: CountRow[] | null; error: unknown }
    if (result.error || !result.data) return counts
    for (const row of result.data) counts.set(row.space_id, (counts.get(row.space_id) ?? 0) + 1)
    return counts
  } catch {
    return counts
  }
}

/** Count UPCOMING events per Space across a set of ids — one grouped read over `events` for the
 *  non-cancelled, published rows starting after now, fail-safe to an empty map. Batched over the matched
 *  ids only (no N+1), mirroring memberCountsFor. */
async function upcomingEventCountsFor(spaceIds: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>()
  if (spaceIds.length === 0) return counts
  try {
    const result = (await eventsTable()
      .select('space_id')
      .eq('is_cancelled', false)
      .eq('status', 'published')
      .gt('starts_at', new Date().toISOString())
      .in('space_id', spaceIds)) as { data: CountRow[] | null; error: unknown }
    if (result.error || !result.data) return counts
    for (const row of result.data) {
      if (!row.space_id) continue
      counts.set(row.space_id, (counts.get(row.space_id) ?? 0) + 1)
    }
    return counts
  } catch {
    return counts
  }
}

/**
 * List the NETWORKED entity Spaces for the in-app directory. Returns Spaces where
 * `visibility = 'network'` AND `network_connected = true` (ADR-811 §3) and `status = 'active'`, excluding
 * the root space, optionally narrowed by
 * `type` and a free-text `q` over name/brand/slug. Each row carries its brand anchor, type, tagline,
 * and a cheap active-member count. Ordered by `sort`: name (A–Z, default) / newest (created_at desc)
 * in the DB; members (member count desc) after the grouped count read (counts arrive separately, so
 * that ordering is applied in app code). FAIL-SAFE: `[]` on any error. REQUEST-CACHED.
 */
export const listNetworkedSpaces = cache(
  async ({ type, q, followerProfileId, onlyFollowed, subject, kind, sort }: DiscoveryFilters = {}): Promise<NetworkedSpace[]> => {
    try {
      // The "Following" filter: resolve the viewer's followed Space ids up front. A signed-out viewer
      // (no profile) follows nothing, so the filtered directory is correctly empty. Fail-safe to an
      // empty set, so any error just yields no matches rather than throwing.
      const followedIds = onlyFollowed ? await listFollowedSpaceIds(followerProfileId ?? null) : null
      if (onlyFollowed && (!followedIds || followedIds.size === 0)) return []

      let query = spacesTable()
        .select(COLS)
        .eq('visibility', 'network')
        .eq('network_connected', true) // the collective world gate (ADR-811 §3): standalone Spaces are walled off
        .eq('status', 'active')
        .neq('type', 'root')

      // Narrow to one type only when a known, non-empty value is passed (a stray param is ignored).
      const wantType = (type ?? '').trim()
      if (wantType) query = query.eq('type', wantType)

      // Narrow to one SUBJECT when a KNOWN key is passed ('all' / absent / off-list = no filter). The
      // subject lives in the preferences jsonb (SUBJECT_PATH) and has NO default, so a plain literal
      // match is exact: a Space that never picked a subject matches no subject pill.
      if (isSubjectKey(subject)) {
        query = query.eq(SUBJECT_PATH, subject)
      }

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

      // The cheap per-Space stats: three grouped reads over just the matched ids (each fail-safe to no
      // counts, each batched the SAME way — one query per stat, no N+1). Run together.
      // The Founding Business marks ride the SAME batched pass: ONE query for the whole page, keyed by
      // space id, so adding the badge to the card costs no per-card read (no N+1). Fail-safe to an empty
      // Map, in which case no card is badged.
      const ids = rows.map((r) => r.id)
      const [memberCounts, followerCounts, upcomingCounts, foundingBadges] = await Promise.all([
        memberCountsFor(ids),
        followerCountsFor(ids),
        upcomingEventCountsFor(ids),
        foundingBadgesForSpaces(ids),
      ])

      const spaces = rows.map((r) => {
        const type = normalizeSpaceType(r.type)
        const base = `/spaces/${r.slug}`
        // The card action = the operator-configured header CTA, resolved to a real surface off the base
        // path (falls back to the per-type default label + /book when unset). resolveHeaderCta is total.
        const resolved = resolveHeaderCta(
          readHeaderCtaPreference(r.preferences),
          base,
          defaultPrimaryCtaLabel(type),
        )
        return {
          id: r.id,
          slug: r.slug,
          name: r.brand_name?.trim() || r.name,
          type,
          category: spaceCategory({ preferences: r.preferences }),
          categoryLabel: spaceCategoryPillLabel({ preferences: r.preferences }),
          tagline: r.tagline?.trim() || null, // Populated from the row (Wave B); the card omits it when null.
          logoUrl: r.brand_logo_url,
          coverUrl: r.cover_image_url,
          action: { label: resolved.label, href: resolved.href },
          memberCount: memberCounts.get(r.id) ?? null,
          followerCount: followerCounts.get(r.id) ?? null,
          upcomingEventCount: upcomingCounts.get(r.id) ?? null,
          isFoundingBusiness: foundingBadges.get(r.id)?.isFounding === true,
        }
      })

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

/** A page of the directory: the sliced rows + the TOTAL matching the filters (so the UI can render a
 *  pager for 12 / 24 / 48 per page). */
export interface NetworkedSpacePage {
  spaces: NetworkedSpace[]
  /** Total networked Spaces matching the filters, BEFORE the page slice. */
  total: number
}

/**
 * A PAGINATED view of the directory. Resolves the full filtered + sorted set once (via the request-cached
 * listNetworkedSpaces, so no extra DB work), then slices to the requested window and returns the total.
 * Slicing happens in app code because the "Following" filter + the "members" sort already run there, so a
 * DB-level offset could not see the final order. Absent `limit` / `offset` returns the whole set (total
 * unchanged). FAIL-SAFE: an empty page + 0 total on any error. REQUEST-CACHED (keyed on filters + window).
 */
export const listNetworkedSpacesPage = cache(
  async (filters: DiscoveryFilters = {}, page: DiscoveryPage = {}): Promise<NetworkedSpacePage> => {
    const all = await listNetworkedSpaces(filters)
    const total = all.length
    const start = Math.max(0, page.offset ?? 0)
    const spaces =
      page.limit === undefined ? all.slice(start) : all.slice(start, start + Math.max(0, page.limit))
    return { spaces, total }
  },
)
