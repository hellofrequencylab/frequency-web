// Pure per-route page-LAYOUT resolution (the module-assignment engine, ADR-270/271/272): which
// interior TEMPLATE a page uses, which modules sit in each of its AREAS (slots), in what order,
// and who may see each. Stored in page_settings.layout (jsonb) as { template, slots }, where each
// slot is { order, hidden, roles }. Three layers ride on top:
//   - TEMPLATE + SLOTS (ADR-272) — a module is assigned to one slot of the chosen template; any
//     unplaced module falls into the template's default (first) slot.
//   - SCOPE CASCADE (ADR-271) — a config can be saved at the exact route, its section ('/seg/*'),
//     or the global default ('*'); the most-specific level that carries any assignment wins.
//   - PER-MODULE ROLE GATE (ADR-271) — slot.roles[id] = the lowest community rung that may SEE a
//     module (absent = everyone); applied at render against the viewer's effective role.
// BACKWARD-COMPATIBLE: a legacy flat config ({ order, hidden, roles }) reads as the `main` slot of
// the Single template. Dependency-light (only framework-independent helpers) so it stays
// unit-tested and safe to import anywhere (server, client editor, or the save action).

import { atLeastRole, type CommunityRole } from '@/lib/core/roles'
import { type TemplateId, isTemplateId, slotIds, defaultSlotId } from '@/lib/widgets/templates'

/** One area's assignment: the modules placed in it (order), which are hidden, and per-module
 *  role gates. */
export interface SlotConfig {
  order: string[]
  hidden: string[]
  roles: Record<string, CommunityRole>
}

export interface LayoutConfig {
  template: TemplateId
  /** Keyed by slot id (the template's slots); a missing slot = empty. */
  slots: Record<string, SlotConfig>
}

/** The community rungs an operator can require to SEE a module (absent = everyone). Mirrors
 *  the page Status visibility ladder, minus the deprecated 'crew' no-op rung. */
export const MODULE_ROLES = ['host', 'guide', 'mentor'] as const
export type ModuleRole = (typeof MODULE_ROLES)[number]

export function isModuleRole(v: unknown): v is ModuleRole {
  return typeof v === 'string' && (MODULE_ROLES as readonly string[]).includes(v)
}

const emptySlot = (): SlotConfig => ({ order: [], hidden: [], roles: {} })
const emptyLayout = (): LayoutConfig => ({ template: 'single', slots: {} })

const strArr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])

function parseRoles(v: unknown): Record<string, CommunityRole> {
  const roles: Record<string, CommunityRole> = {}
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    for (const [id, val] of Object.entries(v as Record<string, unknown>)) {
      if (isModuleRole(val)) roles[id] = val
    }
  }
  return roles
}

function parseSlot(raw: unknown): SlotConfig {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return emptySlot()
  const o = raw as { order?: unknown; hidden?: unknown; roles?: unknown }
  return { order: strArr(o.order), hidden: strArr(o.hidden), roles: parseRoles(o.roles) }
}

/** Coerce the stored jsonb into a safe LayoutConfig. Accepts the new { template, slots } shape
 *  AND the legacy flat { order, hidden, roles } shape (→ Single template, `main` slot). */
export function parseLayout(raw: unknown): LayoutConfig {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return emptyLayout()
  const o = raw as { template?: unknown; slots?: unknown; order?: unknown; hidden?: unknown; roles?: unknown }
  if (o.slots && typeof o.slots === 'object' && !Array.isArray(o.slots)) {
    const template: TemplateId = isTemplateId(o.template) ? o.template : 'single'
    const slots: Record<string, SlotConfig> = {}
    for (const [slotId, slotRaw] of Object.entries(o.slots as Record<string, unknown>)) {
      slots[slotId] = parseSlot(slotRaw)
    }
    return { template, slots }
  }
  // Legacy flat config (ADR-270/271): treat as the Single template's `main` slot.
  if (o.order !== undefined || o.hidden !== undefined || o.roles !== undefined) {
    return { template: 'single', slots: { main: parseSlot(o) } }
  }
  return emptyLayout()
}

const slotOf = (config: LayoutConfig, slotId: string): SlotConfig => config.slots[slotId] ?? emptySlot()

/** A module assigned to a slot, with its on/off + role-gate state, for the editor. */
export interface ModuleAssignment {
  id: string
  slot: string
  enabled: boolean
  role: CommunityRole | null
}

/** Every known module mapped to a slot of the config's template, in render order (each slot's
 *  placed modules first in template-slot order, then any unplaced module appended to the default
 *  slot). De-duped across slots (first slot that lists a module wins). Hidden + role state are
 *  carried, NOT applied — this is the editor's view. */
export function moduleAssignments(config: LayoutConfig, allIds: readonly string[]): ModuleAssignment[] {
  const known = new Set(allIds)
  const slots = slotIds(config.template)
  const def = defaultSlotId(config.template)
  const seen = new Set<string>()
  const out: ModuleAssignment[] = []
  for (const slotId of slots) {
    const sc = slotOf(config, slotId)
    const hidden = new Set(sc.hidden)
    for (const id of sc.order) {
      if (!known.has(id) || seen.has(id)) continue
      seen.add(id)
      out.push({ id, slot: slotId, enabled: !hidden.has(id), role: sc.roles[id] ?? null })
    }
  }
  for (const id of allIds) {
    if (seen.has(id)) continue
    seen.add(id)
    out.push({ id, slot: def, enabled: true, role: null })
  }
  return out
}

/** The ordered, VISIBLE module ids per slot for rendering: module assignments minus the hidden
 *  set, minus any the viewer's role can't see (per-module gate). FAIL-CLOSED on role: a
 *  null/unknown viewer role hides every gated module. Returns a map keyed by the template's slot
 *  ids (only non-empty slots are included). */
export function resolveSlots(
  config: LayoutConfig,
  allIds: readonly string[],
  viewerRole: CommunityRole | null | undefined,
): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  for (const a of moduleAssignments(config, allIds)) {
    if (!a.enabled) continue
    if (a.role && !atLeastRole(viewerRole, a.role)) continue
    ;(out[a.slot] ??= []).push(a.id)
  }
  return out
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

/** True when a config carries any assignment at all (a non-default template, or any slot with
 *  order / hidden / roles set) — vs. an empty/inherited level. */
export function hasLayoutConfig(c: LayoutConfig): boolean {
  if (c.template !== 'single') return true
  return Object.values(c.slots).some(
    (s) => s.order.length > 0 || s.hidden.length > 0 || Object.keys(s.roles).length > 0,
  )
}

/** Pick the effective config for a route from the saved configs by scope key: the
 *  MOST-SPECIFIC level (chain is ordered most-specific first) that carries any assignment wins
 *  (full override); else an empty config (= the registry default, Single template). */
export function pickLayoutConfig(
  chain: readonly string[],
  byKey: Record<string, LayoutConfig | undefined>,
): LayoutConfig {
  for (const key of chain) {
    const c = byKey[key]
    if (c && hasLayoutConfig(c)) return c
  }
  return emptyLayout()
}
