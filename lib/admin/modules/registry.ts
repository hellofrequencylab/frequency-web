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
import { Settings, Building2, Network, CalendarDays, Hash, Type, Sparkles, Clock, Users, Ticket, MapPin, Trophy, BarChart3, Archive, Palette, UserCircle, Bell, Radar, ShieldCheck, CreditCard, LayoutGrid } from 'lucide-react'
import type { Capability, Scope } from '@/lib/core/capabilities'

/** The Scope union's discriminant — where a module can attach. */
export type ScopeKind = Scope['kind']

/** The 9-category spine (EMBEDDED-ADMIN.md / ADR-137) — a module's category. */
export type AdminSlot =
  // Personal "You" section (ADMIN-RAIL.md Phase 4). NOT one of the 9 management categories: it holds
  // a signed-in member's OWN account settings and renders ABOVE the management spine. Deliberately
  // omitted from SPINE_ORDER's management run — spine.ts places it first, on its own.
  | 'account'
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
  /** How the STANDARDIZED admin bar draws this editor (inline-first rail, ADR below): `inline` mounts
   *  the editor component in the flattened bar ("everything in view"); `link` draws a compact link-row
   *  out to the feature's own management page. A SEPARATE axis from `surface` (tune-vs-manage, ADR-138):
   *  config surfaces render inline ("everything in view"); only feature workflows link out. Every core
   *  entity module + the personal config surfaces are `inline`; the personal feature workflows (Account
   *  and privacy, Billing) are `link` (ADR-514 Phase C/D). */
  render: 'inline' | 'link'
  /** Vertical order within a slot. */
  order: number
  /** The three-tier rail axis (ADR-514 three-tier reorg): which band this module renders in —
   *  `standard` (identity/profile, inline at the very top), `primary` (most-used management, ordered
   *  by importance) or `extra` (obscured under the "More" disclosure). ORTHOGONAL to `render`. */
  tier?: 'standard' | 'primary' | 'extra'
  /** Order WITHIN a tier (lower = higher up). Defaults to `order` when omitted. */
  priority?: number
  /** The uniform-rail placement axis (ADR-515): `inline` (default) renders the surface in the rail
   *  BODY; `bank` promotes it into the bottom bank button-grid (the fixed per-scope quick-links)
   *  instead. Default `inline` everywhere; nothing is tagged `bank` yet (later phases opt in). */
  placement?: 'inline' | 'bank'
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
    render: 'inline',
    order: 10,
    tier: 'standard',
    priority: 10,
  },
  // Circle 9-spine editor Apps (ADMIN-RAIL.md Phase 7, LP-EVENT recipe; ENTITY-MANAGEMENT-OVERHAUL
  // Appendix A, the Circle row). Each is gated per Appendix A and its server action re-checks the
  // same capability. Place & Time = the meeting location/type + time zone; People = the roster,
  // roles, capacity, and invites; Engage = the shared challenges the circle takes on together.
  // Declared before circle.text so this scope's declaration order stays monotonic by `order` (the
  // App catalog preserves declaration order while modulesFor* sorts by `order` — they must agree).
  {
    id: 'circle.placeAndTime',
    label: 'Place & Time',
    desc: 'Where and when your circle meets: in person or online, the area, and the time zone.',
    Icon: MapPin,
    scopes: ['circle'],
    requiredCapability: 'circle.editSettings',
    slot: 'place',
    surface: 'sidebar',
    render: 'inline',
    order: 10,
    tier: 'primary',
    priority: 20,
  },
  {
    id: 'circle.people',
    label: 'People',
    desc: 'Your members: the roster, roles, how full the circle is, and invites.',
    Icon: Users,
    scopes: ['circle'],
    requiredCapability: 'circle.moderate',
    slot: 'people',
    surface: 'sidebar',
    render: 'inline',
    order: 10,
    tier: 'primary',
    priority: 30,
  },
  {
    id: 'circle.engage',
    label: 'Engage',
    desc: 'The shared challenges your circle takes on together.',
    Icon: Trophy,
    scopes: ['circle'],
    requiredCapability: 'circle.assignTask',
    slot: 'engage',
    surface: 'sidebar',
    render: 'inline',
    order: 10,
    tier: 'primary',
    priority: 40,
  },
  // This week's practice (ADR-515 Phase 4, the CIRCLE rail). The host-assigned practice is an on-screen
  // function (the "This week's practice" card in the page body + the members' log button), so the rail gets
  // its own control for it — the picker extracted out of Circle Quest into a first-class engage module.
  // Gated circle.assignTask (the engage authority; its read action re-checks the SAME capability), and the
  // set action stays gated circle.editSettings (co-granted to a circle leader, so never weaker).
  {
    id: 'circle.practice',
    label: "This week's practice",
    desc: 'Set the practice your circle does together this week. It shows on the circle page for members to log.',
    Icon: Sparkles,
    scopes: ['circle'],
    requiredCapability: 'circle.assignTask',
    slot: 'engage',
    surface: 'sidebar',
    render: 'inline',
    order: 12,
    tier: 'primary',
    priority: 45,
  },
  // Circle insights (ADR-515 Phase 4). Circle health is an on-screen readout (zaps earned here, active
  // streaks, new this week), so the rail carries an at-a-glance insights module — INLINE, mirroring
  // hub.insights / nexus.insights / practice.insights (a circle has no standalone insights page, so there
  // is no non-circular bank destination; see ADR-515 Phase 4). Gated circle.editSettings; the read action
  // re-checks it and returns null for anyone else (fail-safe).
  {
    id: 'circle.insights',
    label: 'Insights',
    desc: 'Your circle at a glance: Zaps earned here, active streaks, and who joined this week.',
    Icon: BarChart3,
    scopes: ['circle'],
    requiredCapability: 'circle.editSettings',
    slot: 'insights',
    surface: 'sidebar',
    render: 'inline',
    order: 14,
    tier: 'extra',
    priority: 10,
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
    render: 'inline',
    order: 15,
    tier: 'standard',
    priority: 20,
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
    render: 'inline',
    order: 10,
    tier: 'standard',
    priority: 10,
  },
  // Hub 9-spine editor Apps (ADMIN-RAIL.md Phase 7, LP-EVENT recipe; ENTITY-MANAGEMENT-OVERHAUL
  // Appendix A, the Hub row). All gated hub.manage; each server action re-checks it. People = the
  // circles in this hub + the guide; Insights = the hub rollup (members, circles, average); Danger =
  // archive the hub. Reuse-only — the same circles-by-hub read the detail page already runs, and the
  // existing status column for archive; no new capability, no migration.
  {
    id: 'hub.people',
    label: 'People',
    desc: 'The circles in this hub, how full each is, and the guide who leads them.',
    Icon: Users,
    scopes: ['hub'],
    requiredCapability: 'hub.manage',
    slot: 'people',
    surface: 'sidebar',
    render: 'inline',
    order: 10,
    tier: 'primary',
    priority: 30,
  },
  // Hub layout (ADR-515 Phase 5, the 'layout' spine cell). Every rail carries a layout chooser (the owner
  // directive). The hub detail page is HAND-BUILT (fixed sections: identity → insight → circles), NOT
  // <PageModules>-driven, so there is no arrangeable block set to reorder — a real LayoutEditor would be a
  // broken picker. Instead this is a minimal, honest Layout affordance: it states the page uses a standard
  // fixed layout and links to the Manage console (where the hub's sections + settings live). Gated hub.manage;
  // the module self-fetches getHubAdminData (null for anyone else), so it renders nothing when unauthorized.
  {
    id: 'hub.layout',
    label: 'Layout',
    desc: 'The hub page uses a standard, fixed layout. Manage its sections from the console.',
    Icon: LayoutGrid,
    scopes: ['hub'],
    requiredCapability: 'hub.manage',
    slot: 'layout',
    surface: 'sidebar',
    render: 'inline',
    order: 10,
    tier: 'primary',
    priority: 50,
  },
  {
    id: 'hub.insights',
    label: 'Insights',
    desc: 'The hub at a glance: members reached, circles running, and the average per circle.',
    Icon: BarChart3,
    scopes: ['hub'],
    requiredCapability: 'hub.manage',
    slot: 'insights',
    surface: 'sidebar',
    render: 'inline',
    order: 10,
    tier: 'extra',
    priority: 10,
  },
  {
    id: 'hub.danger',
    label: 'Danger zone',
    desc: 'Archive this hub. Its circles stay put; the hub just stops appearing in listings.',
    Icon: Archive,
    scopes: ['hub'],
    requiredCapability: 'hub.manage',
    slot: 'danger',
    surface: 'sidebar',
    render: 'inline',
    order: 10,
    tier: 'extra',
    priority: 99,
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
    render: 'inline',
    order: 10,
    tier: 'standard',
    priority: 10,
  },
  // Nexus 9-spine editor Apps (ADMIN-RAIL.md Phase 7; ENTITY-MANAGEMENT-OVERHAUL Appendix A, the
  // Nexus row). All gated nexus.manage; each server action re-checks it. People = the hubs in this
  // nexus + the mentor; Insights = the nexus rollup (members, hubs, average, capacity); Danger =
  // archive the nexus. Reuse-only — the same hubs-by-nexus read the detail page runs, and the
  // existing status column for archive.
  {
    id: 'nexus.people',
    label: 'People',
    desc: 'The hubs in this nexus, the members behind each, and the mentor who leads them.',
    Icon: Users,
    scopes: ['nexus'],
    requiredCapability: 'nexus.manage',
    slot: 'people',
    surface: 'sidebar',
    render: 'inline',
    order: 10,
    tier: 'primary',
    priority: 30,
  },
  // Nexus layout (ADR-515 Phase 5). Same treatment as hub.layout: the nexus detail page is hand-built (fixed
  // sections: identity → insight → hubs), not <PageModules>-driven, so this is the minimal Layout affordance
  // pointing at the Manage console rather than a broken picker. Gated nexus.manage; self-fetches
  // getNexusAdminData (null for anyone else), fail-safe.
  {
    id: 'nexus.layout',
    label: 'Layout',
    desc: 'The nexus page uses a standard, fixed layout. Manage its sections from the console.',
    Icon: LayoutGrid,
    scopes: ['nexus'],
    requiredCapability: 'nexus.manage',
    slot: 'layout',
    surface: 'sidebar',
    render: 'inline',
    order: 10,
    tier: 'primary',
    priority: 50,
  },
  {
    id: 'nexus.insights',
    label: 'Insights',
    desc: 'The nexus at a glance: members reached, hubs running, capacity, and the average per hub.',
    Icon: BarChart3,
    scopes: ['nexus'],
    requiredCapability: 'nexus.manage',
    slot: 'insights',
    surface: 'sidebar',
    render: 'inline',
    order: 10,
    tier: 'extra',
    priority: 10,
  },
  {
    id: 'nexus.danger',
    label: 'Danger zone',
    desc: 'Archive this nexus. Its hubs stay put; the nexus just stops appearing in listings.',
    Icon: Archive,
    scopes: ['nexus'],
    requiredCapability: 'nexus.manage',
    slot: 'danger',
    surface: 'sidebar',
    render: 'inline',
    order: 10,
    tier: 'extra',
    priority: 99,
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
    render: 'inline',
    order: 10,
    tier: 'standard',
    priority: 10,
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
    render: 'inline',
    order: 10,
    tier: 'primary',
    priority: 20,
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
    render: 'inline',
    order: 10,
    tier: 'primary',
    priority: 30,
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
    render: 'inline',
    order: 10,
    tier: 'primary',
    priority: 40,
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
    render: 'inline',
    order: 10,
    tier: 'standard',
    priority: 10,
  },
  // Practice 9-spine editor App (ADMIN-RAIL.md Phase 7; ENTITY-MANAGEMENT-OVERHAUL Appendix A, the
  // Practice row). Insights = adoption + logging counts, read from the practices_ranked view the
  // library already maintains; gated practice.editSettings, re-checked server-side. (Engage/rewards
  // is deferred: the reward seam is admin-governed, not owner-gated — no reuse-only owner seam.)
  {
    id: 'practice.insights',
    label: 'Insights',
    desc: 'How this practice is landing: people who kept it, logs in the last 30 days, and all-time.',
    Icon: BarChart3,
    scopes: ['practice'],
    requiredCapability: 'practice.editSettings',
    slot: 'insights',
    surface: 'sidebar',
    render: 'inline',
    order: 10,
    tier: 'extra',
    priority: 10,
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
    render: 'inline',
    order: 10,
    tier: 'standard',
    priority: 10,
  },
  // Channel insights (ADR-515 Phase 5). The channel page carries an on-screen readout ("X tuned in · Y circles
  // practicing"), so the staff rail gets an at-a-glance module mirroring hub/nexus/circle/practice insights.
  // A cheap read (tuned-in count + circle count) reusing the same tables the detail page queries. Gated
  // channel.manage (staff); getChannelInsightsData returns null for anyone else (fail-safe).
  {
    id: 'channel.insights',
    label: 'Insights',
    desc: 'The channel at a glance: how many are tuned in and how many circles are practicing it.',
    Icon: BarChart3,
    scopes: ['channel'],
    requiredCapability: 'channel.manage',
    slot: 'insights',
    surface: 'sidebar',
    render: 'inline',
    order: 10,
    tier: 'extra',
    priority: 10,
  },
  // The profile "Person settings" module was retired (ADR-133/PX.5): editing a
  // profile's name/handle/bio now lives in the dedicated Edit Profile flow
  // (/settings/profile for the owner; the full member manager for moderators), so
  // the profile settings column no longer surfaces a person-settings box.

  // ── Personal "You" apps (ADMIN-RAIL.md Phase 4; ADR-515 Phase 2 — the personal rail) ────────────────
  // Global-scope, member-gated editor Apps that apply to every signed-in viewer for their OWN account.
  // They make the admin bar's editor set non-empty for any authed member, so the bar becomes the
  // always-available site-wide settings menu. Each wraps an EXISTING /settings/* form (reuse, never
  // rewrite); the underlying settings actions enforce auth server-side via the (main) layout. The
  // 'account' slot renders ABOVE the management spine (spine.ts). Gated `account.manage` — held by
  // every signed-in viewer on the global scope, denied to signed-out visitors (fail-closed).
  //
  // ADR-515 Phase 2 REVERSES ADR-514 Phase C/D's inlining of the secondary account surfaces. The owner
  // directive: the rail is ONLY the page's own core admin. So the personal BODY is just three inline
  // surfaces — Profile (identity), a condensed Spotlight, and a Layout link — while Appearance,
  // Notifications, Connections and location, Account and privacy, and Plan and billing are `placement:
  // 'bank'`: they LEAVE the sidebar body and render as bottom-bank buttons that link out to their
  // /settings/* page (resolved via hrefForEntitySurface). Every getter still re-gates on the authed
  // viewer and returns null when signed out, so the flattened bar never weakens a gate (fail-safe).
  {
    id: 'account.profile',
    label: 'Profile',
    desc: 'Your display name, handle, photo, and personal contact info.',
    Icon: UserCircle,
    scopes: ['global'],
    requiredCapability: 'account.manage',
    slot: 'account',
    surface: 'sidebar',
    render: 'inline',
    order: 10,
    tier: 'standard',
    priority: 10,
  },
  // The condensed Spotlight section (ADR-515 Phase 2): a compact status + enable/publish control, sitting
  // just under Profile in the "You" section. The full Spotlight block (theme, classic builder) stays on
  // /settings/profile; the ProfileForm inside the rail suppresses it (hideSpotlight). Self-fetches
  // getProfileRailData; renders nothing when the viewer cannot enable Spotlight (fail-safe).
  {
    id: 'account.spotlight',
    label: 'Spotlight',
    desc: 'Your shareable page: turn it on, build it, and publish when ready.',
    Icon: Sparkles,
    scopes: ['global'],
    requiredCapability: 'account.manage',
    slot: 'account',
    surface: 'sidebar',
    render: 'inline',
    order: 15,
    tier: 'standard',
    priority: 15,
  },
  // The Layout link (ADR-515 Phase 2 — "a layout chooser in every rail"): the member's profile grid
  // editor, surfaced as a compact rail entry. An inline module self-fetches the handle (the destination
  // /people/<handle>/profile-preview/edit is not resolvable from the global scope alone) and renders a
  // link. Renders nothing when signed out / no handle (fail-safe).
  {
    id: 'account.layout',
    label: 'Layout',
    desc: 'Arrange the blocks on your profile page.',
    Icon: LayoutGrid,
    scopes: ['global'],
    requiredCapability: 'account.manage',
    slot: 'layout',
    surface: 'sidebar',
    render: 'inline',
    order: 17,
    tier: 'primary',
    priority: 20,
  },
  // ── Bank surfaces (ADR-515 Phase 2): the secondary account surfaces leave the body and render as
  //    bottom-bank buttons, each linking to its /settings/* page via hrefForEntitySurface. `render:
  //    'link'` is honest (they link out) but moot for a bank item (settings-panel resolves the bank by
  //    href, not by render), and `tier`/`priority` are dropped (a bank item is not banded). ──
  {
    id: 'account.appearance',
    label: 'Appearance',
    desc: 'Your palette, feel, and seasonal accent. Saved to this browser.',
    Icon: Palette,
    scopes: ['global'],
    requiredCapability: 'account.manage',
    slot: 'account',
    surface: 'sidebar',
    render: 'link',
    order: 20,
    placement: 'bank',
  },
  {
    id: 'account.notifications',
    label: 'Notifications',
    desc: 'Choose how and when Frequency contacts you. Changes save instantly.',
    Icon: Bell,
    scopes: ['global'],
    requiredCapability: 'account.manage',
    slot: 'account',
    surface: 'sidebar',
    render: 'link',
    order: 30,
    placement: 'bank',
  },
  {
    id: 'account.connections',
    label: 'Connections and location',
    desc: 'Decide who can find you, how precisely your location shows, and how far your reach extends.',
    Icon: Radar,
    scopes: ['global'],
    requiredCapability: 'account.manage',
    slot: 'account',
    surface: 'sidebar',
    render: 'link',
    order: 40,
    placement: 'bank',
  },
  {
    id: 'account.privacy',
    label: 'Account and privacy',
    desc: 'Manage who you have blocked, download your data, and delete your account.',
    Icon: ShieldCheck,
    scopes: ['global'],
    requiredCapability: 'account.manage',
    slot: 'account',
    surface: 'sidebar',
    render: 'link',
    order: 50,
    placement: 'bank',
  },
  {
    id: 'account.billing',
    label: 'Plan and billing',
    desc: 'See your current plan and what each plan unlocks.',
    Icon: CreditCard,
    scopes: ['global'],
    requiredCapability: 'account.manage',
    slot: 'account',
    surface: 'sidebar',
    render: 'link',
    order: 60,
    placement: 'bank',
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

/**
 * The ids of the personal "You" modules (ADMIN-RAIL.md Phase 4) — the global-scope editor modules
 * that apply to a signed-in viewer's OWN account. Derived from the catalog (a module is personal iff
 * it attaches to the `global` scope), so registering one new personal row here needs no extra wiring.
 * The settings panel resolves these INDEPENDENT of the page scope and excludes them from the page's
 * management categories, so the global scope's personal set never doubles as a management column.
 */
export const PERSONAL_MODULE_IDS: ReadonlySet<string> = new Set(
  ADMIN_MODULES.filter((m) => m.scopes.includes('global')).map((m) => m.id),
)
