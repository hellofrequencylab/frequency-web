// Reads the persisted GLOBAL menu configuration (menu_config table) a janitor sets
// from /admin/menu. Unlike per-role access (area_permissions, lib/permissions.ts),
// this is the ONE shared menu shape applied to EVERY viewer: the operator's order
// and per-item visibility. Per-role gating still flows through area_permissions on
// top of whatever stays visible here.
//
// BEST-EFFORT by design: the read is service-role (so it works regardless of the
// caller's RLS context) and fully guarded. If the table doesn't exist yet (pre-
// migration) or the query errors, we return empty config and callers fall back to
// the code defaults (NAV_AREAS order, nothing hidden) — the app never breaks.

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { NAV_AREA_DEFAULTS, NAV_AREAS, type NavArea } from '@/lib/nav-areas'

export type MenuConfig = {
  /** Operator order: area_key → position. Lower comes first. */
  order: Map<string, number>
  /** Globally hidden area keys (removed from EVERYONE's menu). */
  hidden: Set<string>
}

/** Empty config = today's behavior (code order, nothing hidden). */
function emptyConfig(): MenuConfig {
  return { order: new Map(), hidden: new Set() }
}

/** All persisted menu overrides. Falls back to empty config on ANY error (incl. a
 *  missing table pre-migration) so the rail always renders. */
export async function getMenuConfig(): Promise<MenuConfig> {
  try {
    // `menu_config` isn't in the generated types yet — cast through the base client
    // to query it untyped, exactly as getAreaPermissions does for area_permissions.
    const db = createAdminClient() as unknown as SupabaseClient
    const { data, error } = await db
      .from('menu_config')
      .select('area_key, position, hidden')
    if (error) return emptyConfig()
    const order = new Map<string, number>()
    const hidden = new Set<string>()
    for (const row of (data ?? []) as { area_key: string; position: number | null; hidden: boolean | null }[]) {
      // Only honour rows for areas that still exist in code — a stale key is ignored.
      if (!(row.area_key in NAV_AREA_DEFAULTS)) continue
      if (typeof row.position === 'number') order.set(row.area_key, row.position)
      if (row.hidden) hidden.add(row.area_key)
    }
    return { order, hidden }
  } catch {
    return emptyConfig()
  }
}

/** NAV_AREAS reordered by the operator `position`, with hidden keys removed.
 *  Keys with no saved position keep their code order, appended after positioned ones
 *  (stable). Framework-light: pure array work, no React/Supabase. */
export function orderedVisibleAreas(config: MenuConfig): NavArea[] {
  const visible = NAV_AREAS.filter((a) => !config.hidden.has(a.key))
  // Stable sort: positioned items by position; everything else keeps code order,
  // sorted after the positioned ones. A large sentinel preserves code order for
  // unpositioned keys (their original index breaks ties below).
  const codeIndex = new Map(NAV_AREAS.map((a, i) => [a.key, i]))
  return [...visible].sort((a, b) => {
    const pa = config.order.has(a.key) ? config.order.get(a.key)! : Number.MAX_SAFE_INTEGER
    const pb = config.order.has(b.key) ? config.order.get(b.key)! : Number.MAX_SAFE_INTEGER
    if (pa !== pb) return pa - pb
    return (codeIndex.get(a.key) ?? 0) - (codeIndex.get(b.key) ?? 0)
  })
}
