// Reads the persisted per-area access overrides (area_permissions table) that a
// janitor sets from /admin/roles. Returns a map of area_key → access level; an
// area with no row simply isn't in the map, and callers fall back to the code
// default in lib/nav-areas.ts. Service-role read so it works regardless of the
// caller's RLS context; the values are non-sensitive (they drive menu muting).

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { NAV_AREA_DEFAULTS, type NavAccess } from '@/lib/nav-areas'

const VALID = new Set<NavAccess>(['visitor', 'member', 'crew', 'host', 'guide', 'mentor', 'admin', 'janitor'])

/** All persisted overrides, keyed by area_key. Falls back to {} on any error. */
export async function getAreaPermissions(): Promise<Record<string, NavAccess>> {
  try {
    // `area_permissions` isn't in the generated types yet — cast through the
    // base client to query it untyped.
    const db = createAdminClient() as unknown as SupabaseClient
    const { data } = await db.from('area_permissions').select('area_key, min_role')
    const out: Record<string, NavAccess> = {}
    for (const row of (data ?? []) as { area_key: string; min_role: string }[]) {
      // Only honour overrides for known areas with valid levels.
      if (row.area_key in NAV_AREA_DEFAULTS && VALID.has(row.min_role as NavAccess)) {
        out[row.area_key] = row.min_role as NavAccess
      }
    }
    return out
  } catch {
    return {}
  }
}
