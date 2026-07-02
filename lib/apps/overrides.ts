// Per-scope App overrides for the standardized admin rail (docs/ADMIN-RAIL.md Phase 6). The
// FAIL-SAFE overlay that lets an operator enable / disable / reorder Apps per scope and set a
// per-App role FLOOR, merged OVER the code catalog defaults (lib/apps/catalog.ts APPS, resolved
// per scope by lib/apps/for-scope.ts appsForScope). Mirrors lib/layout/page-chrome.ts's chrome
// override layer exactly:
//   • loadAppOverrides(scopeKey) — request-cached, service-role, FAIL-SAFE {} on ANY error (incl.
//     a missing table pre-migration), so the resolver always falls back to catalog defaults and
//     the rail never breaks. The Supabase dependency is a DYNAMIC import, so this module's PURE
//     helpers (mergeAppOverrides / effectiveMinRole / scopeKeyFor) stay client-safe.
//   • mergeAppOverrides(apps, overrides) — PURE: drop disabled Apps, stable-sort by
//     `position ?? catalogIndex`. No IO, trivially testable.
//   • effectiveMinRole(appId, overrides) — PURE: the per-App role floor (or null).
//
// The role floor reuses the page_settings MODULE_ROLES semantics (host < guide < mentor); the
// render gate applies it with atLeastRole, exactly like resolveSlots's per-module role gate.

import { cache } from 'react'
import { appById } from './catalog'
import type { AdminScope } from '@/lib/layout/page-chrome'
import { MODULE_ROLES, isModuleRole, type ModuleRole } from '@/lib/page-settings/layout'
import type { App } from './types'

/** The role floor an override may set — the lowest community rung that may SEE an App at a scope
 *  (reuses the page-layout MODULE_ROLES ladder). NULL/absent ⇒ everyone the App's gate allows. */
export type AppMinRole = ModuleRole
export { MODULE_ROLES as APP_MIN_ROLES, isModuleRole as isAppMinRole }

/** One resolved override for an App at a scope. `enabled` false drops it; `position` reorders it
 *  within its category; `minRole` is the per-App role floor. Mirrors an app_overrides row. */
export interface AppOverride {
  enabled: boolean
  position: number | null
  minRole: AppMinRole | null
}

/** The overrides for a scope as a plain map (app_id → override). The reader's fail-safe value is
 *  `{}`, which mergeAppOverrides treats as "no overrides" (= the catalog defaults). */
export type AppOverrides = Record<string, AppOverride>

/** The override-store key for a scope — the scope KIND ('global' | 'circle' | 'event' | …).
 *  Mirrors page-chrome's route key, one level coarser (a whole scope kind, not one entity). */
export function scopeKeyFor(scope: AdminScope): string {
  return scope.kind
}

/** One raw app_overrides row as the untyped client returns it (all fields re-validated below). */
interface RawOverrideRow {
  app_id: unknown
  enabled?: unknown
  position?: unknown
  min_role?: unknown
}

/** Coerce one raw DB row into an AppOverride, or null if it fails validation (unknown App id,
 *  bad min_role). FAIL-CLOSED per field: a malformed value falls back to the permissive default
 *  (enabled true / no position / no floor) rather than throwing. */
function parseRow(row: RawOverrideRow): { id: string; override: AppOverride } | null {
  if (typeof row.app_id !== 'string') return null
  if (!appById(row.app_id)) return null // unknown App id ⇒ ignore (catalog is the authority)
  const enabled = row.enabled === false ? false : true
  const position = typeof row.position === 'number' && Number.isFinite(row.position) ? row.position : null
  const minRole = isModuleRole(row.min_role) ? row.min_role : null
  return { id: row.app_id, override: { enabled, position, minRole } }
}

/** All operator App overrides for one scope kind as a plain map (app_id → override). Service-role
 *  read so it works regardless of the caller's RLS context; REQUEST-CACHED via React.cache so it
 *  runs at most once per (request, scopeKey). FAIL-SAFE: returns `{}` on ANY error (incl. a
 *  missing table pre-migration), so the resolver always falls back to the catalog defaults and the
 *  rail never breaks. The dynamic import keeps this server-only dependency out of the module's top
 *  level (the pure helpers below stay client-safe). Each row is re-validated (appById + min_role)
 *  before use. */
export const loadAppOverrides = cache(async (scopeKey: string): Promise<AppOverrides> => {
  try {
    const { createAdminClient } = await import('@/lib/supabase/admin')
    // app_overrides isn't in the generated types until its migration is applied + typegen re-runs,
    // so reach it with an untyped client (the ADR-246 pattern used for page_settings / new tables).
    // Scope-kind defaults only today (space_id IS NULL); the per-space layer is Phase 2 (migration TODO).
    const db = createAdminClient() as unknown as {
      from: (t: string) => {
        select: (cols: string) => {
          eq: (col: string, val: string) => {
            is: (col: string, val: null) => Promise<{ data: RawOverrideRow[] | null; error: unknown }>
          }
        }
      }
    }
    const { data, error } = await db
      .from('app_overrides')
      .select('app_id, enabled, position, min_role')
      .eq('scope_key', scopeKey)
      .is('space_id', null)
    if (error) return {}
    const out: AppOverrides = {}
    for (const row of data ?? []) {
      const parsed = parseRow(row)
      if (parsed) out[parsed.id] = parsed.override
    }
    return out
  } catch {
    return {}
  }
})

/** The per-App role floor at a scope, or null when none is set. PURE. */
export function effectiveMinRole(appId: string, overrides: AppOverrides): AppMinRole | null {
  return overrides[appId]?.minRole ?? null
}

/**
 * Merge operator overrides OVER an ordered list of catalog Apps (PURE — no Supabase/React, so it
 * is trivially testable). Two effects, mirroring the app_overrides contract:
 *   1. DROP any App whose override has `enabled: false`.
 *   2. STABLE-SORT the survivors by `position ?? catalogIndex` — an override with an explicit
 *      `position` reorders that App; every App without one keeps its catalog order (the index it
 *      arrived at). Ties (equal effective positions) preserve the incoming order.
 * Identity when `overrides` is `{}` (the fail-safe value) — the catalog order is returned as-is.
 * Does NOT apply the min_role gate (that is a render-time viewer decision — see effectiveMinRole
 * + the resolveAppsForScope gate); it only governs presence + order.
 */
export function mergeAppOverrides(apps: readonly App[], overrides: AppOverrides): App[] {
  const kept = apps
    .map((app, index) => ({ app, index }))
    .filter(({ app }) => overrides[app.id]?.enabled !== false)
  kept.sort((a, b) => {
    const pa = overrides[a.app.id]?.position ?? a.index
    const pb = overrides[b.app.id]?.position ?? b.index
    if (pa !== pb) return pa - pb
    return a.index - b.index // stable: equal effective positions keep catalog order
  })
  return kept.map(({ app }) => app)
}
