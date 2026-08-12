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
import type { CircleDetail, MemberRow } from './detail-types'

/** A circle as the by-space read returns it (the columns the community module needs). */
export interface SpaceCircle {
  id: string
  slug: string
  name: string
  about: string | null
  type: string
  member_count: number
  status: string
  host_id: string | null
  space_id: string | null
  created_at: string | null
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

const COLS = 'id, slug, name, about, type, member_count, status, host_id, space_id, created_at'

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

// ── THE CIRCLE DETAIL SHELL READ (the tabbed detail route, PAGE-FRAMEWORK §3) ───────────────────

/** Everything the circle detail SHELL and every tab under it open on: the entity, the raw theme
 *  jsonb the header settings live in, and the roster in render order. */
export interface CircleShell {
  circle: CircleDetail
  /** Raw `circles.theme` jsonb — newer than the generated types, read through the ADR-246 seam. */
  theme: unknown
  /** Active members, host first then by join date (the order every roster surface renders). */
  members: MemberRow[]
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
 */
export const loadCircleShell = cache(async (slug: string): Promise<CircleShell | null> => {
  if (!slug) return null
  try {
    const admin = createAdminClient()
    const { data: rawCircle } = await admin
      .from('circles')
      .select(
        `id, name, slug, about, image_url, type, member_count, member_cap, status, is_demo, resonance_public,
         latitude, longitude, neighborhood, city, sidebar_order, theme,
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

    return { circle, theme: (rawCircle as unknown as { theme?: unknown }).theme, members }
  } catch {
    return null
  }
})

/**
 * Circles that BELONG TO a space, newest first. Defaults to the root space (so a caller that
 * passes no spaceId reads the root's circles, the canary). Filtered by space_id so a circle in
 * space A can never resolve for space B. FAIL-SAFE: [] on any error / missing tenant.
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
