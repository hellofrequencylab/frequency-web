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
// SCOPE: this rollout completes the Space spine for EVERY provisionable type. EM1-3 shipped
// `practitioner` + `organization`; this slice (EM2-3, "all Space profiles") adds `business`,
// `event_space`, `lab`, and `partner`, so every provisionable type is managed through the one
// console, gated by each type's existing per-Space functions:
//   business    -> CRM, email, memberships (+ the universal Members / QR / Insights / Billing)
//   event_space -> tickets, check-in (+ the universal Members / QR / Insights / Billing)
//   lab/partner -> the universal four they actually carry functions for: Members, QR, Insights,
//                  Billing (their blueprints, ADR-341 section 2.10, compose only the universal tools
//                  in v1; CRM/email are not in those types' function `types`, so no schema change
//                  adds them here).
// Each surface still WRAPS the existing settings sub-page it already gated on; nothing is rebuilt.
// `coaching` joined the console with Space Modes M3 (ADR-461/464): it carries CRM (its function registry
// already lists coaching in the `crm` types) plus the universal Members / QR / Insights / Billing and the
// new Mode and focus surface. Only `root` stays off the console (the never-provisioned platform host).
// Every console type also gets the always-on Mode and focus surface (`space.mode`), Mode being FREE
// framing, never a gate.

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
  /** The Space types that offer this surface ('*' = every provisionable type). The console serves
   *  every provisionable type except coaching (CONSOLE_SPACE_TYPES in lib/spaces/types.ts). */
  types: readonly (SpaceType | '*')[]
  /** How the STANDARDIZED admin bar draws this surface (inline-first rail, ADR-514): `inline` mounts the
   *  surface's editor component in the flattened bar ("everything in view" — the owner directive); `link`
   *  draws a compact link-row out to the surface's own `/settings/*` management page. Config surfaces
   *  (Basics / Mode / Page) render inline; every feature workflow (Members / CRM / Offerings / Services /
   *  QR / Email / Insights / Billing / Danger) links out to its full page. */
  render: 'inline' | 'link'
  /** The three-tier rail axis (ADR-514 three-tier reorg): which band this surface renders in on the
   *  standardized admin rail — `standard` (identity: profile / page / mode, inline at the very top),
   *  `primary` (most-used management, ordered by importance) or `extra` (obscured under the "More"
   *  disclosure). ORTHOGONAL to `render`. */
  tier?: 'standard' | 'primary' | 'extra'
  /** Order WITHIN a tier (lower = higher up). Defaults to the surface's spine position when omitted. */
  priority?: number
  /** The uniform-rail placement axis (ADR-515): `inline` (default) renders the surface in the rail
   *  BODY; `bank` promotes it into the bottom bank button-grid (the fixed per-scope quick-links)
   *  instead. Default `inline`. Phase 3 (the SPACE rail) opts the back-office feature workflows in:
   *  CRM · Email · QR · Insights · Billing leave the body for the bank (the owner directive: a feature
   *  that paints on the public profile is INLINE; a back-office destination is a BOTTOM-BANK button).
   *  Danger is NEVER banked (destructive must not be a quick-link) — it stays inline + de-emphasized. */
  placement?: 'inline' | 'bank'
  /** The per-module SURFACE predicate (ADR-516 Phase B): routes on which this surface's SUBJECT lives;
   *  the rail mounts the inline editor only where the path matches. Absent = anywhere (today's behavior).
   *  Unused by any Space surface this phase — present for symmetry with the personal-module predicate. */
  surfaces?: readonly RegExp[]
}

/**
 * The declared Space surfaces, per the 9-category spine. Each provisionable type's spine:
 *
 *   Practitioner: Basics · Place & Time (availability) · People (members) ·
 *                 Engage (CRM) · Reach (QR) · Comms (email) · Insights · Danger
 *   Organization: Basics · People (members) · Engage (donations + enrollment, money dormant) ·
 *                 Reach (QR) · Comms (email) · Insights · Billing · Danger
 *   Business:     Basics · People (members) · Engage (memberships + CRM) · Reach (QR) ·
 *                 Comms (email) · Insights · Billing · Danger
 *   Event Space:  Basics · People (members) · Engage (tickets) · Reach (QR) · Safety (check-in) ·
 *                 Insights · Billing · Danger
 *   Lab/Partner:  Basics · People (members) · Reach (QR) · Insights · Billing · Danger
 *                 (the universal four they carry functions for; ADR-341 section 2.10)
 *
 * Each surface's `requiredFunction` is the EXISTING per-Space function the legacy settings sub-page
 * already gates on (lib/spaces/functions.ts), so the console gate and the sub-page gate are the same
 * check. Basics + Danger carry `null` (no per-tool function — gated by manage access alone). The
 * money-adjacent surfaces (donations / enrollment / memberships / tickets) stay v1 display-only: the
 * existing sub-pages keep money dormant (no schema change here).
 */
export const SPACE_SURFACES: readonly SpaceSurface[] = [
  // Basics — profile, brand, visibility (the `profile` function gates the form; the surface itself
  // is always present for a manager). Every type.
  // Info & Connect (the standardized rail, Section 2 · ADR-535) — the forward-facing marketing + connect
  // content a Spotlight/profile shows: About, Story, contact, and links. (The stable id stays `space.basics`
  // so the spine order + console binding are unchanged.) Renders BELOW Identity & Branding (priority 15 vs
  // its 10). Always present for a manager, inline in the standard band.
  {
    id: 'space.basics',
    tier: 'standard',
    priority: 15,
    slot: 'basics',
    label: 'Info and Connect',
    desc: 'Your about, story, contact details, and links.',
    requiredFunction: null,
    types: ['*'],
    render: 'inline',
  },
  // Identity & Branding (Section 1 · ADR-535) — everything in the header HERO: name, tagline, header image,
  // logo, cover style, and accent. Its own section (the `place` spine slot, relabelled "Identity and
  // Branding" for the Space scope in SPACE_GROUP_META); priority 10 puts it FIRST in the standard band.
  {
    id: 'space.branding',
    tier: 'standard',
    priority: 10,
    slot: 'place',
    label: 'Identity and Branding',
    desc: 'Your name, tagline, header image, logo, cover style, and colour.',
    requiredFunction: null,
    types: ['*'],
    render: 'inline',
  },
  // Settings (the lower Settings section · ADR-535) — the less-frequent knobs pulled out of the
  // forward-facing sections: the star rating + count and who can find this space (visibility). Its own
  // section on the `safety` spine slot (unused for Space), relabelled "Settings"; a high priority sorts it
  // LATE in the primary band (after the services), so it reads as a settings footer, not a headline.
  {
    id: 'space.settings',
    tier: 'primary',
    priority: 70,
    slot: 'safety',
    label: 'Settings',
    desc: 'Your rating and who can find this space.',
    requiredFunction: null,
    types: ['*'],
    render: 'inline',
  },
  // Mode and focus (Space Modes M3, ADR-461/464) — the operating Mode + Focus this space runs on, what
  // the preset surfaces, and per-facet overrides. Always present for a manager (no per-tool function):
  // Mode is FREE framing, never a gate, so it sits in the spine alongside Basics for every console type.
  {
    id: 'space.mode',
    tier: 'standard',
    priority: 30,
    slot: 'basics',
    label: 'Mode and focus',
    desc: 'Pick how this space runs, see what the preset turns on, and adjust it.',
    requiredFunction: null,
    types: ['*'],
    render: 'inline',
  },
  // Page (ADR-472) — the public-page quick-edit surface: layout (Book · Schedule · Storefront · Hub, or
  // automatic), cover size, theme/accent, and block order + show/hide, plus a Full page editor button
  // that opens the complete Puck editor as an overlay. Always present for a manager (no per-tool
  // function): the page is a FREE start point, never a gate, so it sits alongside Basics + Mode for every
  // console type. (The stable id stays `space.layout` so the spine order + console binding are unchanged.)
  {
    id: 'space.layout',
    tier: 'standard',
    priority: 20,
    slot: 'layout',
    label: 'Page',
    desc: 'Set your layout, cover, accent, and block order, or open the full editor.',
    requiredFunction: null,
    types: ['*'],
    render: 'inline',
  },
  // OFFERINGS & MONEY group — the SEVEN INDEPENDENT commerce surfaces (modular menu P1b, ADR-544b). The
  // rail used to collapse these into ONE adaptive `space.offerings` row; P1 split the manage console into
  // independent modules (ADR-544), and this un-merges the RAIL to match: each commerce tool is its own
  // link-row, gated by its OWN per-Space function (so a practitioner sees Booking, a business sees
  // Memberships, and so on — the per-type shaping that `canUse(fn)` already encodes). The ids + copy mirror
  // the module catalog (lib/admin/modules/space-modules.ts) so the rail and the console show the same
  // modules. Each links out to its EXISTING /settings/* page (no feature is rebuilt). Store (space.services)
  // is declared below, right after CRM, and completes the group. Priorities keep the module catalog order.
  {
    id: 'space.booking',
    tier: 'primary',
    priority: 30,
    slot: 'engage',
    label: 'Booking',
    desc: 'Set the weekly times members can book, and see the calendar.',
    requiredFunction: 'availability',
    types: ['*'],
    render: 'link',
  },
  {
    id: 'space.memberships',
    tier: 'primary',
    priority: 31,
    slot: 'engage',
    label: 'Memberships',
    desc: 'The tiers members can join, and who has joined.',
    requiredFunction: 'memberships',
    types: ['*'],
    render: 'link',
  },
  {
    id: 'space.donations',
    tier: 'primary',
    priority: 32,
    slot: 'engage',
    label: 'Donations',
    desc: 'The fund, a short description, and the amounts members can pick.',
    requiredFunction: 'donations',
    types: ['*'],
    render: 'link',
  },
  {
    id: 'space.enroll',
    tier: 'primary',
    priority: 33,
    slot: 'engage',
    label: 'Enrollment',
    desc: 'The program details, and who has enrolled.',
    requiredFunction: 'enroll',
    types: ['*'],
    render: 'link',
  },
  {
    id: 'space.tickets',
    tier: 'primary',
    priority: 34,
    slot: 'engage',
    label: 'Tickets',
    desc: 'Free or RSVP ticket tiers, and who has reserved a spot.',
    requiredFunction: 'tickets',
    types: ['*'],
    render: 'link',
  },
  {
    id: 'space.checkin',
    tier: 'primary',
    priority: 35,
    slot: 'engage',
    label: 'Check in',
    desc: 'Show the door code, and see who checked in.',
    requiredFunction: 'checkin',
    types: ['*'],
    render: 'link',
  },
  // AUDIENCE group (Space menu regroup, ADR-520) — Members, CRM, and Vera autonomy sit together as
  // "everyone this space works with." The 7-group Space IA re-purposes the `people` spine slot as the
  // Audience section (the rail relabels the header via SPACE_GROUP_META); the per-scope slot→label map
  // keeps every OTHER scope's "People" header unchanged. Members leads the group.
  {
    id: 'space.people',
    tier: 'primary',
    priority: 10,
    slot: 'people',
    label: 'Members',
    desc: 'See who is on your team and the role each one holds.',
    requiredFunction: 'members',
    types: ['*'],
    render: 'link',
  },
  // CRM — the ONE relationship module (modular menu P1b, ADR-544b). UNIVERSAL (ADR-517 Phase F): the `crm`
  // function is available to every Space, so the surface offers it to every console type. In the Audience
  // group (ADR-520). CRM now ABSORBS Vera autonomy + the Pipeline: they are no longer standalone rail rows
  // (they become CRM sub-areas in P2), so the rail shows a single CRM row that matches the console's one
  // `space.crm` module. Kept INLINE as a live usage card (ADR-520 P2) so its metered usage is visible in the
  // rail body; the fixed base bank still carries a CRM quick-link, so it is reachable both ways. The
  // freemium meter (space_crm, contacts) surfaces on the card via SURFACE_SUMMARIES.
  {
    id: 'space.engage.crm',
    tier: 'primary',
    priority: 15,
    slot: 'people',
    label: 'CRM',
    desc: 'Your pipeline, contacts, private notes, and how much Vera does on its own.',
    requiredFunction: 'crm',
    types: ['*'],
    render: 'link',
  },
  // Store (the storefront store items) — the operator's catalog of services with full pricing + a
  // listed/private visibility toggle, edited at /settings/services and rendered on the public space
  // storefront (components/widgets/space-profile/offerings.tsx). The seventh Offerings & money module.
  // Declared right AFTER CRM so it sorts after the six type-gated commerce surfaces within the shared engage
  // slot (priority 40, after them). `requiredFunction: null` (FREE profile framing, like Page): any space
  // may list store items, so it is always present for a manager on every console type.
  {
    id: 'space.services',
    tier: 'primary',
    priority: 40,
    slot: 'engage',
    label: 'Store',
    desc: 'Your storefront items, their pricing, and visibility.',
    requiredFunction: null,
    types: ['*'],
    render: 'link',
  },
  // NOTE (modular menu P1b, ADR-544b): the rail's commerce surfaces are the SEVEN independent modules
  // declared above (Booking / Memberships / Donations / Enrollment / Tickets / Check in / Store), matching
  // the manage console's module split (ADR-544). The old merged `space.offerings` rail row and the
  // standalone `space.autonomy` + `space.pipeline` rows are gone (autonomy + pipeline fold into CRM). The
  // adaptive /settings/offerings page still exists and its old section routes still redirect there; only the
  // rail no longer surfaces the merged row.

  // REACH group (ADR-520) — QR codes + Email, "get your space in front of people." Both are back-office
  // destinations (they never paint on the public profile), so both are `placement: 'bank'`: the whole Reach
  // group promotes into the bottom bank rather than rendering a rail-body section. Email moves onto the
  // `reach` slot so Reach is one section header (the `comms` slot is unused for Space now).
  {
    id: 'space.reach',
    tier: 'primary',
    priority: 50,
    slot: 'reach',
    label: 'QR codes',
    desc: 'Create codes for your space and the landing page they open to.',
    requiredFunction: 'qr',
    types: ['*'],
    render: 'link',
    // BANK (ADR-515 Phase 3 / ADR-520): a back-office destination, so it renders as a bottom-bank button.
    placement: 'bank',
  },
  // Email — write a campaign, pick who gets it, and send or schedule it. UNIVERSAL (ADR-517 Phase F).
  // In the Reach group (ADR-520), banked beside QR codes.
  {
    id: 'space.comms',
    tier: 'primary',
    priority: 55,
    slot: 'reach',
    label: 'Email',
    desc: 'Write a campaign, pick who gets it, and send or schedule it.',
    requiredFunction: 'email',
    types: ['*'],
    render: 'link',
    // BANK (ADR-515 Phase 3): campaign composition never paints on the public page, so Email is banked.
    placement: 'bank',
  },
  // GROWTH group (ADR-520) — Insights + Plan and usage, "how the space is doing and where you sit on the
  // ladder." Both banked back-office destinations. The `insights` spine slot is re-purposed as the Growth
  // section (SPACE_GROUP_META relabels it for the Space scope only). Insights gets its OWN href distinct
  // from QR (ADR-520 P3, surface-hrefs) so both stay reachable in the bank.
  {
    id: 'space.insights',
    tier: 'extra',
    priority: 20,
    slot: 'insights',
    label: 'Insights',
    desc: 'See how your codes and pages are performing.',
    requiredFunction: 'qr',
    types: ['*'],
    render: 'link',
    // BANK (ADR-515 Phase 3): analytics are a back-office destination, so Insights renders in the bank.
    placement: 'bank',
  },
  // Plan and usage — the reframed billing hub (ADR-519 / ADR-520 P3): the current plan PLUS the usage-meter
  // ladder for every metered feature ("where am I on the ladder"). UNIVERSAL (ADR-517 Phase F). In the
  // Growth group (`insights` slot); banked. Not a lock: usage as a nudge, never a wall.
  {
    id: 'space.billing',
    tier: 'extra',
    priority: 30,
    slot: 'insights',
    label: 'Plan and usage',
    desc: 'See your current plan and how much of each tool you are using.',
    requiredFunction: 'billing',
    types: ['*'],
    render: 'link',
    // BANK (ADR-515 Phase 3): billing is a back-office destination, so it renders in the bottom bank
    // (deduped against the base bank's fixed Billing link by href).
    placement: 'bank',
  },
  // Danger — delete this space (owner-grade, permanent). Gated by manage access + owner check in the
  // console, like the legacy cockpit; no per-tool function. Stays INLINE (default placement) as the
  // de-emphasized last item in the body: destructive must NEVER be a bottom-bank quick-link (ADR-515).
  {
    id: 'space.danger',
    tier: 'extra',
    priority: 99,
    slot: 'danger',
    label: 'Danger zone',
    desc: 'Delete this space and everything it owns. This cannot be undone.',
    requiredFunction: null,
    types: ['*'],
    render: 'link',
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
 *
 * COMMERCE (modular menu P1b, ADR-544b): the seven Offerings & money surfaces are now INDEPENDENT, each
 * gated on its OWN per-Space function (Booking → availability, Memberships → memberships, …; Store →
 * null, always on). So a commerce surface shows exactly when its function is usable, which naturally
 * shapes the set per type (a practitioner sees Booking, a business sees Memberships, …) and never opens
 * an empty adaptive card. No special-case remains — the general `requiredFunction` gate below covers them.
 */
export function spaceSurfacesFor(
  type: SpaceType,
  canUse: (fn: SpaceFunctionKey) => boolean,
): SpaceSurface[] {
  return SPACE_SURFACES.filter((s) => {
    if (!spaceSurfaceAppliesToType(s, type)) return false
    // An always-on (null) surface always shows; a functioned one shows when its function is usable.
    return s.requiredFunction === null || canUse(s.requiredFunction)
  }).sort((a, b) => SPINE_ORDER.indexOf(a.slot) - SPINE_ORDER.indexOf(b.slot))
}

