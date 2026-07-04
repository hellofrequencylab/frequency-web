// The derivation adapters (LP1 / ADR-502, docs/LOOM-PLATFORM.md §7) — App → the legacy registry shapes.
// This is the direction LP2 will call: `AdminModule` ← APPS.filter(editor).map(toAdminModule), etc., so
// each live registry keeps its exported shape and every call site is unchanged. PURE, no IO, no React.
//
// LP1 uses these to PROVE the composition round-trips byte-for-byte (catalog.test.ts): compose a legacy
// row into an App (catalog.ts), derive it back (here), and assert equality. When both directions agree
// on today's data, LP2 can safely flip the source of truth.

import type { AdminModule, AdminSlot, ScopeKind } from '@/lib/admin/modules/registry'
import type { LayoutModuleMeta } from '@/lib/widgets/modules'
import type { ElementDef, ElementRegistry, PillarSlug } from '@/lib/library/element-catalog'
import type { App } from './types'

/**
 * Derive the `AdminModule` for an editor App (byte-for-byte inverse of catalog.ts's editor composition).
 * Throws if the App is not a capability-gated editor App (the composition guarantees it is).
 */
export function toAdminModule(app: App): AdminModule {
  const editor = app.surfaces.editor
  if (!editor) throw new Error(`toAdminModule: App '${app.id}' has no editor surface`)
  if (app.gate.system !== 'capability') {
    throw new Error(`toAdminModule: App '${app.id}' is not capability-gated`)
  }
  const scopes: ScopeKind[] = app.scopes.flatMap((s) => (s.on === 'scopeKind' ? [s.kind] : []))
  const adminModule: AdminModule = {
    id: app.id,
    label: app.label,
    Icon: editor.Icon,
    scopes,
    requiredCapability: app.gate.capability,
    slot: app.category as AdminSlot,
    surface: editor.surface,
    render: editor.render,
    order: editor.order,
    // `tier` / `priority` are optional on AdminModule; carried back only when the source held them
    // (byte-for-byte, exactly like `render` — the three-tier rail axis, ADR-514 three-tier reorg).
    ...(editor.tier !== undefined ? { tier: editor.tier } : {}),
    ...(editor.priority !== undefined ? { priority: editor.priority } : {}),
    // `placement` (the uniform-rail axis, ADR-515) round-trips the same way — carried back only when the
    // source tagged a surface `bank` (a bank surface leaves the banded body, so it holds no tier/priority).
    ...(editor.placement !== undefined ? { placement: editor.placement } : {}),
    // `surfaces` (the per-module surface predicate, ADR-516 Phase B) round-trips by reference, exactly
    // like `render`/`tier` — carried back only when the source module set one.
    ...(editor.surfaces !== undefined ? { surfaces: editor.surfaces } : {}),
  }
  // `desc` is optional on AdminModule; include it only when the source carried one (byte-for-byte).
  return app.description !== undefined ? { ...adminModule, desc: app.description } : adminModule
}

/** Derive the `LayoutModuleMeta` for a page App (byte-for-byte inverse of the page composition). */
export function toLayoutMeta(app: App): LayoutModuleMeta {
  if (!app.surfaces.page) throw new Error(`toLayoutMeta: App '${app.id}' has no page surface`)
  return {
    id: app.id,
    label: app.label,
    // LAYOUT_MODULES always carries a description; the composition copies it, so this is exact.
    description: app.description ?? '',
  }
}

/** Derive the `ElementDef` for an element App (byte-for-byte inverse of the element composition). */
export function toElementDef(app: App): ElementDef {
  const el = app.surfaces.element
  if (!el) throw new Error(`toElementDef: App '${app.id}' has no element surface`)
  const def: ElementDef = {
    registry: el.registry as ElementRegistry,
    name: el.name,
    title: app.label,
    category: el.category ?? '',
    tags: el.tags ? [...el.tags] : [],
  }
  return el.pillar !== undefined ? { ...def, pillar: el.pillar as PillarSlug } : def
}
