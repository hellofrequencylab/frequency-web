import 'server-only'
import { cache } from 'react'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  SERIES_COLUMNS,
  collapseSeriesRows,
  seriesFetchLimit,
  seriesUpcomingFloor,
} from '@/lib/events/series'
import { HOME_TZ, dayInZone } from '@/lib/time/zone'

// The member profile's ASSOCIATIONS panel (ADR-895) — "what is this person actually part of",
// answered in three tiers so the answer never publishes something the viewer was not entitled to.
//
// 🔴 THE GOVERNING FACT, and the reason every predicate below is spelled out longhand:
// `app/(main)/people/[handle]/page.tsx` reads through `createAdminClient()`, i.e. the SERVICE ROLE
// key, which BYPASSES RLS ENTIRELY. Every policy cited in a comment here is evidence that a rule
// exists; it is NEVER the enforcement. THE APP-CODE PREDICATE IS THE ENFORCEMENT. A predicate
// deleted from this file is a policy deleted from the product, silently, with a green build.
// That is why `components/profile/profile-associations-wiring.test.ts` asserts the predicates are
// still present as source text: no behavioural test over mocked rows can prove a filter was not
// removed.
//
// 🔴 A COUNT IS A LEAK VECTOR IN ITS OWN RIGHT. `0` versus `5` is a fact about the member. The rule,
// enforced by construction (one query serves both the number and the names):
//
//     A count is computed from EXACTLY the same filtered row set as the list it heads. If a row is
//     not listable to this viewer, it is not countable either. There is no "count-only" relaxation.
//
// This is not hypothetical. Before this module, the profile band printed `{n} circles` off an
// unfiltered `memberships → circles` read and deep-linked the single one, so a stranger learned that
// a member belonged to exactly one UNLISTED Circle and received its slug.
//
// THE THREE TIERS:
//   A — what a member BUILT (Circles hosted, Spaces run, Events hosted, Journeys / Practices
//       published, Classifieds listings). Viewer-independent: a stranger, a friend and a janitor all
//       see byte-identical output, because every counted row is already reachable by browsing.
//   B — "Circles you are both in". Signed-in non-owner only. Legal because the viewer is a member of
//       every circle on the list, so it publishes zero new bits (including when the answer is zero).
//   C — the owner's own full picture, behind the established "only you can see this" treatment.
//
// THE HONEST GAP, stated rather than hidden: `.is('space_id', null)` appears on FOUR reads
// (circles, events, practices, journey_plans) because `20260711090000_space_content_isolation.sql`
// puts the Space wall in RESTRICTIVE policies that never fire on the admin client. The consequence
// is that content published INSIDE a Space is not counted here, even when the Space is public.
// UNDER-COUNTING IS THE CORRECT FAILURE DIRECTION. Lifting it needs either a viewer-aware read
// (which would break tier A's viewer-independence) or a `security definer` RPC that runs
// `can_view_space_content` for real — and an RPC re-creates the exact RLS bypass this module exists
// to contain, so it is deliberately not built here.

export type AssociationKind =
  | 'circles'
  | 'spaces'
  | 'events'
  | 'journeys'
  | 'practices'
  | 'classifieds'

/** A destination that provably exists. No invented `?host=` facet: a filtered-index link that no
 *  index reads is a dead link wearing a live one's clothes. */
export interface AssociationLink {
  id: string
  label: string
  href: string
}

/** A count and a matching peek FROM ONE FILTERED ROW SET.
 *  `count: null` means the read FAILED. It is not the same as 0 and must never render as 0 —
 *  rendering 0 would publish a false statement about the member off a transient DB hiccup. */
export interface AssociationStat {
  kind: AssociationKind
  count: number | null
  /** True when the read hit its row ceiling, so the number is a floor, not an exact count. */
  approximate: boolean
  peek: AssociationLink[]
}

export interface OwnAssociationGroup {
  key: 'circles' | 'channels' | 'spaces' | 'journeys'
  label: string
  items: AssociationLink[]
}

export interface ProfileAssociations {
  /** Tier A, in fixed order, non-null counts only. */
  built: AssociationStat[]
  /** Tier B. `null` when the tier does not apply (signed out, owner, blocked). */
  shared: AssociationLink[] | null
  /** Tier C. `null` unless the viewer owns this profile. */
  mine: OwnAssociationGroup[] | null
}

/** Names shown per tile. Three keeps the peek list under the six-row cap across kinds. */
const PEEK_LIMIT = 3
/** Names shown on the tier-B / tier-C rows, which are lists rather than tiles. */
const LIST_LIMIT = 6

/** Circle statuses whose ROW an ordinary member may read. `archived` needs host+ and `draft` needs
 *  owner/guide+ (`20260803000100_starter_circles_1_schema.sql:134-140`), so both stay off every
 *  tier — including tier B, where the MEMBERSHIP row is readable but the CIRCLE row is not. */
const LISTABLE_CIRCLE_STATUS = ['forming', 'active', 'inactive'] as const

/** The Events tile counts SERIES, so it cannot use `{ count: 'exact' }` — a weekly cowork is nine
 *  materialised rows and the tile must read `Events 1`. It reads wide, folds, then counts, and this
 *  is the read ceiling. `seriesFetchLimit(24)` lands on `SERIES_FETCH_CEILING` (240), which covers
 *  ~26 weekly series or ~4 daily ones across the 60-day materialisation horizon. Above it the count
 *  is a floor and `approximate` says so, rather than quietly under-reporting.
 *  ⚠️ Deliberate deviation from the spec's `seriesFetchLimit(3)` = 30: 30 rows is ONE daily series,
 *  so the "exact" count would have been wrong for any active host. */
const EVENT_SERIES_READ = seriesFetchLimit(24)

type Peek = { count: number | null; approximate: boolean; peek: AssociationLink[] }

const EMPTY: Peek = { count: null, approximate: false, peek: [] }

/** Per-read fail-safe. A broken sub-read must never break the profile, and must never become a 0:
 *  it becomes `count: null`, and the UI omits that tile entirely, so the panel shrinks instead of
 *  lying. Settled per read, not per wave, so one bad table cannot take the other five down. */
function settle(results: PromiseSettledResult<Peek>[], i: number): Peek {
  const r = results[i]
  return r && r.status === 'fulfilled' ? r.value : EMPTY
}

// ── Tier A ────────────────────────────────────────────────────────────────────────────────────────
// Viewer-INDEPENDENT by construction: `readBuilt` takes no viewer argument at all, so there is no
// way to accidentally widen it for a friend. Request-cached on the profile id alone, which is only
// safe BECAUSE it is viewer-independent — see the note on `unstable_cache` at the bottom of tiers
// B and C.
const readBuilt = cache(async (profileId: string): Promise<AssociationStat[]> => {
  const admin = createAdminClient()
  // ONE clock for the whole panel, taken in the community's zone, so the Events read and the fold
  // can never disagree about what "upcoming" means (ADR-897: the caller owns the clock).
  const floor = seriesUpcomingFloor(dayInZone(new Date(), HOME_TZ))

  const settled = await Promise.allSettled<Peek>([
    // CIRCLES hosted. `unlisted` is the browse-hiding flag the Circles index honours
    // (`lib/circles/index-data.ts`), so a Circle the member deliberately kept out of browse stays
    // out of their profile too. `.is('space_id', null)` is 1 of 4 — without it a Circle owned by a
    // PRIVATE Space is named and deep-linked to every stranger.
    (async (): Promise<Peek> => {
      const { data, count, error } = await admin
        .from('circles')
        .select('id, name, slug', { count: 'exact' })
        .eq('host_id', profileId)
        .eq('unlisted', false)
        .in('status', [...LISTABLE_CIRCLE_STATUS])
        .is('space_id', null)
        .order('created_at', { ascending: false })
        .limit(PEEK_LIMIT)
      if (error) throw error
      return {
        count: count ?? 0,
        approximate: false,
        peek: (data ?? []).map((c) => ({ id: c.id, label: c.name, href: `/circles/${c.slug}` })),
      }
    })(),

    // SPACES run. Byte-for-byte the live directory rule (`lib/spaces/discovery.ts` listNetworkedSpaces),
    // which is what a member can actually browse.
    // ⚠️ NOT `.neq('visibility', 'private')`, which the plan proposed: `spaces.visibility` gained a
    // third value `'unlisted'` (`20261142000000`) whose documented meaning is "excluded from the
    // directory". `.neq(…,'private')` would therefore NAME AN UNLISTED SPACE on a public profile.
    (async (): Promise<Peek> => {
      const { data, count, error } = await admin
        .from('spaces')
        .select('id, name, slug', { count: 'exact' })
        .eq('owner_profile_id', profileId)
        .eq('status', 'active')
        .eq('visibility', 'network')
        .eq('network_connected', true)
        .neq('type', 'root')
        .order('created_at', { ascending: false })
        .limit(PEEK_LIMIT)
      if (error) throw error
      return {
        count: count ?? 0,
        approximate: false,
        peek: (data ?? []).map((s) => ({ id: s.id, label: s.name, href: `/spaces/${s.slug}` })),
      }
    })(),

    // EVENTS hosted, upcoming. Stricter than the `public_organizer_events` RPC the plan cited as its
    // basis: that RPC filters only `is_cancelled` + `visibility`, so it would count DRAFT and
    // moderator-REMOVED events. `status`, `removed_at` and `space_id` are all load-bearing here.
    // The recurrence columns are what make the fold real — a SELECT without them makes
    // `collapseSeriesRows` a silent no-op and the tile reads "Events 12" for one weekly cowork.
    (async (): Promise<Peek> => {
      const { data, error } = await admin
        .from('events')
        .select(`id, title, slug, starts_at, is_cancelled, ${SERIES_COLUMNS}`)
        .eq('host_id', profileId)
        .eq('status', 'published')
        .in('visibility', ['public', 'unlisted'])
        .eq('is_cancelled', false)
        .is('removed_at', null)
        .is('space_id', null)
        .gte('starts_at', floor)
        .order('starts_at', { ascending: true })
        .limit(EVENT_SERIES_READ)
      if (error) throw error
      const rows = data ?? []
      // perSeries: 1 — the tile counts GATHERINGS, not dates. `lib/events/series.ts` is the one
      // owner of this fold (ADR-897); never hand-roll a local one.
      const folded = collapseSeriesRows(rows, { upcomingFrom: floor, perSeries: 1 })
      return {
        count: folded.length,
        approximate: rows.length >= EVENT_SERIES_READ,
        peek: folded
          .slice(0, PEEK_LIMIT)
          .map((e) => ({ id: e.id, label: e.title, href: `/events/${e.slug}` })),
      }
    })(),

    // JOURNEYS published. `.eq('status','approved')` is STRICTER than the live library read
    // (`lib/journey-plans.ts` listPublicJourneys, which only excludes `rejected`), on purpose: a
    // plan still in review must not be counted under a tile that says "Published".
    (async (): Promise<Peek> => {
      const { data, count, error } = await admin
        .from('journey_plans')
        .select('id, title, slug', { count: 'exact' })
        .eq('author_id', profileId)
        .eq('visibility', 'public')
        .eq('status', 'approved')
        .not('published_at', 'is', null)
        .is('space_id', null)
        .order('published_at', { ascending: false })
        .limit(PEEK_LIMIT)
      if (error) throw error
      return {
        count: count ?? 0,
        approximate: false,
        peek: (data ?? []).map((j) => ({ id: j.id, label: j.title, href: `/journeys/${j.slug}` })),
      }
    })(),

    // PRACTICES published. 🔴 `"practices: public read"` is `using (true)`
    // (`20240228000000_practices.sql:75`), so THERE IS NO RLS BACKSTOP ON THIS TABLE AT ALL. These
    // four predicates are 100% of the gate; a mistake here is a full leak with nothing behind it.
    (async (): Promise<Peek> => {
      const { data, count, error } = await admin
        .from('practices')
        .select('id, title, slug', { count: 'exact' })
        .eq('created_by', profileId)
        .eq('is_public', true)
        .eq('status', 'approved')
        .is('space_id', null)
        .order('created_at', { ascending: false })
        .limit(PEEK_LIMIT)
      if (error) throw error
      return {
        count: count ?? 0,
        approximate: false,
        peek: (data ?? []).map((p) => ({
          id: p.id,
          label: p.title,
          href: `/practices/${p.slug ?? p.id}`,
        })),
      }
    })(),

    // CLASSIFIEDS listings. `status='active'` is exactly what the board itself lists
    // (`lib/marketplace.ts` listListings), so count-equals-browse holds. `market_listings` carries
    // no `space_id`, so no Space wall applies and no fifth `.is('space_id', null)` belongs here.
    (async (): Promise<Peek> => {
      const { data, count, error } = await admin
        .from('market_listings')
        .select('id, title', { count: 'exact' })
        .eq('author_id', profileId)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(PEEK_LIMIT)
      if (error) throw error
      return {
        count: count ?? 0,
        approximate: false,
        peek: (data ?? []).map((l) => ({ id: l.id, label: l.title, href: `/classifieds/${l.id}` })),
      }
    })(),
  ])

  const kinds: AssociationKind[] = ['circles', 'spaces', 'events', 'journeys', 'practices', 'classifieds']
  const out: AssociationStat[] = []
  for (let i = 0; i < kinds.length; i++) {
    const r = settle(settled, i)
    out.push({ kind: kinds[i]!, count: r.count, approximate: r.approximate, peek: r.peek })
  }
  return out
})

// ── Tier B ────────────────────────────────────────────────────────────────────────────────────────
/** Circles the viewer and this member are BOTH active in.
 *
 *  Legal because `memberships` is readable by the member, their co-members and the host
 *  (`20260612060000_retire_crew_role_value.sql:201-215`), and every circle on this list is one the
 *  viewer belongs to — so the row publishes nothing they could not already read.
 *
 *  ⚠️ The circle ROWS are re-filtered by status even though the MEMBERSHIP rows are readable. An
 *  archived circle's row needs host+, a draft's needs guide+; without the re-filter an ordinary
 *  member's shared-circles row could print a name they are not entitled to the row for.
 *
 *  🔴 Viewer-scoped, therefore NEVER `unstable_cache`d: a cross-request cache keyed on the profile
 *  id alone would serve one viewer's tier B to a different viewer. That is cache poisoning, not a
 *  performance trade. React `cache()` (per-request) is the only caching this file uses. */
async function readShared(viewerProfileId: string, profileId: string): Promise<AssociationLink[]> {
  const admin = createAdminClient()
  const [mine, theirs] = await Promise.all([
    admin.from('memberships').select('circle_id').eq('profile_id', viewerProfileId).eq('status', 'active'),
    admin.from('memberships').select('circle_id').eq('profile_id', profileId).eq('status', 'active'),
  ])
  if (mine.error || theirs.error) return []
  const mineIds = new Set((mine.data ?? []).map((m) => m.circle_id))
  const overlap = (theirs.data ?? []).map((m) => m.circle_id).filter((id) => mineIds.has(id))
  if (overlap.length === 0) return []

  const { data, error } = await admin
    .from('circles')
    .select('id, name, slug')
    .in('id', overlap.slice(0, 60))
    .in('status', [...LISTABLE_CIRCLE_STATUS])
    .order('name', { ascending: true })
    .limit(LIST_LIMIT)
  if (error) return []
  return (data ?? []).map((c) => ({ id: c.id, label: c.name, href: `/circles/${c.slug}` }))
}

// ── Tier C ────────────────────────────────────────────────────────────────────────────────────────
/** The owner's own picture. Own rows only, so there is nothing to gate beyond ownership itself —
 *  and ownership is checked by the CALLER BEFORE this read is issued, never after. An owner-only
 *  read that runs for a stranger and is then discarded is one refactor away from being rendered. */
async function readOwn(profileId: string): Promise<OwnAssociationGroup[]> {
  const admin = createAdminClient()
  const settled = await Promise.allSettled([
    admin
      .from('memberships')
      .select('circles!circle_id ( id, name, slug )')
      .eq('profile_id', profileId)
      .eq('status', 'active')
      .limit(LIST_LIMIT),
    admin
      .from('topical_channel_memberships')
      .select('topical_channels!topical_channel_id ( id, name )')
      .eq('profile_id', profileId)
      .limit(LIST_LIMIT),
    admin
      .from('space_members')
      .select('spaces!space_id ( id, name, slug )')
      .eq('profile_id', profileId)
      .eq('status', 'active')
      .limit(LIST_LIMIT),
    admin
      .from('journey_enrollments')
      .select('journey_plans!plan_id ( id, title, slug )')
      .eq('profile_id', profileId)
      .limit(LIST_LIMIT),
  ])

  const rowsOf = <T,>(i: number): T[] => {
    const r = settled[i]
    if (!r || r.status !== 'fulfilled' || r.value.error) return []
    return (r.value.data ?? []) as unknown as T[]
  }

  const groups: OwnAssociationGroup[] = [
    {
      key: 'circles',
      label: 'Circles you are in',
      items: rowsOf<{ circles: { id: string; name: string; slug: string } | null }>(0)
        .map((r) => r.circles)
        .filter((c): c is { id: string; name: string; slug: string } => !!c)
        .map((c) => ({ id: c.id, label: c.name, href: `/circles/${c.slug}` })),
    },
    {
      key: 'channels',
      label: 'Channels you follow',
      items: rowsOf<{ topical_channels: { id: string; name: string } | null }>(1)
        .map((r) => r.topical_channels)
        .filter((c): c is { id: string; name: string } => !!c)
        .map((c) => ({ id: c.id, label: c.name, href: `/channels/${c.id}` })),
    },
    {
      key: 'spaces',
      label: 'Space seats you hold',
      items: rowsOf<{ spaces: { id: string; name: string; slug: string } | null }>(2)
        .map((r) => r.spaces)
        .filter((s): s is { id: string; name: string; slug: string } => !!s)
        .map((s) => ({ id: s.id, label: s.name, href: `/spaces/${s.slug}` })),
    },
    {
      key: 'journeys',
      label: 'Journeys you joined',
      items: rowsOf<{ journey_plans: { id: string; title: string; slug: string } | null }>(3)
        .map((r) => r.journey_plans)
        .filter((j): j is { id: string; title: string; slug: string } => !!j)
        .map((j) => ({ id: j.id, label: j.title, href: `/journeys/${j.slug}` })),
    },
  ]
  return groups.filter((g) => g.items.length > 0)
}

/**
 * The profile page's one entry point. Assembles the three tiers with per-read fail-safes.
 *
 * `isOwner` and `blocked` are computed by the CALLER (it already has both) and decide which tiers
 * are READ, not merely which are rendered.
 */
export async function getProfileAssociations(opts: {
  profileId: string
  viewerProfileId: string | null
  isOwner: boolean
  /** A blocked viewer gets tier A only — the same public picture browsing already gives them. */
  blocked?: boolean
}): Promise<ProfileAssociations> {
  const { profileId, viewerProfileId, isOwner, blocked = false } = opts

  // Tier C is gated HERE, before the read is issued. Tier B needs a signed-in, non-owner,
  // non-blocked viewer who is not looking at their own page.
  const wantsShared = !!viewerProfileId && !isOwner && !blocked && viewerProfileId !== profileId
  const wantsOwn = isOwner

  const [built, shared, mine] = await Promise.all([
    readBuilt(profileId).catch((): AssociationStat[] => []),
    wantsShared
      ? readShared(viewerProfileId!, profileId).catch((): AssociationLink[] => [])
      : Promise.resolve(null),
    wantsOwn ? readOwn(profileId).catch((): OwnAssociationGroup[] => []) : Promise.resolve(null),
  ])

  return { built, shared, mine }
}
