// Pure per-route page-LAYOUT resolution (the module-assignment engine, ADR-270 + ADR-271):
// which modules show inside a page, in what order, and who may see each. Stored in
// page_settings.layout (jsonb) as { order, hidden, roles } and merged over the registry's
// default order. Two layers ride on top (ADR-271):
//   - SCOPE CASCADE — a config can be saved at the exact route, its top-level section
//     ('/seg/*'), or the global default ('*'); the most-specific level that carries any
//     assignment wins (full override), else the registry default.
//   - PER-MODULE ROLE GATE — `roles[moduleId]` = the lowest community rung that may SEE that
//     module (absent = everyone); applied at render against the viewer's effective role.
// Dependency-light (only the framework-independent role helpers) so it stays unit-tested and
// safe to import anywhere (server, client editor, or the save action).

import { atLeastRole, type CommunityRole } from '@/lib/core/roles'

export interface LayoutConfig {
  order: string[]
  hidden: string[]
  /** moduleId → lowest community rung that may see it. Absent key = visible to everyone. */
  roles: Record<string, CommunityRole>
}

/** The community rungs an operator can require to SEE a module (absent = everyone). Mirrors
 *  the page Status visibility ladder, minus the deprecated 'crew' no-op rung. */
export const MODULE_ROLES = ['host', 'guide', 'mentor'] as const
export type ModuleRole = (typeof MODULE_ROLES)[number]

export function isModuleRole(v: unknown): v is ModuleRole {
  return typeof v === 'string' && (MODULE_ROLES as readonly string[]).includes(v)
}

/** Coerce the stored jsonb into a safe LayoutConfig (string arrays + a validated roles map). */
export function parseLayout(raw: unknown): LayoutConfig {
  const empty: LayoutConfig = { order: [], hidden: [], roles: {} }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return empty
  const o = raw as { order?: unknown; hidden?: unknown; roles?: unknown }
  const arr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])
  const roles: Record<string, CommunityRole> = {}
  if (o.roles && typeof o.roles === 'object' && !Array.isArray(o.roles)) {
    for (const [id, val] of Object.entries(o.roles as Record<string, unknown>)) {
      if (isModuleRole(val)) roles[id] = val
    }
  }
  return { order: arr(o.order), hidden: arr(o.hidden), roles }
}

/** All module ids in resolved order: the saved order first (known ids only, de-duped), then
 *  any registry modules not yet placed (in registry order). Hidden ids are KEPT — the editor
 *  needs them; use resolveModuleIds for rendering. */
export function orderedModuleIds(config: LayoutConfig, allIds: readonly string[]): string[] {
  const known = new Set(allIds)
  const seen = new Set<string>()
  const out: string[] = []
  for (const id of config.order) {
    if (known.has(id) && !seen.has(id)) {
      out.push(id)
      seen.add(id)
    }
  }
  for (const id of allIds) {
    if (!seen.has(id)) {
      out.push(id)
      seen.add(id)
    }
  }
  return out
}

/** The ordered, ENABLED module ids (resolved order minus the hidden set). Role gates are NOT
 *  applied here — layer `applyRoleGate` on top for the live render. */
export function resolveModuleIds(config: LayoutConfig, allIds: readonly string[]): string[] {
  const hidden = new Set(config.hidden)
  return orderedModuleIds(config, allIds).filter((id) => !hidden.has(id))
}

/** Drop modules the viewer's role can't see (per-module min-role gate; absent = everyone).
 *  FAIL-CLOSED: an unknown/null viewer role hides any gated module, never over-exposing it. */
export function applyRoleGate(
  ids: string[],
  config: LayoutConfig,
  viewerRole: CommunityRole | null | undefined,
): string[] {
  return ids.filter((id) => {
    const min = config.roles[id]
    return !min || atLeastRole(viewerRole, min)
  })
}

// ─── Scope cascade (ADR-271) ───────────────────────────────────────────────────

/** A layout SCOPE key — a wildcard default for many routes: the global '*' or a top-level
 *  section '/seg/*'. A concrete route (e.g. '/lead') is NOT a scope key. */
export function isLayoutScopeKey(key: string): boolean {
  return key === '*' || /^\/[a-z0-9_-]+\/\*$/.test(key)
}

/** The scope keys that can carry a layout for a concrete route, MOST-SPECIFIC FIRST: the
 *  exact route, its top-level section ('/seg/*'), then the global default ('*'). */
export function layoutScopeChain(route: string): string[] {
  const seg = route.split('/').filter(Boolean)[0]
  const chain = [route]
  if (seg) chain.push(`/${seg}/*`)
  chain.push('*')
  return [...new Set(chain)]
}

/** True when a config carries any assignment at all (vs. an empty/inherited level). */
export function hasLayoutConfig(c: LayoutConfig): boolean {
  return c.order.length > 0 || c.hidden.length > 0 || Object.keys(c.roles).length > 0
}

/** Pick the effective config for a route from the saved configs by scope key: the
 *  MOST-SPECIFIC level (chain is ordered most-specific first) that carries any assignment
 *  wins (full override); else an empty config (= the registry default). */
export function pickLayoutConfig(
  chain: readonly string[],
  byKey: Record<string, LayoutConfig | undefined>,
): LayoutConfig {
  for (const key of chain) {
    const c = byKey[key]
    if (c && hasLayoutConfig(c)) return c
  }
  return { order: [], hidden: [], roles: {} }
}
