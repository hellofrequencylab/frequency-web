// The entity registry — Pass 1 of the Entity Management Overhaul (ADR-441, EM1-1).
//
// One source of truth for WHICH manageable surfaces each entity type exposes,
// declared against the 9-category spine (EMBEDDED-ADMIN.md / ADR-137). It is the
// L1 catalog the owner console (`/{entity}/[id]/manage`, EM1-2) composes: a console
// asks `surfacesFor(entity, viewerCaps)` and renders one section per surface it gets
// back, in spine order. Each surface names the capability it requires; the server
// action behind each surface re-checks the SAME capability (capabilities are law,
// lib/core/capabilities.ts) — the console gate is UX, the action is the authority.
//
// This is deliberately MINIMAL for Pass 1 — circle's Basics + Danger only. The
// People module (and the member-role ladder) is deferred to a later slice because it
// needs a migration; Place&Time / Engage / Reach / Comms / Safety / Insights are the
// bulk of Pass 2 (EM2-1, Appendix A). Adding a surface here is one row, never a new
// console layout.
//
// Pure metadata: no React, no Supabase. The console binds each surface id to its
// component at the render boundary (mirrors the admin module-map pattern, ADR-250),
// so this file can be imported by client and server alike and unit-tested in isolation.

import type { AdminSlot } from '@/lib/admin/modules/registry'
import type { Capability, Scope } from '@/lib/core/capabilities'

/** The entity types the framework manages. Pass 1 ships `circle`; the rest are the
 *  same shape and land as their surfaces are declared (Pass 1 EM1-3..EM1-5, Pass 2). */
export type ManagedEntity = Scope['kind']

/**
 * One manageable surface of an entity: a spine slot + the capability that gates it.
 * The `id` is a stable handle (`'<entity>.<slot>'`) the console maps to a component.
 */
export interface EntitySurface {
  /** Stable id, e.g. 'circle.basics' — the binding key the console renders by. */
  id: string
  /** The entity type this surface belongs to. */
  entity: ManagedEntity
  /** The spine category (orders the console's sections). */
  slot: AdminSlot
  /** Section header shown in the console. */
  label: string
  /** One plain line under the header (CONTENT-VOICE: no em dashes). */
  desc: string
  /** The capability the viewer must hold (for THIS entity's scope) to see + use the
   *  surface — gated against `resolveCapabilities(viewer, scope)`. Names the SAME
   *  capability the surface's server action re-checks. */
  requiredCapability: Capability
}

// Spine display order — the console renders surfaces in this order regardless of
// declaration order (mirrors the 9-category spine; only the Pass-1 slots are used yet).
const SPINE_ORDER: readonly AdminSlot[] = [
  'basics',
  'place',
  'people',
  'layout',
  'engage',
  'reach',
  'comms',
  'safety',
  'insights',
  'billing', // no core entity surface uses it yet; kept for spine parity with the module catalog
  'danger',
]

/**
 * The declared surfaces, per entity. Pass 1 (EM1-1) shipped circle; this rollout
 * (EM1-3) adds hub, nexus, event, and practice — the SAME registry-driven console,
 * one row per surface. Each surface names the capability its server action re-checks:
 *
 *   circle   → circle.editSettings  (deleteCircle + circle settings module)
 *   hub      → hub.manage           (hub settings module)
 *   nexus    → nexus.manage         (nexus settings module)
 *   event    → event.editSettings   (event settings + deleteEvent)
 *   practice → practice.editSettings (practice settings module embeds DangerDelete)
 *
 * Every entity gets Basics + Danger, mirroring circle. The console binds each id to
 * its component (see each `/manage` console.tsx); a Danger surface whose entity has no
 * standalone destructive control yet (hub, nexus) renders header-only, exactly like
 * circle's Danger today (its delete is embedded in the basics module). When those
 * entities gain a delete action, the Danger binding gains its control with no registry
 * change. NOTE: `space` is NOT in this array. A Space is not part of the unified
 * Scope/Capability spine (it has its own lib/spaces/entitlements.ts + functions.ts
 * world), so it cannot be a `Capability`-gated `EntitySurface`. The space menu is the
 * ONE module system (lib/admin/modules/space-modules.ts SPACE_MODULES + spaceModuleManifest),
 * gated by a `SpaceFunctionKey` + role; the rail and the /manage console both render from it.
 */
export const ENTITY_SURFACES: readonly EntitySurface[] = [
  // ── circle (EM1-1) ──────────────────────────────────────────────────────────
  {
    id: 'circle.basics',
    entity: 'circle',
    slot: 'basics',
    label: 'Basics',
    desc: 'Name, description, cover, type, capacity, status, and permalink.',
    requiredCapability: 'circle.editSettings',
  },
  {
    id: 'circle.danger',
    entity: 'circle',
    slot: 'danger',
    label: 'Danger zone',
    desc: 'Archive or delete this circle. These actions cannot be undone.',
    requiredCapability: 'circle.editSettings',
  },
  // ── hub (EM1-3) ─────────────────────────────────────────────────────────────
  {
    id: 'hub.basics',
    entity: 'hub',
    slot: 'basics',
    label: 'Basics',
    desc: 'Name and status for this hub.',
    requiredCapability: 'hub.manage',
  },
  {
    id: 'hub.danger',
    entity: 'hub',
    slot: 'danger',
    label: 'Danger zone',
    desc: 'Archive or delete this hub. These actions cannot be undone.',
    requiredCapability: 'hub.manage',
  },
  // ── nexus (EM1-3) ───────────────────────────────────────────────────────────
  {
    id: 'nexus.basics',
    entity: 'nexus',
    slot: 'basics',
    label: 'Basics',
    desc: 'Name, member cap, and status for this nexus.',
    requiredCapability: 'nexus.manage',
  },
  {
    id: 'nexus.danger',
    entity: 'nexus',
    slot: 'danger',
    label: 'Danger zone',
    desc: 'Archive or delete this nexus. These actions cannot be undone.',
    requiredCapability: 'nexus.manage',
  },
  // ── event (EM1-3) ───────────────────────────────────────────────────────────
  {
    id: 'event.basics',
    entity: 'event',
    slot: 'basics',
    label: 'Basics',
    desc: 'Title, description, cover, location, time, and permalink.',
    requiredCapability: 'event.editSettings',
  },
  {
    id: 'event.danger',
    entity: 'event',
    slot: 'danger',
    label: 'Danger zone',
    desc: 'Delete this event. This cannot be undone.',
    requiredCapability: 'event.editSettings',
  },
  // ── practice (EM1-3) ────────────────────────────────────────────────────────
  {
    id: 'practice.basics',
    entity: 'practice',
    slot: 'basics',
    label: 'Basics',
    desc: 'Cover, title, summary, description, duration, category, and permalink.',
    requiredCapability: 'practice.editSettings',
  },
  {
    id: 'practice.danger',
    entity: 'practice',
    slot: 'danger',
    label: 'Danger zone',
    desc: 'Delete this practice. This cannot be undone.',
    requiredCapability: 'practice.editSettings',
  },
] as const

/**
 * The surfaces an owner console should render for `entity`, given the viewer's
 * resolved capability set for that entity's scope, in spine order. A viewer who
 * holds none of an entity's gates gets an empty list (the console treats that as
 * "you do not manage this" and stays closed).
 */
export function surfacesFor(
  entity: ManagedEntity,
  viewerCaps: ReadonlySet<Capability>,
): EntitySurface[] {
  return ENTITY_SURFACES.filter(
    (s) => s.entity === entity && viewerCaps.has(s.requiredCapability),
  ).sort((a, b) => SPINE_ORDER.indexOf(a.slot) - SPINE_ORDER.indexOf(b.slot))
}

/** Whether the owner console should be reachable at all for this (entity, viewer). */
export function managesEntity(
  entity: ManagedEntity,
  viewerCaps: ReadonlySet<Capability>,
): boolean {
  return surfacesFor(entity, viewerCaps).length > 0
}
