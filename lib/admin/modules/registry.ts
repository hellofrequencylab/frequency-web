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
import { Settings, Building2, Network, CalendarDays, Hash, Type, Sparkles, Clock, Users, Ticket } from 'lucide-react'
import type { Capability, Scope } from '@/lib/core/capabilities'

/** The Scope union's discriminant — where a module can attach. */
export type ScopeKind = Scope['kind']

/** The 9-category spine (EMBEDDED-ADMIN.md / ADR-137) — a module's category. */
export type AdminSlot =
  | 'basics'
  | 'place'
  | 'people'
  | 'layout'
  | 'engage'
  | 'reach'
  | 'comms'
  | 'safety'
  | 'insights'
  // Space-only category (ENTITY-MANAGEMENT-OVERHAUL §4 / Appendix A): a Space's plan ladder + billing.
  // No core module uses it yet (the unified entity registry has no billing surface); it exists so the
  // parallel Space spine (lib/admin/entities/registry.ts SPACE_SURFACES, EM1-3) can order a billing
  // section. Sits just before Danger, mirroring the entity x spine matrix.
  | 'billing'
  | 'danger'

/** Which surface renders a module (ADR-138): `inline` = tune, on the page ·
 *  `sidebar` = manage, in the page admin dock. */
export type AdminSurface = 'inline' | 'sidebar'

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
  /** The spine category this module belongs to. */
  slot: AdminSlot
  /** Which surface renders it — inline (tune) or sidebar (manage). ADR-138. */
  surface: AdminSurface
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
    slot: 'basics',
    surface: 'sidebar',
    order: 10,
  },
  {
    id: 'circle.text',
    label: 'Page text',
    desc: 'A free text block you can place anywhere on the page from Layout. Supports bold, italic, and links.',
    Icon: Type,
    scopes: ['circle'],
    requiredCapability: 'circle.editSettings',
    slot: 'basics',
    surface: 'sidebar',
    order: 15,
  },
  {
    id: 'hub.settings',
    label: 'Hub settings',
    desc: 'Name and status — edited in place.',
    Icon: Building2,
    scopes: ['hub'],
    requiredCapability: 'hub.manage',
    slot: 'basics',
    surface: 'sidebar',
    order: 10,
  },
  {
    id: 'nexus.settings',
    label: 'Nexus settings',
    desc: 'Name, capacity, and status — edited in place.',
    Icon: Network,
    scopes: ['nexus'],
    requiredCapability: 'nexus.manage',
    slot: 'basics',
    surface: 'sidebar',
    order: 10,
  },
  {
    id: 'event.settings',
    label: 'Event settings',
    desc: 'Title, description, location, and time — edited in place.',
    Icon: CalendarDays,
    scopes: ['event'],
    requiredCapability: 'event.editSettings',
    slot: 'basics',
    surface: 'sidebar',
    order: 10,
  },
  {
    id: 'event.placeAndTime',
    label: 'Place & Time',
    desc: 'When and where: start and end, time zone, repeats, the venue and map, and the booking window.',
    Icon: Clock,
    scopes: ['event'],
    requiredCapability: 'event.editSettings',
    slot: 'place',
    surface: 'sidebar',
    order: 10,
  },
  {
    id: 'event.people',
    label: 'People',
    desc: 'Your guests: RSVPs, approvals, the waitlist, and how full the event is.',
    Icon: Users,
    scopes: ['event'],
    requiredCapability: 'event.editSettings',
    slot: 'people',
    surface: 'sidebar',
    order: 10,
  },
  {
    id: 'event.engage',
    label: 'Engage',
    desc: 'Tickets, sales, and check-in.',
    Icon: Ticket,
    scopes: ['event'],
    requiredCapability: 'event.editSettings',
    slot: 'engage',
    surface: 'sidebar',
    order: 10,
  },
  {
    id: 'practice.settings',
    label: 'Practice settings',
    desc: 'Cover, title, summary and details — edited in place.',
    Icon: Sparkles,
    scopes: ['practice'],
    requiredCapability: 'practice.editSettings',
    slot: 'basics',
    surface: 'sidebar',
    order: 10,
  },
  {
    id: 'channel.settings',
    label: 'Channel settings',
    desc: 'Name, description, category, and visibility — platform-curated, staff only.',
    Icon: Hash,
    scopes: ['channel'],
    requiredCapability: 'channel.manage',
    slot: 'basics',
    surface: 'sidebar',
    order: 10,
  },
  // The profile "Person settings" module was retired (ADR-133/PX.5): editing a
  // profile's name/handle/bio now lives in the dedicated Edit Profile flow
  // (/settings/profile for the owner; the full member manager for moderators), so
  // the profile settings column no longer surfaces a person-settings box.
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

/** Modules for a scope on one surface — inline (tune) vs sidebar (manage). ADR-138. */
export function modulesForSurface(
  scope: Scope,
  caps: ReadonlySet<Capability>,
  surface: AdminSurface,
): AdminModule[] {
  return modulesFor(scope, caps).filter((m) => m.surface === surface)
}

/**
 * Registry-driven SELECTION by scope kind, independent of a resolved capability set
 * (ADR-250 step 1). The page admin dock is a client surface without the server-resolved
 * caps, but the fine gate already lives server-side — every module's action returns null
 * unless the caller holds `requiredCapability` — so the dock selects which modules *exist*
 * for a scope kind from the catalog and lets each self-gate. This is what lets the dock
 * stop dispatching by hardcoded pathname regex: register a module here and it appears.
 * When resolved caps are threaded through (a later refinement), the dock switches to the
 * caps-aware `modulesForSurface(scope, caps, surface)` above with no change to the catalog.
 */
export function modulesForScopeKind(kind: ScopeKind, surface?: AdminSurface): AdminModule[] {
  return ADMIN_MODULES.filter(
    (m) => m.scopes.includes(kind) && (surface === undefined || m.surface === surface),
  ).sort((a, b) => a.order - b.order)
}

/** Look a module up by id (modules use this for their own label/icon/desc). */
export function moduleById(id: string): AdminModule | undefined {
  return ADMIN_MODULES.find((m) => m.id === id)
}
