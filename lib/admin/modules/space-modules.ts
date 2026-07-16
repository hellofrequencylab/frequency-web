import type { LucideIcon } from 'lucide-react'
import {
  IdCard,
  Palette,
  SlidersHorizontal,
  LayoutTemplate,
  Users,
  UserPlus,
  Star,
  Briefcase,
  CalendarClock,
  BadgeCheck,
  HeartHandshake,
  GraduationCap,
  Ticket,
  DoorOpen,
  Store,
  QrCode,
  Radio,
  Mail,
  Megaphone,
  Paintbrush,
  Link2,
  Workflow,
  BarChart3,
  CreditCard,
  Trash2,
} from 'lucide-react'
import type { SpaceFunctionKey } from '@/lib/spaces/functions'
import type { AdminSlot } from './registry'

// LOCKED CONTRACT (ADR-553, docs/MENU-CONTRACT.md): one of the only three module catalogs the admin menu
// may derive from. Extend it by adding a row here; never hand-roll a parallel menu list or rewrite the
// rail to add an item. `pnpm check:menu` + the drift-guard tests enforce this in CI.
//
// THE UNIVERSAL MODULE CONTRACT for the SPACE menu (ADR-543, docs/MODULAR-MENU.md — P0). Space is the one
// scope that never joined the `AdminModule` registry (lib/admin/modules/registry.ts) because it has NO
// `Capability` values — it gates on a `SpaceFunctionKey` + role via `resolveSpaceManageAccess` /
// `spaceFunctionAccess` / `spaces.entitlements`. This module declares the space menu as a catalog of
// INDEPENDENT, self-contained modules on the same shape the other scopes use, gated by a feature key so the
// Module Manager (P3) can flip each on and off. PURE + framework-free (types + data only), so it is trivially
// testable and safe to import anywhere. This IS the space menu: the rail (P3b) and the /manage console (P1)
// both render from `spaceModuleManifest`, and the duplicate `SPACE_SURFACES` registry was retired in P4 (ADR-547).

/** The menu family a module belongs to (a coarser grouping than the engineering spine `slot`). */
export type SpaceModuleFamily = 'space' | 'audience' | 'offerings' | 'reach' | 'growth' | 'system'

/** How a module is gated into the menu:
 *  - `always`  — a shell area (identity / page / settings / danger): shown for any manager.
 *  - `feature` — a SERVICE gated on a `SpaceFunctionKey`: shown only when that function is enabled
 *                (default ON; only an explicit `false` in `spaces.entitlements` hides it). */
export type SpaceModuleGate = { kind: 'always' } | { kind: 'feature'; fn: SpaceFunctionKey }

/** How the module's body renders: `inline` (mounts its editor in the rail), `panel` (opens on-page via
 *  `?panel=`), or `link` (a link-row out to its deep route only). */
export type SpaceModuleRender = 'inline' | 'panel' | 'link'

/** ONE self-contained admin module: a primary area or a service, with a header, a gate, a body, and a wire
 *  into its deep-editing route. */
export interface SpaceModule {
  /** Stable id (kept compatible with the legacy space surface ids where one already existed). */
  id: string
  /** Member-facing name (naming/voice canon). */
  label: string
  /** One-line purpose. */
  desc: string
  Icon: LucideIcon
  family: SpaceModuleFamily
  /** The engineering spine slot (reused for grouping + ordering parity with the other scopes). */
  slot: AdminSlot
  gate: SpaceModuleGate
  /** The feature toggle the Module Manager flips (a `SpaceFunctionKey`), or null for a shell area that
   *  cannot be turned off. */
  featureKey: SpaceFunctionKey | null
  render: SpaceModuleRender
  /** Build the deep-editing route for this module, given the space slug. */
  deepLink?: (slug: string) => string
  /** Sort order within the menu. */
  order: number
  /** The three-tier rail band (identity/profile · most-used · under "More"). */
  tier: 'standard' | 'primary' | 'extra'
  /** RAIL within-band order (P3b, ADR-546b): lower renders higher WITHIN the module's tier + slot band on
   *  the standardized admin rail. Distinct from `order` (the catalog/console order): it mirrors the rail
   *  priority the legacy space surface rows carried, so rendering the rail from the manifest keeps the
   *  shipped band order byte-identical (e.g. Settings stays a late footer). Defaults to `order` when
   *  omitted. Ignored by the console + Module Manager (which order by `order`). */
  priority?: number
  /** RAIL placement (P3b, ADR-546b / ADR-515): `bank` promotes this module into the bottom bank button
   *  grid on the rail (a back-office destination: QR · Email · Insights · Plan and usage); `inline` /
   *  omitted renders it in the rail body via `render`/`tier`. Ignored by the console + Module Manager. */
  placement?: 'inline' | 'bank'
}

const base = (slug: string) => `/spaces/${slug}`

/**
 * THE SPACE MODULE CATALOG (ADR-543). Every primary area + every service as an INDEPENDENT module. The six
 * commerce services (Booking / Memberships / Donations / Enrollment / Tickets / Check-in) are their own
 * modules (the owner's directive — they used to be collapsed into one "Offerings" surface). CRM is a single
 * module that will absorb Vera autonomy + the Pipeline as sub-areas (P1). Ordered by `order`.
 */
export const SPACE_MODULES: readonly SpaceModule[] = [
  // ── The space itself (shell — always on) ─────────────────────────────────────────────────────────────
  { id: 'space.branding', label: 'Identity and Branding', desc: 'Name, tagline, header, logo, cover, and accent.', Icon: Palette, family: 'space', slot: 'place', gate: { kind: 'always' }, featureKey: null, render: 'inline', deepLink: (s) => `${base(s)}/settings/basics`, order: 10, tier: 'standard', priority: 10 },
  { id: 'space.basics', label: 'Info and Connect', desc: 'About, Story, contact and hours, and your links.', Icon: IdCard, family: 'space', slot: 'basics', gate: { kind: 'always' }, featureKey: null, render: 'inline', deepLink: (s) => `${base(s)}/settings/basics`, order: 15, tier: 'standard', priority: 15 },
  { id: 'space.layout', label: 'Page', desc: 'Arrange the sections of your page into rows and columns.', Icon: LayoutTemplate, family: 'space', slot: 'layout', gate: { kind: 'always' }, featureKey: null, render: 'inline', deepLink: (s) => `${base(s)}/manage/layout`, order: 20, tier: 'standard', priority: 20 },
  { id: 'space.settings', label: 'Settings', desc: 'Who can see your space, and the ratings you allow.', Icon: SlidersHorizontal, family: 'space', slot: 'safety', gate: { kind: 'always' }, featureKey: null, render: 'inline', deepLink: (s) => `${base(s)}/settings/basics`, order: 25, tier: 'primary', priority: 70 },

  // ── Audience & relationships ─────────────────────────────────────────────────────────────────────────
  { id: 'space.people', label: 'Members', desc: 'The people on your team and the role each one holds.', Icon: Users, family: 'audience', slot: 'people', gate: { kind: 'feature', fn: 'members' }, featureKey: 'members', render: 'panel', deepLink: (s) => `${base(s)}/settings/members`, order: 30, tier: 'primary', priority: 10 },
  { id: 'space.crm', label: 'CRM', desc: 'Your pipeline, contacts, private notes, and Vera autonomy.', Icon: Briefcase, family: 'audience', slot: 'people', gate: { kind: 'feature', fn: 'crm' }, featureKey: 'crm', render: 'panel', deepLink: (s) => `${base(s)}/crm`, order: 35, tier: 'primary', priority: 15 },
  // Automation is a CRM amplifier — item 7 moves it INTO the CRM / Audience section, right after CRM. It rides
  // the `crm` feature gate; the surface self-gates on the automation entitlement and shows an upgrade notice
  // when the plan lacks it. A `link` row out to its own Focus route (rules + drip editor); never banked.
  { id: 'space.automation', label: 'Automation', desc: 'Rules and drip sequences over your own contacts.', Icon: Workflow, family: 'audience', slot: 'people', gate: { kind: 'feature', fn: 'crm' }, featureKey: 'crm', render: 'link', deepLink: (s) => `${base(s)}/settings/automation`, order: 36, tier: 'primary', priority: 16 },
  // Reviews is a gateable feature keyed on the `reviews` function: the member rating and review wall on the
  // public profile. Default ON (only an explicit `false` hides it); we recommend keeping it on to build trust.
  { id: 'space.reviews', label: 'Reviews', desc: 'The member rating and review wall on your profile.', Icon: Star, family: 'audience', slot: 'people', gate: { kind: 'feature', fn: 'reviews' }, featureKey: 'reviews', render: 'link', deepLink: (s) => `${base(s)}/reviews`, order: 37, tier: 'primary', priority: 17 },
  // Lead capture (CRM Phase 3): contacts captured from Space QR scans, events, and referrals, with the
  // immutable entry point each arrived through. Same `crm` feature gate as the CRM board; the surface
  // self-gates on ownership. Links out to the Space CRM's leads view.
  { id: 'space.leads', label: 'Lead capture', desc: 'Contacts captured from QR scans, events, and referrals, and how each one arrived.', Icon: UserPlus, family: 'audience', slot: 'people', gate: { kind: 'feature', fn: 'crm' }, featureKey: 'crm', render: 'link', deepLink: (s) => `${base(s)}/crm/leads`, order: 38, tier: 'primary', priority: 18 },
  // Capture links (CRM Phase 3): make a shareable link for each of the other front doors, a warm intro,
  // an event check-in, a lead magnet, or a card swap. Same `crm` feature gate as the CRM board; the page
  // self-gates on ownership. Links out to the door-link maker.
  { id: 'space.doors', label: 'Capture links', desc: 'Make a link for a warm intro, an event, a lead magnet, or a card swap.', Icon: Link2, family: 'audience', slot: 'people', gate: { kind: 'feature', fn: 'crm' }, featureKey: 'crm', render: 'link', deepLink: (s) => `${base(s)}/crm/doors`, order: 39, tier: 'primary', priority: 19 },

  // ── Offerings & money (independent modules) ──────────────────────────────────────────────────────────
  { id: 'space.booking', label: 'Booking', desc: 'Set the weekly times members can book, and see the calendar.', Icon: CalendarClock, family: 'offerings', slot: 'engage', gate: { kind: 'feature', fn: 'availability' }, featureKey: 'availability', render: 'panel', deepLink: (s) => `${base(s)}/settings/offerings#availability`, order: 40, tier: 'primary', priority: 30 },
  { id: 'space.memberships', label: 'Memberships', desc: 'The tiers members can join, and who has joined.', Icon: BadgeCheck, family: 'offerings', slot: 'engage', gate: { kind: 'feature', fn: 'memberships' }, featureKey: 'memberships', render: 'panel', deepLink: (s) => `${base(s)}/settings/offerings#memberships`, order: 45, tier: 'primary', priority: 31 },
  { id: 'space.donations', label: 'Donations', desc: 'The fund, a short description, and the amounts members can pick.', Icon: HeartHandshake, family: 'offerings', slot: 'engage', gate: { kind: 'feature', fn: 'donations' }, featureKey: 'donations', render: 'panel', deepLink: (s) => `${base(s)}/settings/offerings#donations`, order: 50, tier: 'primary', priority: 32 },
  { id: 'space.enroll', label: 'Enrollment', desc: 'The program details, and who has enrolled.', Icon: GraduationCap, family: 'offerings', slot: 'engage', gate: { kind: 'feature', fn: 'enroll' }, featureKey: 'enroll', render: 'panel', deepLink: (s) => `${base(s)}/settings/enroll`, order: 55, tier: 'primary', priority: 33 },
  { id: 'space.tickets', label: 'Tickets', desc: 'Free or RSVP ticket tiers, and who has reserved a spot.', Icon: Ticket, family: 'offerings', slot: 'engage', gate: { kind: 'feature', fn: 'tickets' }, featureKey: 'tickets', render: 'panel', deepLink: (s) => `${base(s)}/settings/offerings#tickets`, order: 60, tier: 'primary', priority: 34 },
  { id: 'space.checkin', label: 'Check in', desc: 'Show the door code, and see who checked in.', Icon: DoorOpen, family: 'offerings', slot: 'engage', gate: { kind: 'feature', fn: 'checkin' }, featureKey: 'checkin', render: 'panel', deepLink: (s) => `${base(s)}/settings/offerings#checkin`, order: 65, tier: 'primary', priority: 35 },
  // Shop is now a first-class GATEABLE feature keyed on the `shop` function (SpaceFunctionKey), so it can
  // be turned off, role-gated, and entitlement-gated (the `storefront` tier key) like every sibling
  // offering — it is no longer the always-on outlier. Same label/render/deepLink/order/tier/priority.
  { id: 'space.services', label: 'Shop', desc: 'Your catalog, orders, and storefront.', Icon: Store, family: 'offerings', slot: 'engage', gate: { kind: 'feature', fn: 'shop' }, featureKey: 'shop', render: 'link', deepLink: (s) => `${base(s)}/settings/shop`, order: 70, tier: 'primary', priority: 40 },
  // Airwaves (ADR-608, P1): the Space's audio/video Recordings library. Upload a Recording into the Loom,
  // manage the catalog, and attach a Recording to any offering, journey, event, or the Space itself.
  { id: 'space.airwaves', label: 'Airwaves', desc: 'Your recordings, and where each one plays.', Icon: Radio, family: 'offerings', slot: 'engage', gate: { kind: 'feature', fn: 'airwaves' }, featureKey: 'airwaves', render: 'link', deepLink: (s) => `${base(s)}/settings/airwaves`, order: 72, tier: 'primary', priority: 41 },

  // ── Reach & comms ────────────────────────────────────────────────────────────────────────────────────
  { id: 'space.reach', label: 'QR codes', desc: 'Create codes for this space and the pages they open.', Icon: QrCode, family: 'reach', slot: 'reach', gate: { kind: 'feature', fn: 'qr' }, featureKey: 'qr', render: 'panel', deepLink: (s) => `${base(s)}/settings/qr`, order: 75, tier: 'primary', priority: 50, placement: 'bank' },
  { id: 'space.comms', label: 'Email', desc: 'Write a campaign, pick who gets it, and send or schedule it.', Icon: Mail, family: 'reach', slot: 'comms', gate: { kind: 'feature', fn: 'email' }, featureKey: 'email', render: 'panel', deepLink: (s) => `${base(s)}/settings/email`, order: 80, tier: 'primary', priority: 55, placement: 'bank' },
  // Marketing (Email in the Business CRM, P1): the FULL on-canvas email editor embedded in the CRM. Reuses the
  // one Email Studio engine (EmailCanvasEditor) pointed at this Space's own drafts, seeded from the Space brand
  // (spaceEmailColors). A `link` row out to its own wide editor route; gated on the `email` function (plan-gated,
  // so free Spaces see the upgrade nudge). Distinct from `space.comms` (the plain-text quick composer + send).
  { id: 'space.marketing', label: 'Marketing', desc: 'Design a branded email on the canvas, block by block.', Icon: Megaphone, family: 'reach', slot: 'comms', gate: { kind: 'feature', fn: 'email' }, featureKey: 'email', render: 'link', deepLink: (s) => `${base(s)}/marketing`, order: 81, tier: 'primary', priority: 56 },
  // Email style (Email in the Business CRM, P1): tune the brand-derived palette a Space's emails default to
  // (spaces.preferences.emailStyle, seeded from the brand accent). A `link` row out to its own Focus surface;
  // gated on the `email` function like its siblings.
  { id: 'space.emailstyle', label: 'Email style', desc: 'Set the brand colors your emails use by default.', Icon: Paintbrush, family: 'reach', slot: 'comms', gate: { kind: 'feature', fn: 'email' }, featureKey: 'email', render: 'link', deepLink: (s) => `${base(s)}/settings/email-style`, order: 82, tier: 'extra', priority: 57 },

  // ── Growth & billing ─────────────────────────────────────────────────────────────────────────────────
  { id: 'space.insights', label: 'Insights', desc: 'Scans, growth, and how your space is doing.', Icon: BarChart3, family: 'growth', slot: 'insights', gate: { kind: 'feature', fn: 'qr' }, featureKey: 'qr', render: 'link', deepLink: (s) => `${base(s)}/settings/qr#scans`, order: 85, tier: 'extra', priority: 20, placement: 'bank' },
  { id: 'space.billing', label: 'Plan and usage', desc: 'Your plan, what it unlocks, and billing.', Icon: CreditCard, family: 'growth', slot: 'billing', gate: { kind: 'feature', fn: 'billing' }, featureKey: 'billing', render: 'panel', deepLink: (s) => `${base(s)}/settings/billing`, order: 90, tier: 'extra', priority: 30, placement: 'bank' },

  // ── System ───────────────────────────────────────────────────────────────────────────────────────────
  // The "Menu and features" (Module Manager) rail entry was REMOVED (item 7): the bottom More menu no longer
  // lists it. The /manage/modules page still exists for direct access; it is just no longer a menu item.
  // Danger renders as a rail LINK-row (its inline delete lives in the /manage console + Module Manager, which
  // special-case `space.danger` by id — the `render` value drives only the rail, ADR-546b). It has no
  // deepLink, so the rail row falls back to the /manage console (its delete control home). Never banked.
  { id: 'space.danger', label: 'Danger zone', desc: 'Delete this space. This cannot be undone.', Icon: Trash2, family: 'system', slot: 'danger', gate: { kind: 'always' }, featureKey: null, render: 'link', order: 99, tier: 'extra', priority: 99 },
]

/** Module ids that may NEVER be hidden from the menu or turned off: the shell config surfaces (Identity /
 *  Info / Page / Settings), Danger, and the Module Manager itself. Hiding any of these would strand the
 *  owner (they could not get back to edit their space or its menu). The Module Manager UI hard-disables
 *  the hide + feature controls for these, and `readModuleMenuPrefs` drops them from any stored hidden list. */
export const UNHIDEABLE_MODULE_IDS: readonly string[] = [
  'space.branding',
  'space.basics',
  'space.layout',
  'space.settings',
  'space.danger',
]

/** Whether a module may be hidden from the menu (everything but the shell + Danger + the Module Manager). */
export function isModuleHideable(id: string): boolean {
  return !UNHIDEABLE_MODULE_IDS.includes(id)
}

/** The menu families in their canonical display order (the Module Manager groups its rows by these). */
export const SPACE_MODULE_FAMILY_ORDER: readonly SpaceModuleFamily[] = [
  'space',
  'audience',
  'offerings',
  'reach',
  'growth',
  'system',
]

/** Member-facing family headers for the Module Manager (NAMING.md + CONTENT-VOICE.md; no em dashes). */
export const SPACE_MODULE_FAMILY_LABEL: Record<SpaceModuleFamily, string> = {
  space: 'Your space',
  audience: 'Audience',
  offerings: 'Offerings & money',
  reach: 'Reach',
  growth: 'Growth',
  system: 'System',
}

/** A space module by id, or null. */
export function spaceModuleById(id: string): SpaceModule | null {
  return SPACE_MODULES.find((m) => m.id === id) ?? null
}

/** Whether a feature is enabled for a space. Default ON: a function is enabled unless `entitlements` maps it
 *  to an explicit `false` (mirrors lib/spaces/functions resolution — universal, default-on, opt-out). */
export function isFeatureEnabled(
  entitlements: Partial<Record<SpaceFunctionKey, boolean>> | null | undefined,
  fn: SpaceFunctionKey,
): boolean {
  return entitlements?.[fn] !== false
}

/** Whether a module is gated INTO the menu for the given entitlements (a shell module always is; a service
 *  module is iff its feature is enabled). Independent of the Module Manager's hide/order overrides. */
export function isModuleEnabled(
  module: SpaceModule,
  entitlements: Partial<Record<SpaceFunctionKey, boolean>> | null | undefined,
): boolean {
  return module.gate.kind === 'always' || isFeatureEnabled(entitlements, module.gate.fn)
}

/** Options that let the Module Manager (P3) override the default menu: hide modules, and/or reorder them. */
export interface ModuleManifestOptions {
  /** Module ids the owner has hidden from the menu. */
  hidden?: readonly string[]
  /** Module ids in the owner's preferred order; unlisted modules keep their catalog order, after these. */
  order?: readonly string[]
}

/**
 * THE SPACE MODULE MANIFEST (ADR-543): the ordered, gated list of modules a space's menu shows. Filters the
 * catalog by feature gate (default ON), drops any the owner hid, and orders by the owner's preference then
 * the catalog `order`. PURE + total — the single entry the rail + console will render from (P1).
 */
export function spaceModuleManifest(
  entitlements: Partial<Record<SpaceFunctionKey, boolean>> | null | undefined,
  opts: ModuleManifestOptions = {},
): SpaceModule[] {
  const hidden = new Set(opts.hidden ?? [])
  const enabled = SPACE_MODULES.filter((m) => isModuleEnabled(m, entitlements) && !hidden.has(m.id))
  if (!opts.order || opts.order.length === 0) {
    return enabled.slice().sort((a, b) => a.order - b.order)
  }
  const rank = new Map(opts.order.map((id, i) => [id, i]))
  return enabled.slice().sort((a, b) => {
    const ra = rank.has(a.id) ? (rank.get(a.id) as number) : Number.MAX_SAFE_INTEGER
    const rb = rank.has(b.id) ? (rank.get(b.id) as number) : Number.MAX_SAFE_INTEGER
    return ra !== rb ? ra - rb : a.order - b.order
  })
}
