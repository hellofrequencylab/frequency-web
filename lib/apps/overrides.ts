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
interface AppOverride {
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
export interface RawAppOverrideRow {
  app_id: unknown
  enabled?: unknown
  position?: unknown
  min_role?: unknown
}

/** Coerce one raw DB row into an AppOverride, or null if it fails validation (unknown App id,
 *  bad min_role). FAIL-CLOSED per field: a malformed value falls back to the permissive default
 *  (enabled true / no position / no floor) rather than throwing. */
function parseRow(row: RawAppOverrideRow): { id: string; override: AppOverride } | null {
  if (typeof row.app_id !== 'string') return null
  if (!appById(row.app_id)) return null // unknown App id ⇒ ignore (catalog is the authority)
  const enabled = row.enabled === false ? false : true
  const position = typeof row.position === 'number' && Number.isFinite(row.position) ? row.position : null
  const minRole = isModuleRole(row.min_role) ? row.min_role : null
  return { id: row.app_id, override: { enabled, position, minRole } }
}

/** Rows → the override map, each row re-validated (appById + min_role). PURE, and the ONE
 *  validation both readers share: the editor's direct read below and the shell's cross-request
 *  cached read (lib/layout/chrome-sources.ts, ADR-1243). */
export function parseAppOverrideRows(rows: readonly RawAppOverrideRow[]): AppOverrides {
  const out: AppOverrides = {}
  for (const row of rows) {
    const parsed = parseRow(row)
    if (parsed) out[parsed.id] = parsed.override
  }
  return out
}

/** All operator App overrides for one scope kind as a plain map (app_id → override). Service-role
 *  read so it works regardless of the caller's RLS context; REQUEST-CACHED via React.cache so it
 *  runs at most once per (request, scopeKey). FAIL-SAFE: returns `{}` on ANY error (incl. a
 *  missing table pre-migration), so the resolver always falls back to the catalog defaults and the
 *  rail never breaks. The dynamic import keeps this server-only dependency out of the module's top
 *  level (the pure helpers below stay client-safe). Each row is re-validated (appById + min_role)
 *  before use.
 *
 *  This is the EDITOR's read (/admin/page-layout/apps, lib/apps/for-scope.ts) and reads the table
 *  directly, so the manager shows the row an operator just saved. The SHELL reads the same table
 *  through `loadCachedAppOverrides` (lib/layout/chrome-sources.ts), cached across requests. */
export const loadAppOverrides = cache(async (scopeKey: string): Promise<AppOverrides> => {
  try {
    const { createAdminClient } = await import('@/lib/supabase/admin')
    // app_overrides isn't in the generated types until its migration is applied + typegen re-runs,
    // so reach it with an untyped client (the ADR-246 pattern used for page_settings / new tables).
    // Scope-kind defaults only (space_id IS NULL). The PER-SPACE layer is not this table: a Space hides
    // and reorders its own Apps in its Module Manager (spaces.preferences.moduleMenu, ADR-546b), which
    // appsForScope applies on the space branch (lib/apps/for-scope.ts applySpaceModuleMenu). The
    // reserved space_id column stays unused so there is one per-Space store, not two (LIVE-691).
    const db = createAdminClient() as unknown as {
      from: (t: string) => {
        select: (cols: string) => {
          eq: (col: string, val: string) => {
            is: (col: string, val: null) => Promise<{ data: RawAppOverrideRow[] | null; error: unknown }>
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
    return parseAppOverrideRows(data ?? [])
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

// ── An operator's GLOBAL disable wins on every scope (LIVE-686, ADR-1664) ──────────────────────
// Overrides are stored per scope KIND, and each page loaded only its own kind's rows. So an App an
// operator turned off at `global` ("off for everyone") still drew on any page whose scope is not
// global: the personal Profile / Spotlight / Layout editors mount only on /people/<handle>, which
// is the `profile` scope, so the global switch for them changed nothing anywhere. The fix lives in
// ONE resolver, `resolveScopeAppOverrides`, which both server readers go through (the shell's
// cached read in lib/layout/chrome-sources.ts, and `resolveAppsForScope`). It folds the global
// DISABLES, and only those, into the page scope's own map. A global `position` or `min_role` is
// about the global rail's order and floor and does not travel.

/** The scope key whose disables apply on every scope. */
export const GLOBAL_SCOPE_KEY = 'global'

/**
 * A scope's own overrides with every App the operator disabled at global scope also disabled. PURE.
 * The scope's own `position` / `minRole` for that App are kept; the global ones are not carried.
 * Returns `own` itself when there is nothing to fold (the common case: no global disables).
 */
export function withGlobalDisables(own: AppOverrides, global: AppOverrides): AppOverrides {
  let out: AppOverrides | null = null
  for (const [id, g] of Object.entries(global)) {
    if (g.enabled !== false || own[id]?.enabled === false) continue
    out ??= { ...own }
    out[id] = { enabled: false, position: own[id]?.position ?? null, minRole: own[id]?.minRole ?? null }
  }
  return out ?? own
}

/**
 * THE override map every App surface reads for a scope: that scope's own rows plus the global
 * disables (`withGlobalDisables`). `read` is the caller's fail-safe loader for one scope key (the
 * shell's cross-request cached read, or the editor's direct `loadAppOverrides`), so a failed read
 * of either key degrades to `{}` for that key and never breaks the rail. The global scope reads
 * once.
 */
export async function resolveScopeAppOverrides(
  scopeKey: string,
  read: (key: string) => Promise<AppOverrides>,
): Promise<AppOverrides> {
  if (scopeKey === GLOBAL_SCOPE_KEY) return read(scopeKey)
  const [own, global] = await Promise.all([read(scopeKey), read(GLOBAL_SCOPE_KEY)])
  return withGlobalDisables(own, global)
}

/** The Apps in `apps` whose override is not a disable. PURE. No reorder and no role floor: the
 *  presence-only half of `mergeAppOverrides`, for a set whose order and floor are not this scope's
 *  to set (the personal "You" set on a profile page). */
export function dropDisabledApps(apps: readonly App[], overrides: AppOverrides): App[] {
  return apps.filter((app) => overrides[app.id]?.enabled !== false)
}
