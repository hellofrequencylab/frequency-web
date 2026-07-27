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

import { createAdminClient } from '@/lib/supabase/admin'
import { loadRootSpaceId } from '@/lib/spaces/store'

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
