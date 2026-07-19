// Embeddable elements — PURE config + role resolution (docs/EMBEDDABLE-ELEMENTS.md §3).
//
// Resolves an element's effective settings + per-feature min-roles by layering defaults (the registry)
// <- the platform master <- a per-space override, then answers "may THIS viewer use this feature?" via
// the one role ladder, BY CONTEXT: a per-space mount gates on SpaceRole; a global mount on
// community_role + platform staff. No second permission system. PURE + framework-free (only the pure
// role helpers), so it is client-safe and unit-testable.

import { atLeastRole, isStaff, type CommunityRole, type WebRole } from '@/lib/core/roles'
import { atLeastSpaceRole, type SpaceRole } from '@/lib/spaces/membership'
import { ELEMENT_ROLES, type ElementDef, type ElementRole } from './registry'

/** The stored shape of one element_settings.config row (partial + sparse). */
export interface StoredElementConfig {
  /** Feature value overrides (toggle booleans / choice strings), keyed by feature key. */
  settings?: Record<string, boolean | string>
  /** Per-feature min-role overrides, keyed by feature key. */
  roles?: Record<string, ElementRole>
}

/** The viewer's role context for gating. In a Space, `spaceRole` drives it; globally, `communityRole`
 *  + `webRole` do. All optional (a signed-out viewer meets only 'everyone'). */
export interface ViewerRoleCtx {
  communityRole?: CommunityRole | null
  spaceRole?: SpaceRole | null
  webRole?: WebRole | null
}

/** Every feature's fully-resolved effective value + min-role. */
export interface ResolvedElement {
  settings: Record<string, boolean | string>
  roles: Record<string, ElementRole>
}

function isElementRole(v: unknown): v is ElementRole {
  return typeof v === 'string' && (ELEMENT_ROLES as readonly string[]).includes(v)
}

/** A feature-key write must never target a prototype-polluting property name (the roles map is keyed by
 *  caller-supplied strings from jsonb). Guards `normalizeElementConfig`'s dynamic writes. */
function isSafeFeatureKey(k: string): boolean {
  return k !== '__proto__' && k !== 'constructor' && k !== 'prototype'
}

/** Coerce a raw jsonb value into a clean StoredElementConfig (fail-safe: junk -> empty). The `roles`
 *  map is rebuilt key-by-key with a prototype-injection guard (the keys come from stored jsonb). */
export function normalizeElementConfig(raw: unknown): StoredElementConfig {
  if (!raw || typeof raw !== 'object') return {}
  const r = raw as Record<string, unknown>
  const out: StoredElementConfig = {}
  if (r.settings && typeof r.settings === 'object') {
    const settings: Record<string, boolean | string> = {}
    for (const [k, v] of Object.entries(r.settings as Record<string, unknown>)) {
      if (!isSafeFeatureKey(k)) continue
      if (typeof v === 'boolean' || typeof v === 'string') settings[k] = v
    }
    out.settings = settings
  }
  if (r.roles && typeof r.roles === 'object') {
    const roles: Record<string, ElementRole> = {}
    for (const [k, v] of Object.entries(r.roles as Record<string, unknown>)) {
      if (!isSafeFeatureKey(k)) continue
      if (isElementRole(v)) roles[k] = v
    }
    out.roles = roles
  }
  return out
}

/** Does `ctx` meet the required element role? BY CONTEXT: a SpaceRole (per-space mount) maps to the
 *  space ladder; otherwise the community ladder + platform staff. Staff always meets any tier. */
export function meetsElementRole(required: ElementRole, ctx: ViewerRoleCtx): boolean {
  const staff = isStaff(ctx.webRole)
  switch (required) {
    case 'everyone':
      return true
    case 'member':
      return staff || !!ctx.communityRole || !!ctx.spaceRole
    case 'editor':
      return staff || (ctx.spaceRole ? atLeastSpaceRole(ctx.spaceRole, 'editor') : atLeastRole(ctx.communityRole, 'host'))
    case 'admin':
      return staff || (ctx.spaceRole ? atLeastSpaceRole(ctx.spaceRole, 'admin') : atLeastRole(ctx.communityRole, 'mentor'))
    case 'staff':
      return staff
    default:
      return false
  }
}

/** Resolve an element's effective settings + roles: defaults (registry) <- each layer in order
 *  (platform master, then per-space override). Unknown/mistyped values are ignored (fail-safe). */
export function resolveElementConfig(
  def: ElementDef,
  ...layers: (StoredElementConfig | null | undefined)[]
): ResolvedElement {
  const settings: Record<string, boolean | string> = {}
  const roles: Record<string, ElementRole> = {}
  for (const f of def.features) {
    settings[f.key] = f.kind === 'toggle' ? f.defaultOn ?? false : f.default ?? f.choices?.[0]?.value ?? ''
    roles[f.key] = f.defaultRole
  }
  for (const layer of layers) {
    if (!layer) continue
    if (layer.settings) {
      for (const f of def.features) {
        if (!(f.key in layer.settings)) continue
        const v = layer.settings[f.key]
        if (f.kind === 'toggle' && typeof v === 'boolean') settings[f.key] = v
        else if (f.kind === 'choice' && typeof v === 'string' && f.choices?.some((c) => c.value === v)) settings[f.key] = v
      }
    }
    if (layer.roles) {
      for (const f of def.features) {
        const r = layer.roles[f.key]
        if (isElementRole(r)) roles[f.key] = r
      }
    }
  }
  return { settings, roles }
}

/** Is a feature AVAILABLE to this viewer? Toggle: on AND role met. Choice: role met (value read via
 *  elementChoice). A feature the viewer's role does not meet is hidden regardless of its toggle. */
export function elementFeatureOn(
  def: ElementDef,
  resolved: ResolvedElement,
  key: string,
  ctx: ViewerRoleCtx,
): boolean {
  const f = def.features.find((x) => x.key === key)
  if (!f) return false
  if (!meetsElementRole(resolved.roles[key] ?? f.defaultRole, ctx)) return false
  if (f.kind === 'toggle') return resolved.settings[key] === true
  return true
}

/** The resolved value of a choice feature (empty string if unset/unknown). */
export function elementChoice(resolved: ResolvedElement, key: string): string {
  const v = resolved.settings[key]
  return typeof v === 'string' ? v : ''
}
