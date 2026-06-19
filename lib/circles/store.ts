// Circles tenancy data layer (Phase 0, ENTITY-SPACES-BUILD Epic 0.3 / ENTITY-SPACES-SYSTEM
// §4.3). Two seams the per-space profile work (Phase 1) needs:
//   - stampCircleSpaceId(): the DEFAULT space_id for a new circle — the root space (via
//     loadRootSpaceId), so new circles created through the existing single-tenant flows are
//     space-stamped to root and nothing changes today. A space-scoped caller passes its own id.
//   - listCirclesForSpace(): the by-space read the Phase 1 profile's `entity-community` module
//     uses to list a Space's own circles.
//
// Server-only (admin client; callers enforce authz, exactly like the existing circle flows).
// `space_id` is not in the generated DB types yet — the column is added by
// 20260711000000_object_space_id.sql; per the codebase pattern (ADR-246) it is reached with
// untyped casts (the payload field + the `.eq('space_id', …)` filter), not a typed client.

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
    // space_id isn't in the generated types yet — reach it with an untyped handle (ADR-246).
    const q = createAdminClient().from('circles') as unknown as {
      select: (cols: string) => {
        eq: (col: string, val: string) => {
          order: (col: string, opts: { ascending: boolean }) => {
            limit: (n: number) => Promise<{ data: unknown; error: unknown }>
          }
        }
      }
    }
    const { data, error } = await q
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
