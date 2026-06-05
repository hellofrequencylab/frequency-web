// The admin-module registry — the content engine for the page admin dock
// (EMBEDDED-ADMIN.md / ADR-133, Phase 2). Each module declares the scope it
// attaches to and the capability it requires; `modulesFor` filters the catalog by
// (scope kind × the viewer's resolved capabilities), so a tier's view is an
// emergent property of filtering — "same box format, more boxes" — not per-role
// branching. Mirrors the ADMIN_GROUPS catalog shape in app/(main)/admin/sections.ts.
//
// Today the dock renders the one shipped module (circle.settings) directly; as the
// @admin server slot lands, the dock will compose `modulesFor(scope, caps)` and
// render each module's Component. The catalog + filter are the durable seam.

import type { LucideIcon } from 'lucide-react'
import { Settings, Building2, Network } from 'lucide-react'
import type { Capability, Scope } from '@/lib/core/capabilities'

/** The Scope union's discriminant — where a module can attach. */
export type ScopeKind = Scope['kind']

/** Panel grouping for a module (modules render grouped + ordered by slot). */
export type AdminSlot = 'settings' | 'people' | 'content' | 'moderation' | 'insights' | 'danger'

export interface AdminModule {
  /** Stable id — e.g. 'circle.settings'. */
  id: string
  /** Header label shown on the module card. */
  label: string
  /** One-line purpose, shown under the header. */
  desc?: string
  Icon: LucideIcon
  /** Scope kinds this module is valid on. */
  scopes: readonly ScopeKind[]
  /**
   * The capability the viewer must hold (for THIS scope) to see the module —
   * gated against `resolveCapabilities(viewer, scope)`. Per-scope leadership,
   * membership, and entity state flow through automatically (no minRole ladder).
   * It names the SAME capability the module's server action re-checks: the gate
   * here is UX; the action is law (capabilities.ts).
   */
  requiredCapability: Capability
  slot: AdminSlot
  /** Vertical order within a slot. */
  order: number
}

export const ADMIN_MODULES: readonly AdminModule[] = [
  {
    id: 'circle.settings',
    label: 'Circle settings',
    desc: 'Name, description, type, capacity, and status — edited in place.',
    Icon: Settings,
    scopes: ['circle'],
    requiredCapability: 'circle.editSettings',
    slot: 'settings',
    order: 10,
  },
  {
    id: 'hub.settings',
    label: 'Hub settings',
    desc: 'Name and status — edited in place.',
    Icon: Building2,
    scopes: ['hub'],
    requiredCapability: 'hub.manage',
    slot: 'settings',
    order: 10,
  },
  {
    id: 'nexus.settings',
    label: 'Nexus settings',
    desc: 'Name, capacity, and status — edited in place.',
    Icon: Network,
    scopes: ['nexus'],
    requiredCapability: 'nexus.manage',
    slot: 'settings',
    order: 10,
  },
] as const

/** The modules to render for a scope, given the viewer's resolved capabilities. */
export function modulesFor(scope: Scope, caps: ReadonlySet<Capability>): AdminModule[] {
  return ADMIN_MODULES.filter(
    (m) => m.scopes.includes(scope.kind) && caps.has(m.requiredCapability),
  ).sort((a, b) => a.order - b.order)
}

/** Whether the Admin affordance should appear at all for this (scope, viewer). */
export function showsAdminPanel(scope: Scope, caps: ReadonlySet<Capability>): boolean {
  return modulesFor(scope, caps).length > 0
}

/** Look a module up by id (modules use this for their own label/icon/desc). */
export function moduleById(id: string): AdminModule | undefined {
  return ADMIN_MODULES.find((m) => m.id === id)
}
