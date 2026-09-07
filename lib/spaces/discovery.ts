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
import { SERIES_COLUMNS, countSeriesBy, type SeriesRow } from '@/lib/events/series'
// The profile-tab reader below re-uses the SAME pure gates the tab pages and the profile nav read,
// so the sitemap can never disagree with what a visitor is actually offered.
import { isConsoleSpaceType } from './types'
import { readStorefrontConfig } from './storefront'
import { spaceFunctionDef, spaceFunctionEnabled } from './functions'
// The circle statuses a public list may show, from the circles module's own definition rather than
// retyped here — a second copy of ['forming','active'] is a drift waiting to happen.
import { LISTABLE_CIRCLE_STATUS } from '@/lib/circles/visibility'
// 🔴 `./profile-pages` is DELIBERATELY NOT IMPORTED HERE, and the reason is the build budget, not
// taste. `readProfilePages` is the canonical reader for the operator's custom page list, but its
// MODULE imports `@/lib/page-editor/templates/space` -> `@/lib/page-editor/config`, which imports
// EVERY Puck block component in the editor. This module is reachable from `app/sitemap.ts` (a ROOT
// metadata file) and from every /spaces + /discover/spaces function, so importing it would multiply
// that whole registry across them — the exact fan-out AGENTS.md's deploy-safety section names.
// `declaredPageSlugs` below re-states the slug rule instead, and lib/spaces/discovery.test.ts pins
// it against the real `readProfilePages` so the restatement cannot drift from the canonical one.

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
  /** The row's `spaces.updated_at`, or null when unset. Consumed by the sitemap as `<lastmod>`
   *  (LIVE-197). See the COLS note: the column has no trigger behind it, so it is a floor on
   *  freshness rather than a precise edit time, and a null is emitted as NO lastmod. */
  updatedAt: string | null
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
// `updated_at` is projected for ONE consumer: app/sitemap.ts, which turns it into the `<lastmod>` on
// every Space URL (LIVE-197). Until it was here the Space section was the largest dynamic set in the
// sitemap with no lastmod at all, so a crawler had no way to tell which of ~20 profiles had changed.
// ⚠️ HONESTY NOTE: `spaces` has NO set_updated_at trigger and most write paths (including
// updateSpaceProfile) do not stamp the column, so for many rows this reads as the row's creation
// time. That is a WEAK lastmod, not a false one -- it never claims a change that did not happen --
// but it is why the sitemap treats it as optional rather than synthesising a date when it is absent.
const COLS =
  'id, slug, name, type, status, brand_name, brand_logo_url, cover_image_url, tagline, created_at, updated_at, preferences'

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
  updated_at: string | null
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

/** The upcoming-events read is a ROW read, not a tally: it carries the series columns so the count
 *  can fold occurrences into gatherings (LIVE-198). */
type UpcomingEventRow = SeriesRow & { space_id: string | null }

type EventsCountQuery = {
  select: (cols: string) => EventsCountQuery
  eq: (col: string, val: string | boolean) => EventsCountQuery
  gt: (col: string, val: string) => EventsCountQuery
  in: (col: string, vals: string[]) => EventsCountQuery
  then: (
    resolve: (r: { data: UpcomingEventRow[] | null; error: unknown }) => unknown,
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
export const DISCOVERY_FETCH_LIMIT = 200

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

/**
 * Count UPCOMING GATHERINGS per Space across a set of ids — one grouped read over `events` for the
 * non-cancelled, published rows starting after now, fail-safe to an empty map. Batched over the
 * matched ids only (no N+1), mirroring memberCountsFor.
 *
 * 🔴 IT COUNTS SERIES, NOT ROWS (LIVE-198 / SERIES-COUNT). Recurrence is MATERIALISED (ADR-007), so a
 * weekly series is ~9 rows inside the cron's 60-day horizon and this card said "9 upcoming events"
 * about ONE gathering. Measured on production 2026-09-07: 21 upcoming rows across the community are
 * 5 gatherings, and the two Spaces that run a weekly series each showed 9 where 1 is true. The fold
 * that the directory's own event LISTS use is the same one that counts here (countSeriesBy →
 * collapseSeriesRows), so the number on the card and the cards on the calendar cannot drift.
 *
 * The read therefore selects SERIES_COLUMNS + id + starts_at rather than `space_id` alone; it was
 * already a row read (never `head: true`), so this costs four columns, not a second query.
 */
async function upcomingEventCountsFor(spaceIds: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>()
  if (spaceIds.length === 0) return counts
  try {
    const result = (await eventsTable()
      .select(`space_id, id, starts_at, ${SERIES_COLUMNS}`)
      .eq('is_cancelled', false)
      .eq('status', 'published')
      .gt('starts_at', new Date().toISOString())
      .in('space_id', spaceIds)) as { data: UpcomingEventRow[] | null; error: unknown }
    if (result.error || !result.data) return counts
    // No `upcomingFrom` here: the query already applied the floor, and the fold must not re-apply a
    // DIFFERENT one. dropCancelled (default) is defence in depth over the `is_cancelled` predicate.
    return countSeriesBy(result.data, (row) => row.space_id)
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
      const followedRows = followedIds ? result.data.filter((r) => followedIds.has(r.id)) : result.data

      // The KIND filter runs in APP CODE through the same total reader the card pill keys on
      // (spaceKind: canonical `kind`, legacy `category` fallback, 'business' default), so the
      // 'business' pill matches Spaces that never picked one and pre-migration rows filter exactly
      // like migrated ones — one semantics, no jsonb-path twin to drift. 'all' / unknown = no filter.
      const rows = isSpaceKind(kind)
        ? followedRows.filter((r) => spaceKind({ preferences: r.preferences }) === kind)
        : followedRows

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
          kind: spaceKind({ preferences: r.preferences }),
          kindLabel: spaceKindPillLabel({ preferences: r.preferences }),
          tagline: r.tagline?.trim() || null, // Populated from the row (Wave B); the card omits it when null.
          logoUrl: r.brand_logo_url,
          coverUrl: r.cover_image_url,
          updatedAt: r.updated_at ?? null,
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


// ── The public Space PROFILE TAB routes, for the sitemap (LIVE-184) ─────────────────────────────
//
// `app/(main)/spaces/[slug]/(profile)/` holds seven crawlable siblings beside the profile root —
// book, calendar, circles, collaborators, reviews, shop and the operator's own custom `[page]`s.
// Every one routes its metadata through `spaceProfileMetadata`, which stamps a per-tab title and
// its OWN canonical, and none of them sets `robots.index = false`. So all seven are indexable, and
// until this reader existed the sitemap advertised none of them: ~7 tabs x ~20 networked Spaces of
// crawl-through-only URLs, including the two (/shop and /calendar) that carry the commercial and
// local-intent content an answer engine actually wants.
//
// THE RULE THIS READER EXISTS TO KEEP: an empty tab never gets a URL. Each segment below is gated
// the way the PAGE gates itself (or, where the page renders an honest empty state rather than
// 404ing, the way `buildSpaceProfileNav` gates the tab), so the sitemap can never submit a URL that
// resolves to "Nothing here yet." That is the same shape `podcastRoutes` already uses in the
// sitemap: advertise the index only when the Space has >= 1 of the thing behind it.
//
// ONE grouped read per signal, never one per Space — the N+1 the podcast section was rewritten to
// remove. FAIL-SAFE throughout: any error yields fewer URLs, never a wrong one.

/** The three constants `declaredPageSlugs` restates from `lib/spaces/profile-pages.ts`
 *  (`HOME_SLUG`, `SLUG_RE` + `MAX_SLUG_LEN`, and `MAX_PROFILE_PAGES - 1`). Named rather than
 *  inlined so the parity test can say exactly what it is comparing against. */
const PROFILE_HOME_SLUG = 'home'
const PAGE_SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const PAGE_SLUG_MAX = 40
const MAX_CUSTOM_PAGES = 5

/** The operator's declared CUSTOM page slugs off a preferences blob, in declared order, with the
 *  system `home` page dropped (it renders the profile root's own doc and canonicalises there).
 *
 *  A deliberate, TESTED restatement of `readProfilePages` — see the import note above for why this
 *  module cannot reach for the canonical one. Same rule, same order, same cap: lowercase kebab,
 *  1..40 chars, no duplicates, at most `MAX_PROFILE_PAGES - 1` custom pages. Reserved slugs are not
 *  filtered here and do not need to be: `push()` already refuses a segment a static tab claimed, and
 *  a reserved slug that got past write-side validation is shadowed by its static sibling anyway.
 *  PURE, and fail-safe to [] on any malformed shape. */
function declaredPageSlugs(preferences: unknown): string[] {
  const rec = preferences && typeof preferences === 'object' ? (preferences as Record<string, unknown>) : null
  const raw = rec?.pages
  if (!Array.isArray(raw)) return []
  const out: string[] = []
  const seen = new Set<string>()
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue
    const slug = String((row as { slug?: unknown }).slug ?? '').trim().toLowerCase()
    if (slug === PROFILE_HOME_SLUG) continue
    if (slug.length === 0 || slug.length > PAGE_SLUG_MAX) continue
    if (!PAGE_SLUG_RE.test(slug)) continue
    if (seen.has(slug)) continue
    seen.add(slug)
    out.push(slug)
    if (out.length >= MAX_CUSTOM_PAGES) break
  }
  return out
}

/** One advertisable profile tab: the Space's slug + the path segment under it. `segment` is a
 *  single path segment (`shop`, or an operator page slug); the caller joins it. */
export interface SpaceProfileTabRoute {
  slug: string
  segment: string
  /** The Space row's `updated_at` (LIVE-197), or null. Carried so the tab entries take the same
   *  weak-but-honest lastmod as the profile root rather than none at all. */
  updatedAt: string | null
}

// The tab reader projects MORE than the directory does: `entitlements` (the per-Space function
// on/off switches that gate Shop / Reviews / Circles) and `updated_at`. It deliberately does NOT
// reuse COLS — the directory pays for a card's worth of columns on every /spaces render, and this
// pays for a gate's worth once an hour behind the sitemap's revalidate.
const TAB_COLS = 'id, slug, type, updated_at, preferences, entitlements'

type SpaceTabRow = {
  id: string
  slug: string
  type: string
  updated_at: string | null
  preferences: unknown
  entitlements: unknown
}

/** A loose builder for the grouped presence reads below (`.in()` / `.is()` / `.gte()` are not on the
 *  narrow query types above, and none of these tables is fully in the generated types). */
type PresenceQuery = {
  select: (cols: string) => PresenceQuery
  eq: (col: string, val: string | boolean) => PresenceQuery
  in: (col: string, vals: readonly string[]) => PresenceQuery
  is: (col: string, val: null) => PresenceQuery
  gte: (col: string, val: string) => PresenceQuery
  or: (filter: string) => PresenceQuery
  limit: (n: number) => PresenceQuery
  then: (resolve: (r: { data: unknown[] | null; error: unknown }) => unknown) => Promise<unknown>
}

function presenceTable(table: string): PresenceQuery {
  const db = createAdminClient() as unknown as { from: (t: string) => PresenceQuery }
  return db.from(table)
}

/** Read one grouped presence signal into a Set of space ids. `pick` names the column holding the
 *  space id on the returned rows (collaborations carry two). FAIL-SAFE: an empty Set.
 *
 *  ⚠️ No `.limit()`, so PostgREST's own `max_rows` is the ceiling. That is a deliberate asymmetry
 *  with the commerce caps in app/sitemap.ts: those DROP entities, this one only drops the SIGNAL
 *  that an entity has a tab, and a signal read past the ceiling costs at most a tab URL a Space
 *  could have had. It can never advertise one it should not, which is the direction that matters. */
async function presenceIds(
  build: (q: PresenceQuery) => PresenceQuery,
  table: string,
  cols: string,
  pick: (row: Record<string, unknown>) => string | null,
): Promise<Set<string>> {
  const found = new Set<string>()
  try {
    const result = (await build(presenceTable(table).select(cols))) as {
      data: Record<string, unknown>[] | null
      error: unknown
    }
    if (result.error || !result.data) return found
    for (const row of result.data) {
      const id = pick(row)
      if (id) found.add(id)
    }
    return found
  } catch {
    return found
  }
}

/**
 * Every public profile TAB URL worth advertising, across the networked Spaces — the set the sitemap
 * emits at priority 0.5 beneath each profile's 0.6.
 *
 * Gates, per segment, matched to the page (or, where the page renders an honest empty, to the nav):
 *   · `book`         — always. The reserved action page never 404s and is the destination of the
 *                      profile's single primary CTA, so it is the one tab that is never empty.
 *   · `calendar`     — >= 1 upcoming PUBLIC event. Mirrors the OWNED half of
 *                      `spaceHasPublicUpcomingEvents` (published, not cancelled, public/unlisted,
 *                      not removed, not demo, starting today or later). It deliberately omits that
 *                      reader's accepted-SHARE half, which needs a per-Space read: this emits a
 *                      SUBSET, so a Space whose only upcoming events are shared in loses a URL it
 *                      could have had, and no Space ever gains one it should not.
 *   · `circles`      — the `circles` function ON, type is not root (the tab redirects there), and
 *                      >= 1 listed, joinable-status circle.
 *   · `collaborators`— >= 1 ACCEPTED collaboration, either direction.
 *   · `reviews`      — the `reviews` function ON and >= 1 VISIBLE review. The page itself renders an
 *                      empty wall rather than 404ing, so the >= 1 is the sitemap's own honest-empty
 *                      rule, not the route's.
 *   · `shop`         — the storefront PUBLISHED, a console Space type, and the `shop` function ON.
 *                      All three are exactly what the route double-gates on before it 404s.
 *   · `<page>`       — each operator-declared custom page (`declaredPageSlugs`: the
 *                      `readProfilePages` list minus `home`, which renders the profile root's doc
 *                      and canonicalises there).
 *
 * FAIL-SAFE: `[]` on any error. REQUEST-CACHED.
 */
export const listNetworkedSpaceProfileTabs = cache(async (): Promise<SpaceProfileTabRoute[]> => {
  try {
    // The SAME discovery boundary the directory applies (ADR-811 §3) — private and standalone
    // Spaces are isolated OUT by construction, so a walled Space can never leak a tab URL.
    const result = (await spacesTable()
      .select(TAB_COLS)
      .eq('visibility', 'network')
      .eq('network_connected', true)
      .eq('status', 'active')
      .neq('type', 'root')
      .order('slug', { ascending: true })
      .limit(DISCOVERY_FETCH_LIMIT)) as unknown as { data: SpaceTabRow[] | null; error: unknown }

    if (result.error || !result.data || result.data.length === 0) return []
    const rows = result.data
    const ids = rows.map((r) => r.id)

    // Floor the event window on today's start, the same way spaceHasPublicUpcomingEvents does, so
    // an event happening later TODAY still counts (a `> now` floor would hide it).
    const fromDayIso = `${new Date().toISOString().slice(0, 10)}T00:00:00Z`

    const [withEvents, withCircles, withReviews, collabHost, collabPartner] = await Promise.all([
      presenceIds(
        (q) =>
          q
            .eq('status', 'published')
            .eq('is_cancelled', false)
            .in('visibility', ['public', 'unlisted'])
            .is('removed_at', null)
            .eq('is_demo', false)
            .gte('starts_at', fromDayIso)
            .in('space_id', ids),
        'events',
        'space_id',
        (r) => (typeof r.space_id === 'string' ? r.space_id : null),
      ),
      presenceIds(
        // AXIS 1 in SQL, exactly as listPublicSpaceCircles spells it: `unlisted` is nullable and a
        // NULL row is a LISTED row, so a bare `.eq('unlisted', false)` would be wrong.
        (q) =>
          q
            .in('status', [...LISTABLE_CIRCLE_STATUS])
            .or('unlisted.is.null,unlisted.eq.false')
            .in('space_id', ids),
        'circles',
        'space_id',
        (r) => (typeof r.space_id === 'string' ? r.space_id : null),
      ),
      presenceIds(
        (q) => q.eq('status', 'visible').in('space_id', ids),
        'space_reviews',
        'space_id',
        (r) => (typeof r.space_id === 'string' ? r.space_id : null),
      ),
      presenceIds(
        (q) => q.eq('status', 'accepted').in('host_space_id', ids),
        'space_collaborations',
        'host_space_id',
        (r) => (typeof r.host_space_id === 'string' ? r.host_space_id : null),
      ),
      presenceIds(
        (q) => q.eq('status', 'accepted').in('collaborator_space_id', ids),
        'space_collaborations',
        'collaborator_space_id',
        (r) => (typeof r.collaborator_space_id === 'string' ? r.collaborator_space_id : null),
      ),
    ])

    const shopDef = spaceFunctionDef('shop')
    const reviewsDef = spaceFunctionDef('reviews')
    const circlesDef = spaceFunctionDef('circles')

    const out: SpaceProfileTabRoute[] = []
    for (const r of rows) {
      const type = normalizeSpaceType(r.type)
      const updatedAt = r.updated_at ?? null
      // One URL per segment, per Space. `RESERVED_PAGE_SLUGS` blocks `book` but NOT `shop`,
      // `reviews`, `circles`, `calendar` or `collaborators`, so an operator can declare a custom
      // page whose slug collides with a static sibling — the static route wins the routing and the
      // custom page never renders, but without this the sitemap would advertise that URL twice.
      const seen = new Set<string>()
      const push = (segment: string) => {
        if (seen.has(segment)) return
        seen.add(segment)
        out.push({ slug: r.slug, segment, updatedAt })
      }
      // A function switch lives in the `entitlements` blob; a missing def reads as ENABLED, the same
      // fail-open the nav and the routes use.
      const enabled = (def: ReturnType<typeof spaceFunctionDef>) =>
        !def || spaceFunctionEnabled({ entitlements: r.entitlements }, def)

      push('book')
      if (withEvents.has(r.id)) push('calendar')
      if (enabled(circlesDef) && type !== 'root' && withCircles.has(r.id)) push('circles')
      if (collabHost.has(r.id) || collabPartner.has(r.id)) push('collaborators')
      if (enabled(reviewsDef) && withReviews.has(r.id)) push('reviews')
      if (readStorefrontConfig(r.preferences).published && isConsoleSpaceType(type) && enabled(shopDef)) {
        push('shop')
      }
      for (const pageSlug of declaredPageSlugs(r.preferences)) push(pageSlug)
    }
    return out
  } catch {
    return []
  }
})
