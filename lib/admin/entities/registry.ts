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
import type { SpaceFunctionKey } from '@/lib/spaces/functions'
import type { SpaceType } from '@/lib/spaces/types'

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
  'billing', // space-only (EM1-3); no core entity surface uses it, the Space spine orders by it
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
 * world), so it cannot be a `Capability`-gated `EntitySurface`. Its spine is declared
 * separately below (SPACE_SURFACES) against the SAME 9-category order, gated by the
 * per-Space function resolver. See the SPACE_SURFACES block (EM1-3).
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

// ── Space spine (EM1-3) ──────────────────────────────────────────────────────────────────────
//
// A Space lives OUTSIDE the unified Scope/Capability spine (it has its own per-Space role ladder
// and entitlements/functions world — lib/spaces/membership.ts, entitlements.ts, functions.ts). So
// it cannot be an `EntitySurface` (those are `Capability`-gated). Instead it gets a PARALLEL
// declaration here against the SAME 9-category spine order, where each surface names a
// `SpaceFunctionKey` (the gate the per-Space resolver `spaceFunctionAccess` re-checks) and the
// Space TYPES that offer it. This is one source of truth for WHICH surfaces the Space owner console
// (/spaces/[slug]/manage, EM1-2) renders, in spine order; the console binds each id to the EXISTING
// settings sub-page (no feature is rebuilt). Adding a Space surface is one row here.
//
// SCOPE: this rollout (EM1-3) ships the `practitioner` and `organization` (nonprofit) types only.
// `business`, `event_space`, `lab`, and `partner` are INTENTIONALLY DEFERRED — their surfaces
// (memberships, tickets, check-in, lab/partner depth) are groundwork for a later slice. They keep
// working through the existing /spaces/[slug]/settings 7-tab cockpit, which is NOT retired here.

/** One manageable surface of a Space: a spine slot + the per-Space function that gates it + the
 *  Space types that offer it. The Space twin of `EntitySurface` (which the core Scope spine uses).
 *  The `id` is a stable handle (`'space.<slot>'`) the console maps to a sub-page binding. */
export interface SpaceSurface {
  /** Stable id, e.g. 'space.people' — the binding key the Space console renders by. */
  id: string
  /** The spine category (orders the console's sections, via SPINE_ORDER). */
  slot: AdminSlot
  /** Section header shown in the console. */
  label: string
  /** One plain line under the header (CONTENT-VOICE: no em dashes). */
  desc: string
  /** The per-Space function the viewer must be able to use (resolved by `spaceFunctionAccess`
   *  against the Space + their space role) to see + use the surface. The SAME gate the surface's
   *  settings sub-page re-checks server-side. `null` = an always-on surface (Basics / Danger) gated
   *  only by manage access (resolveSpaceManageAccess), not a per-tool function. */
  requiredFunction: SpaceFunctionKey | null
  /** The Space types that offer this surface ('*' = every provisionable type). EM1-3 ships the
   *  practitioner + organization rows; other types stay on the legacy cockpit until their slice. */
  types: readonly (SpaceType | '*')[]
}

/**
 * The declared Space surfaces, per the 9-category spine. Two type spines (EM1-3):
 *
 *   Practitioner: Basics · Place & Time (availability) · People (members) ·
 *                 Engage (CRM) · Reach (QR) · Comms (email) · Insights · Danger
 *   Organization: Basics · People (members) · Engage (donations + enrollment, money dormant) ·
 *                 Reach (QR) · Comms (email) · Insights · Billing · Danger
 *
 * Each surface's `requiredFunction` is the EXISTING per-Space function the legacy settings sub-page
 * already gates on (lib/spaces/functions.ts), so the console gate and the sub-page gate are the same
 * check. Basics + Danger carry `null` (no per-tool function — gated by manage access alone). The
 * money-adjacent organization surfaces (donations / enrollment) stay v1 display-only: the existing
 * sub-pages keep money dormant (no schema change here).
 */
export const SPACE_SURFACES: readonly SpaceSurface[] = [
  // Basics — profile, brand, visibility (the `profile` function gates the form; the surface itself
  // is always present for a manager). Every type.
  {
    id: 'space.basics',
    slot: 'basics',
    label: 'Basics',
    desc: 'Name, brand, about, and who can find this space.',
    requiredFunction: null,
    types: ['*'],
  },
  // Place & Time — the practitioner's weekly booking windows + upcoming bookings.
  {
    id: 'space.place',
    slot: 'place',
    label: 'Availability and bookings',
    desc: 'Set the weekly times members can book, and see who is on your calendar.',
    requiredFunction: 'availability',
    types: ['practitioner'],
  },
  // People — the team roster and the role each member holds. Every type.
  {
    id: 'space.people',
    slot: 'people',
    label: 'Members',
    desc: 'See who is on your team and the role each one holds.',
    requiredFunction: 'members',
    types: ['*'],
  },
  // Engage — the practitioner's CRM pipeline.
  {
    id: 'space.engage.crm',
    slot: 'engage',
    label: 'CRM',
    desc: 'Your pipeline and contacts, and private notes on the people you work with.',
    requiredFunction: 'crm',
    types: ['practitioner'],
  },
  // Engage — the nonprofit's hosted donation asks (money dormant in v1; the Donate CTA reads this).
  {
    id: 'space.engage.donations',
    slot: 'engage',
    label: 'Donations',
    desc: "Set up your fund, a short description, and the amounts supporters can pick.",
    requiredFunction: 'donations',
    types: ['organization'],
  },
  // Engage — the nonprofit's hosted program enrollment (money dormant in v1).
  {
    id: 'space.engage.enroll',
    slot: 'engage',
    label: 'Enrollment',
    desc: 'Define your program and see who has enrolled.',
    requiredFunction: 'enroll',
    types: ['organization'],
  },
  // Reach — QR codes for the space and the landing pages they open to. Every type.
  {
    id: 'space.reach',
    slot: 'reach',
    label: 'QR codes',
    desc: 'Create codes for your space and the landing page they open to.',
    requiredFunction: 'qr',
    types: ['*'],
  },
  // Comms — write a campaign, pick who gets it, and send or schedule it.
  {
    id: 'space.comms',
    slot: 'comms',
    label: 'Email',
    desc: 'Write a campaign, pick who gets it, and send or schedule it.',
    requiredFunction: 'email',
    types: ['practitioner', 'organization'],
  },
  // Insights — the space's analytics. Carried by the QR function today (the analytics surface lives
  // beside QR codes); a dedicated insights function lands when its own surface is built (Pass 2).
  {
    id: 'space.insights',
    slot: 'insights',
    label: 'Insights',
    desc: 'See how your codes and pages are performing.',
    requiredFunction: 'qr',
    types: ['practitioner', 'organization'],
  },
  // Billing — the plan ladder and what each plan unlocks (organization spine; the practitioner
  // reaches billing through the legacy cockpit until its own slice).
  {
    id: 'space.billing',
    slot: 'billing',
    label: 'Plan and billing',
    desc: 'See your current plan and what each plan unlocks.',
    requiredFunction: 'billing',
    types: ['organization'],
  },
  // Danger — delete this space (owner-grade, permanent). Gated by manage access + owner check in the
  // console, like the legacy cockpit; no per-tool function.
  {
    id: 'space.danger',
    slot: 'danger',
    label: 'Danger zone',
    desc: 'Delete this space and everything it owns. This cannot be undone.',
    requiredFunction: null,
    types: ['*'],
  },
] as const

/** Does a Space surface apply to a Space type? ('*' = every type.) */
function spaceSurfaceAppliesToType(surface: SpaceSurface, type: SpaceType): boolean {
  return surface.types.includes('*') || surface.types.includes(type)
}

/**
 * The surfaces the Space owner console should render, in spine order, given:
 *   - `type`     — the Space type (selects the type's spine), and
 *   - `canUse`   — a predicate the caller binds to the per-Space gate
 *                  (`(fn) => staffViewing || spaceFunctionAccess(space, fn, role)`), so the registry
 *                  stays PURE (no Supabase/Next import). A surface with a `requiredFunction` shows
 *                  only when `canUse(fn)` is true; an always-on surface (`requiredFunction: null`,
 *                  i.e. Basics / Danger) always shows (the page has already gated overall manage
 *                  access, and Danger adds its own owner check at the binding).
 *
 * A viewer who can use none of a type's surfaces still gets Basics + Danger (manage access is the
 * floor); the page gates the route itself on resolveSpaceManageAccess before calling this.
 */
export function spaceSurfacesFor(
  type: SpaceType,
  canUse: (fn: SpaceFunctionKey) => boolean,
): SpaceSurface[] {
  return SPACE_SURFACES.filter(
    (s) =>
      spaceSurfaceAppliesToType(s, type) &&
      (s.requiredFunction === null || canUse(s.requiredFunction)),
  ).sort((a, b) => SPINE_ORDER.indexOf(a.slot) - SPINE_ORDER.indexOf(b.slot))
}
