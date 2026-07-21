// The Module Manager's persisted menu overrides (ADR-546, docs/MODULAR-MENU.md — P3). The Space owner may
// reorder the modules in their menu and hide the ones they do not use; those two overrides live in the
// spaces.preferences.moduleMenu jsonb node ({ order?: string[]; hidden?: string[] }) alongside every other
// preferences key. The owner's feature ON/OFF toggles are a SEPARATE concern (spaces.entitlements, written
// by setSpaceFeatureEnabled) — this node holds only the menu presentation overrides the pure
// `spaceModuleManifest(entitlements, { order, hidden })` reads.
//
// PURE + fail-safe (no IO): a partial / stale / hostile blob never breaks a render or lets the owner strand
// themselves. Every id is validated against the SPACE_MODULES catalog (unknown ids dropped), de-duplicated,
// and the hidden list additionally drops any UNHIDEABLE module (the shell config surfaces, Danger, and the
// Module Manager itself) so a garbage or malicious write can never remove the way back. Mirrors the
// fail-safe read contract of lib/spaces/profile-layout.ts.

import { SPACE_MODULES, isModuleHideable, isModuleAdvanced } from '@/lib/admin/modules/space-modules'

/** The owner's persisted menu overrides for a Space, ready to hand to `spaceModuleManifest`. */
export interface ModuleMenuPrefs {
  /** Module ids in the owner's preferred order; unlisted modules keep their catalog order, after these. */
  order: string[]
  /** Module ids the owner has hidden from the menu (never a shell / Danger / Module Manager id). */
  hidden: string[]
  /** ADVANCED module ids the owner has ACTIVATED from the control board (ADR-796). An advanced module stays
   *  collapsed until it appears here. Always present (default []), so production callers pass a real list
   *  and advanced modules are OFF by default. */
  activated: string[]
}

const VALID_IDS: ReadonlySet<string> = new Set(SPACE_MODULES.map((m) => m.id))

/** Keep only known, de-duplicated module ids from an unknown array, in order (defense in depth on the
 *  wire and on read). An optional `predicate` further filters (used to drop unhideable ids from `hidden`). */
function sanitizeIds(value: unknown, predicate: (id: string) => boolean = () => true): string[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const v of value) {
    if (typeof v !== 'string' || !VALID_IDS.has(v) || !predicate(v) || seen.has(v)) continue
    seen.add(v)
    out.push(v)
  }
  return out
}

/** Sanitize an owner-supplied order list to known, de-duplicated module ids. */
export function sanitizeModuleOrder(value: unknown): string[] {
  return sanitizeIds(value)
}

/** Sanitize an owner-supplied hidden list: known, de-duplicated, HIDEABLE ids only (never the shell /
 *  Danger / Module Manager — those can never be hidden). */
export function sanitizeHiddenModules(value: unknown): string[] {
  return sanitizeIds(value, isModuleHideable)
}

/** Sanitize an owner-supplied ACTIVATED list (ADR-796): known, de-duplicated, ADVANCED ids only. A
 *  non-advanced id is always shown, so activating it is a no-op — drop it to keep the blob minimal. */
export function sanitizeActivatedModules(value: unknown): string[] {
  return sanitizeIds(value, (id) => {
    const m = SPACE_MODULES.find((mod) => mod.id === id)
    return !!m && isModuleAdvanced(m)
  })
}

/** Read the Module Manager's `{ order, hidden }` overrides from a Space's preferences blob. Fail-safe:
 *  a missing / malformed node, or ids no longer in the catalog, resolve to empty lists; a hidden shell /
 *  Danger / Module Manager id is dropped. The result is safe to pass straight to `spaceModuleManifest`. */
export function readModuleMenuPrefs(preferences: unknown): ModuleMenuPrefs {
  const node =
    preferences && typeof preferences === 'object' && !Array.isArray(preferences)
      ? (preferences as Record<string, unknown>).moduleMenu
      : null
  const menu = node && typeof node === 'object' && !Array.isArray(node) ? (node as Record<string, unknown>) : {}
  return {
    order: sanitizeModuleOrder(menu.order),
    hidden: sanitizeHiddenModules(menu.hidden),
    activated: sanitizeActivatedModules(menu.activated),
  }
}
