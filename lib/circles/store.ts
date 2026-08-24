// Circles tenancy data layer (Phase 0, ENTITY-SPACES-BUILD Epic 0.3 / ENTITY-SPACES-SYSTEM
// §4.3). Two seams the per-space profile work (Phase 1) needs:
//   - stampCircleSpaceId(): the DEFAULT space_id for a new circle — the root space (via
//     loadRootSpaceId), so new circles created through the existing single-tenant flows are
//     space-stamped to root and nothing changes today. A space-scoped caller passes its own id.
//   - listCirclesForSpace(): the by-space read the Phase 1 profile's `entity-community` module
//     uses to list a Space's own circles.
//
// Server-only (admin client; callers enforce authz, exactly like the existing circle flows).
// `circles.space_id` (added by 20260711000000_object_space_id.sql) is in the generated types now,
// so the ADR-246 untyped casts this module carried are retired.

import { cache } from 'react'
import { createAdminClient } from '@/lib/supabase/admin'
import { loadRootSpaceId } from '@/lib/spaces/store'
import { getMyProfileId, isPlatformStaff } from '@/lib/auth'
import {
  asCircleAccess,
  canEnterCircle,
  canSeeCircle,
  LISTABLE_CIRCLE_STATUS,
  type CircleAccess,
} from './visibility'
import type { CircleDetail, MemberRow } from './detail-types'

/** A circle as the by-space read returns it (the columns the community module needs).
 *
 *  ⚠️ `unlisted` + `access` are NOT decoration. Every read in this module goes through the admin
 *  client, which holds BYPASSRLS and never sees `circles_access_restrictive`, so a caller that
 *  renders publicly has to apply the rule BY HAND (lib/circles/visibility.ts, the 🔴 block). The
 *  columns used to be absent from `COLS`, which meant a public caller could not have applied it
 *  even if it remembered to — and none of the four did (ADR-1094). They are selected now so the
 *  question is at least askable, and `listPublicSpaceCircles` below is the answer nobody has to
 *  re-derive. */
export interface SpaceCircle {
  id: string
  slug: string
  name: string
  about: string | null
  type: string
  member_count: number
  member_cap: number | null
  status: string
  host_id: string | null
  space_id: string | null
  created_at: string | null
  /** AXIS 1 (discovery). Read it through `isListedCircle`, never as a bare boolean. */
  unlisted: boolean | null
  /** AXIS 2 (entry). Narrow it through `asCircleAccess`; the door itself is the circle's own page. */
  access: string | null
  image_url: string | null
  neighborhood: string | null
  topical_channel_id: string | null
}

/** A Space's Circle plus the Journey it is running right now, if any (ADR-842). */
export interface SpaceCircleWithRun extends SpaceCircle {
  run: {
    id: string
    planId: string
    journeyTitle: string
    journeySlug: string | null
    startedAt: string
  } | null
}

const COLS =
  'id, slug, name, about, type, member_count, member_cap, status, host_id, space_id, created_at, unlisted, access, image_url, neighborhood, topical_channel_id'

/**
 * The space_id to stamp on a NEW circle: the explicit owning space, else the root space
 * (so the existing single-tenant create flows default to root and behave exactly as today).
 * Returns null only if the root row is missing (pre-migration) — callers then omit the field,
 * leaving the column NULL, which the backfill later sweeps to root.
 */
export async function stampCircleSpaceId(spaceId?: string | null): Promise<string | null> {
  return spaceId ?? (await loadRootSpaceId())
}

/**
 * The Space a circle belongs to — the ONE derivation every circle-EVENT writer stamps
 * `events.space_id` from (ADR-857). A circle in a Space means the circle's events are that
 * Space's events too: they appear on the Space calendar (which filters on events.space_id)
 * while the circle page keeps reading them by scope_id. The root space means "personal circle",
 * so events there keep today's root placement. FAIL-SAFE to null (caller omits the stamp and the
 * insert default / backfill sweeps it to root) — placement must never block event creation.
 */
export async function spaceIdForCircle(circleId: string): Promise<string | null> {
  if (!circleId) return null
  try {
    const { data } = await createAdminClient()
      .from('circles')
      .select('space_id')
      .eq('id', circleId)
      .maybeSingle()
    return (data as { space_id: string | null } | null)?.space_id ?? null
  } catch {
    return null
  }
}

/**
 * Circles this person HOSTS, newest first, wherever they live (personal or any Space's). Feeds
 * the attach-to-Space picker (ADR-857): the picker shapes the offer, the transfer gate stays the
 * authority on the write. Excludes archived circles — a dead circle is not worth attaching.
 * FAIL-SAFE: [] on any error.
 */
export async function listCirclesHostedBy(profileId: string, limit = 50): Promise<SpaceCircle[]> {
  if (!profileId) return []
  try {
    const { data, error } = await createAdminClient()
      .from('circles')
      .select(COLS)
      .eq('host_id', profileId)
      .neq('status', 'archived')
      .order('created_at', { ascending: false })
      .limit(limit)
    if (error) return []
    return (data as SpaceCircle[] | null) ?? []
  } catch {
    return []
  }
}

// ── THE CIRCLE VIEWER GATE (ADR-1015) ───────────────────────────────────────────────────────────

/**
 * Resolve the CURRENT caller against one Circle, on BOTH axes.
 *
 * Needed because every read in this module goes through the admin client, which holds BYPASSRLS
 * and therefore never sees `circles_access_restrictive`. Arm for arm identical to
 * `private.can_see_circle` / `private.can_enter_circle`, in the same order, so a reader can diff
 * the two. FAIL-CLOSED: any error reads as "sees nothing, enters nothing", so a hiccup hides a
 * Circle rather than publishing one.
 *
 * Only ever called for a Circle already known to be CLOSED (`access <> 'open'`), so the extra
 * round trips land on the rare path and an open Circle costs exactly what it did before.
 */
async function resolveCircleViewer(
  circleId: string,
  unlisted: boolean,
  access: CircleAccess,
  spaceId: string | null,
  hostId: string | null,
): Promise<{ canSee: boolean; canEnter: boolean }> {
  try {
    const viewerProfileId = await getMyProfileId()

    const admin = createAdminClient()
    const [membership, staff] = await Promise.all([
      viewerProfileId
        ? admin
            .from('memberships')
            .select('id')
            .eq('circle_id', circleId)
            .eq('profile_id', viewerProfileId)
            .eq('status', 'active')
            .maybeSingle()
        : Promise.resolve({ data: null }),
      isPlatformStaff(),
    ])

    // Three DIFFERENT questions about the owning Space, and conflating any two was the bug the
    // owner's rulings exposed (ADR-1015; OWN-034 ruling C, ADR-1092):
    //   isSpaceMember      — a seat on the TEAM (owner, or an active `space_members` row of any
    //                        rung). Opens the Circle ONLY when access is 'space_members'. A seat
    //                        is not a general key.
    //   isSpacePaidMember  — an ACTIVE paid membership (`space_memberships`). Opens the Circle
    //                        ONLY when access is 'space_paid_members'. Looked up only on that
    //                        mode, so every other closed circle costs what it did before.
    //   isSpaceSteward     — owner or editor+. Mirrors `private.can_write_space_content`: someone
    //                        who can move or delete the Circle can read it.
    // For a PERSONAL Circle the owning Space is ROOT, whose owner_profile_id is unset and whose
    // rosters are empty, so all three are false and only the staff arm can open it. That
    // asymmetry is the whole reason the DB policy could not be built on the space predicate.
    let isSpaceMember = false
    let isSpacePaidMember = false
    let isSpaceSteward = false
    if (spaceId && viewerProfileId) {
      const [owned, seat, paid] = await Promise.all([
        admin.from('spaces').select('id').eq('id', spaceId).eq('owner_profile_id', viewerProfileId).maybeSingle(),
        admin
          .from('space_members')
          .select('role')
          .eq('space_id', spaceId)
          .eq('profile_id', viewerProfileId)
          .eq('status', 'active')
          .maybeSingle(),
        access === 'space_paid_members'
          ? admin
              .from('space_memberships')
              .select('id')
              .eq('space_id', spaceId)
              .eq('member_profile_id', viewerProfileId)
              .eq('status', 'active')
              .maybeSingle()
          : Promise.resolve({ data: null }),
      ])
      const role = (seat.data as { role?: string } | null)?.role ?? null
      isSpaceMember = !!owned.data || role !== null
      isSpacePaidMember = !!paid.data
      isSpaceSteward = !!owned.data || role === 'editor' || role === 'moderator' || role === 'admin'
    }

    const facts = {
      unlisted,
      access,
      hostId,
      viewerProfileId,
      isMember: !!membership.data,
      isSpaceMember,
      isSpacePaidMember,
      isSpaceSteward,
      isPlatformStaff: staff,
    }
    return { canSee: canSeeCircle(facts), canEnter: canEnterCircle(facts) }
  } catch {
    return { canSee: false, canEnter: false }
  }
}

// ── THE CIRCLE DETAIL SHELL READ (the tabbed detail route, PAGE-FRAMEWORK §3) ───────────────────

/** Everything the circle detail SHELL and every tab under it open on: the entity, the raw theme
 *  jsonb the header settings live in, and the roster in render order. */
export interface CircleShell {
  circle: CircleDetail
  /** Raw `circles.theme` jsonb — newer than the generated types, read through the ADR-246 seam. */
  theme: unknown
  /**
   * Active members, host first then by join date (the order every roster surface renders).
   *
   * 🔴 EMPTY when `canEnter` is false. A LISTED closed Circle is public FACE — a viewer may see it
   * exists, by name, Host, description and member count — and must NOT see who is in it. The
   * roster is redacted HERE rather than at each tab, because a tab that forgot is a leak and a
   * tab that cannot get the data cannot forget. `circle.member_count` is deliberately left intact:
   * the number is part of the funnel's public face, the names are not.
   */
  members: MemberRow[]
  /**
   * May this viewer see WHAT IS IN IT (ADR-1015 axis 2)? False for the lead-funnel case: the shell
   * resolved, so the Circle exists and may be named, but every tab body, the roster and the posts
   * are shut. A surface that renders content MUST branch on this and offer the join / buy call to
   * action instead.
   */
  canEnter: boolean
}

/**
 * THE one read behind `/circles/<slug>` and every tab beneath it.
 *
 * It exists because the route is now a route-segment LAYOUT plus tab pages (PAGE-FRAMEWORK §3):
 * the layout paints the hero + band, each tab paints a body, and all of them need the same circle
 * and the same roster. `cache()` makes that ONE pair of queries per request no matter how many of
 * them ask — the layout and its child page share a request, so the tab page's call is a memo hit,
 * not a second round trip. Without it, splitting the page into a shell + tabs would have doubled
 * the reads it costs.
 *
 * Archived circles resolve to null (the caller 404s), matching the filter the page has always
 * applied. FAIL-SAFE to null on any read error, so a hiccup reads as "not found" rather than a
 * half-painted page.
 *
 * 🔴 PRIVACY IS ENFORCED HERE, NOT IN THE ROUTE (ADR-1015). This read uses the ADMIN client, which
 * holds BYPASSRLS — `circles_access_restrictive` is completely invisible to it. So the whole circle
 * detail surface (the shell layout, the Home tab, the Members tab, every tab beneath) would render
 * a closed circle to a stranger if the gate lived only in the database. Putting it in this function
 * rather than in the layout is deliberate: the layout is one of four callers, and a fifth would
 * arrive ungated.
 *
 * 🔴 IT ANSWERS BOTH QUESTIONS, BECAUSE THEY HAVE DIFFERENT ANSWERS:
 *   • may this viewer see THAT IT EXISTS  → no ⇒ `null`, which every caller already turns into a
 *     404. The same answer a non-existent slug gets, so the 404 never confirms the circle is real.
 *   • may this viewer see WHAT IS IN IT   → no ⇒ the shell still resolves, with `canEnter: false`
 *     and an EMPTY roster. That is the LISTED CLOSED circle, the lead funnel: name, Host,
 *     description and member count are public face, the names and the posts are not.
 *
 * Redacting the roster here rather than at each tab is the whole point — a tab that forgot would
 * be a leak, and a tab that never receives the data cannot forget.
 *
 * 🔴 THEREFORE VIEWER-SCOPED, and never `unstable_cache`-able. React `cache()` is per-request, so
 * one viewer's shell can never be served to another. A cross-request cache keyed on the slug alone
 * would hand a closed circle to the next visitor — cache poisoning, not a performance trade
 * (the same rule `lib/people/associations.ts` tier B carries, for the same reason).
 *
 * The gate costs NOTHING on the common path: `access === 'open'` short-circuits before any viewer
 * read is issued, so an open circle is exactly as many round trips as it was.
 */
export const loadCircleShell = cache(async (slug: string): Promise<CircleShell | null> => {
  if (!slug) return null
  try {
    const admin = createAdminClient()
    const { data: rawCircle } = await admin
      .from('circles')
      .select(
        `id, name, slug, about, image_url, type, member_count, member_cap, status, is_demo, resonance_public,
         latitude, longitude, neighborhood, city, sidebar_order, theme, access, space_id, host_id, unlisted,
         host:profiles!host_id ( id, display_name, handle, avatar_url ),
         hub:hubs!hub_id (
           id, name, slug,
           nexus:nexuses!nexus_id (
             id, name, slug,
             outpost:outposts!outpost_id (
               id, name,
               region:nexus_regions!region_id ( name )
             )
           )
         )`
      )
      .eq('slug', slug)
      .neq('status', 'archived')
      .maybeSingle()
    if (!rawCircle) return null

    // THE TWO-AXIS GATE (see the header). Reached only for a CLOSED circle.
    const raw = rawCircle as unknown as {
      id: string
      access?: unknown
      unlisted?: unknown
      space_id?: string | null
      host_id?: string | null
    }
    const access = asCircleAccess(raw.access)
    let canEnter = true
    if (access !== 'open') {
      const verdict = await resolveCircleViewer(
        raw.id,
        raw.unlisted === true,
        access,
        raw.space_id ?? null,
        raw.host_id ?? null,
      )
      if (!verdict.canSee) return null
      canEnter = verdict.canEnter
    }

    const circle = rawCircle as unknown as CircleDetail
    const { data: rawMembers } = await admin
      .from('memberships')
      .select(
        `id, volunteer_role, joined_at,
         profile:profiles!profile_id ( id, display_name, handle, avatar_url, community_role, membership_tier, current_season_rank, current_streak, achievement_count )`
      )
      .eq('circle_id', circle.id)
      .eq('status', 'active')
      .order('joined_at', { ascending: true })

    // Host first, then join order (the read already sorted by joined_at ascending).
    const members = ((rawMembers ?? []) as unknown as MemberRow[]).slice().sort((a, b) => {
      const aHost = circle.host?.id === a.profile?.id ? 0 : 1
      const bHost = circle.host?.id === b.profile?.id ? 0 : 1
      return aHost - bHost
    })

    return {
      circle,
      theme: (rawCircle as unknown as { theme?: unknown }).theme,
      // The redaction. `member_count` on the circle row survives (public face); the names do not.
      members: canEnter ? members : [],
      canEnter,
    }
  } catch {
    return null
  }
})

/**
 * Circles that BELONG TO a space, newest first. Defaults to the root space (so a caller that
 * passes no spaceId reads the root's circles, the canary). Filtered by space_id so a circle in
 * space A can never resolve for space B. FAIL-SAFE: [] on any error / missing tenant.
 *
 * 🔴 THIS IS THE RAW READ: no status filter and NO VISIBILITY FILTER, through a BYPASSRLS client.
 * It is right for an OWNER surface that must see the archived and the hidden. If what you are
 * writing renders to a visitor, you want `listPublicSpaceCircles` below instead — four public
 * callers reached for this one and all four leaked unlisted circles (ADR-1094).
 */
export async function listCirclesForSpace(spaceId?: string | null, limit = 50): Promise<SpaceCircle[]> {
  const sid = spaceId ?? (await loadRootSpaceId())
  if (!sid) return []
  try {
    const { data, error } = await createAdminClient()
      .from('circles')
      .select(COLS)
      .eq('space_id', sid)
      .order('created_at', { ascending: false })
      .limit(limit)
    if (error) return []
    return (data as SpaceCircle[] | null) ?? []
  } catch {
    return []
  }
}

/**
 * THE PUBLIC by-space read: the Circles of `spaceId` that this viewer may know exist.
 *
 * ── WHY THIS EXISTS (ADR-1094) ──────────────────────────────────────────────────────────────
 *
 * `listCirclesForSpace` is the RAW read: every circle stamped with the space_id, through the
 * service-role client, no visibility filter, no status filter. That is correct for an OWNER
 * surface (the manager must see the archived one and the hidden one) and WRONG for every public
 * one. Four public callers each re-derived "and now drop the ones that should not show", each got
 * the status half right, and all four omitted axis 1 entirely — so an UNLISTED circle rendered on
 * a Space's public Home page, in the entity Community module, in the hero's "Circles N" stat and
 * in the has-content gate. The columns were not even selected, so the omission was invisible.
 *
 * Both filters run IN THE QUERY, not over the result, because they must run BEFORE `limit`.
 * Filtering a capped page in JavaScript lets a hidden row eat a visible row's slot: a Space with
 * one unlisted circle would show five on a six-slot block and there would be nothing to see.
 *
 * ── WHAT IT DOES *NOT* FILTER ───────────────────────────────────────────────────────────────
 *
 * AXIS 2. A LISTED CLOSED circle is the lead funnel the two-axis model exists for (ADR-1015): a
 * stranger finds it by name, Host and description and decides to join or buy. `canEnterCircle`,
 * on the circle's own page, is what shuts the door. Dropping closed circles here would delete
 * that cell, which is the one thing the owner's ruling was for.
 *
 * A viewer sees their OWN unlisted circle (the same courtesy `/circles` extends in its index),
 * resolved in a second bounded query and merged, so the LIMIT stays honest on the listed half.
 * FAIL-SAFE to [] like its siblings: a hiccup hides circles rather than publishing them.
 */
export async function listPublicSpaceCircles(
  spaceId: string | null | undefined,
  opts: { viewerProfileId?: string | null; limit?: number; includeHidden?: boolean } = {},
): Promise<SpaceCircle[]> {
  if (!spaceId) return []
  const limit = opts.limit ?? 50
  try {
    const admin = createAdminClient()

    // The OWNER path: every active circle the Space owns, hidden ones included. Only ever reached
    // from a surface that has already proved the viewer may manage this Space.
    if (opts.includeHidden) {
      const { data, error } = await admin
        .from('circles')
        .select(COLS)
        .eq('space_id', spaceId)
        .in('status', [...LISTABLE_CIRCLE_STATUS])
        .order('created_at', { ascending: false })
        .limit(limit)
      if (error) return []
      return (data as SpaceCircle[] | null) ?? []
    }

    // AXIS 1 in SQL. `unlisted` is nullable and a NULL row is a LISTED row, which is exactly what
    // `isListedCircle` says in app code (`unlisted !== true`) — the two spellings of one rule, and
    // the reason a bare `.eq('unlisted', false)` would be wrong here.
    const listedQuery = admin
      .from('circles')
      .select(COLS)
      .eq('space_id', spaceId)
      .in('status', [...LISTABLE_CIRCLE_STATUS])
      .or('unlisted.is.null,unlisted.eq.false')
      .order('created_at', { ascending: false })
      .limit(limit)

    const [listed, mine] = await Promise.all([
      listedQuery,
      opts.viewerProfileId ? myCirclesInSpace(admin, spaceId, opts.viewerProfileId, limit) : Promise.resolve([]),
    ])
    if (listed.error) return []

    const rows = (listed.data as SpaceCircle[] | null) ?? []
    if (mine.length === 0) return rows

    // Merge the viewer's own (possibly unlisted) circles in, deduped, newest first, back under the
    // cap. Sorting here rather than trusting either query's order: the two are separate reads.
    const byId = new Map(rows.map((c) => [c.id, c]))
    for (const c of mine) byId.set(c.id, c)
    return [...byId.values()]
      .sort((a, b) => +new Date(b.created_at ?? 0) - +new Date(a.created_at ?? 0))
      .slice(0, limit)
  } catch {
    return []
  }
}

/**
 * The circle ids this profile is an ACTIVE member of. Request-cached, so the page that needs it to
 * decide "Join or Open" on each card and the reader that needs it to un-hide the viewer's own
 * unlisted circle pay for exactly one query between them.
 *
 * Empty set for a signed-out caller, and empty on any error — which errs toward showing Join to
 * someone already in, a wrong label, rather than toward hiding a circle they belong to.
 */
export const myActiveCircleIds = cache(async (profileId: string | null | undefined): Promise<Set<string>> => {
  if (!profileId) return new Set()
  try {
    const { data } = await createAdminClient()
      .from('memberships')
      .select('circle_id')
      .eq('profile_id', profileId)
      .eq('status', 'active')
      .limit(500)
    return new Set((data ?? []).map((m) => m.circle_id as string).filter(Boolean))
  } catch {
    return new Set()
  }
})

/** The viewer's OWN active circles inside one Space. Two bounded reads (their memberships, then
 *  those circles narrowed to this space), never a join, and [] on anything unexpected. */
async function myCirclesInSpace(
  admin: ReturnType<typeof createAdminClient>,
  spaceId: string,
  profileId: string,
  limit: number,
): Promise<SpaceCircle[]> {
  try {
    const ids = [...(await myActiveCircleIds(profileId))]
    if (ids.length === 0) return []
    const { data } = await admin
      .from('circles')
      .select(COLS)
      .eq('space_id', spaceId)
      .in('status', [...LISTABLE_CIRCLE_STATUS])
      .in('id', ids)
      .order('created_at', { ascending: false })
      .limit(limit)
    return (data as SpaceCircle[] | null) ?? []
  } catch {
    return []
  }
}

/**
 * A Space's Circles plus the Journey each one is currently running, for the Space's Circles
 * surface. A Circle a Space owns is where its people move through a program together; the Run
 * (journey_runs, ADR-252) is that Circle going through one Journey. At most one ACTIVE Run is
 * surfaced per Circle (the newest), which is what the Space's steward needs to see at a glance.
 *
 * Two reads, not a join: the circles list, then one batched Run lookup keyed by circle id.
 * FAIL-SAFE like its sibling above, a bad Run read degrades to circles with no Run shown rather
 * than an empty page.
 */
export async function listSpaceCirclesWithRuns(
  spaceId?: string | null,
  limit = 50,
): Promise<SpaceCircleWithRun[]> {
  const circles = await listCirclesForSpace(spaceId, limit)
  if (!circles.length) return []
  try {
    const admin = createAdminClient()
    const { data: runs } = await admin
      .from('journey_runs')
      .select('id, circle_id, plan_id, started_at, status')
      .in('circle_id', circles.map((c) => c.id))
      .eq('status', 'active')
      .order('started_at', { ascending: false })

    const rows = runs ?? []
    const planIds = [...new Set(rows.map((r) => r.plan_id))]
    const titles = new Map<string, { title: string; slug: string }>()
    if (planIds.length) {
      const { data: plans } = await admin
        .from('journey_plans')
        .select('id, title, slug')
        .in('id', planIds)
      for (const p of plans ?? []) titles.set(p.id, { title: p.title, slug: p.slug })
    }

    // Newest-first from the query, so the FIRST row seen per circle is the one to show.
    const byCircle = new Map<string, SpaceCircleWithRun['run']>()
    for (const r of rows) {
      if (byCircle.has(r.circle_id)) continue
      const plan = titles.get(r.plan_id)
      byCircle.set(r.circle_id, {
        id: r.id,
        planId: r.plan_id,
        journeyTitle: plan?.title ?? 'A Journey',
        journeySlug: plan?.slug ?? null,
        startedAt: r.started_at,
      })
    }
    return circles.map((c) => ({ ...c, run: byCircle.get(c.id) ?? null }))
  } catch {
    return circles.map((c) => ({ ...c, run: null }))
  }
}
