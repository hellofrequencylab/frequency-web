import type { LucideIcon } from 'lucide-react'
import {
  IdCard,
  Palette,
  SlidersHorizontal,
  LayoutTemplate,
  Users,
  Briefcase,
  CalendarClock,
  BadgeCheck,
  HeartHandshake,
  GraduationCap,
  Ticket,
  DoorOpen,
  Store,
  QrCode,
  Mail,
  Workflow,
  BarChart3,
  CreditCard,
  Blocks,
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

  // ── Offerings & money (independent modules) ──────────────────────────────────────────────────────────
  { id: 'space.booking', label: 'Booking', desc: 'Set the weekly times members can book, and see the calendar.', Icon: CalendarClock, family: 'offerings', slot: 'engage', gate: { kind: 'feature', fn: 'availability' }, featureKey: 'availability', render: 'panel', deepLink: (s) => `${base(s)}/settings/offerings#availability`, order: 40, tier: 'primary', priority: 30 },
  { id: 'space.memberships', label: 'Memberships', desc: 'The tiers members can join, and who has joined.', Icon: BadgeCheck, family: 'offerings', slot: 'engage', gate: { kind: 'feature', fn: 'memberships' }, featureKey: 'memberships', render: 'panel', deepLink: (s) => `${base(s)}/settings/offerings#memberships`, order: 45, tier: 'primary', priority: 31 },
  { id: 'space.donations', label: 'Donations', desc: 'The fund, a short description, and the amounts members can pick.', Icon: HeartHandshake, family: 'offerings', slot: 'engage', gate: { kind: 'feature', fn: 'donations' }, featureKey: 'donations', render: 'panel', deepLink: (s) => `${base(s)}/settings/offerings#donations`, order: 50, tier: 'primary', priority: 32 },
  { id: 'space.enroll', label: 'Enrollment', desc: 'The program details, and who has enrolled.', Icon: GraduationCap, family: 'offerings', slot: 'engage', gate: { kind: 'feature', fn: 'enroll' }, featureKey: 'enroll', render: 'panel', deepLink: (s) => `${base(s)}/settings/enroll`, order: 55, tier: 'primary', priority: 33 },
  { id: 'space.tickets', label: 'Tickets', desc: 'Free or RSVP ticket tiers, and who has reserved a spot.', Icon: Ticket, family: 'offerings', slot: 'engage', gate: { kind: 'feature', fn: 'tickets' }, featureKey: 'tickets', render: 'panel', deepLink: (s) => `${base(s)}/settings/offerings#tickets`, order: 60, tier: 'primary', priority: 34 },
  { id: 'space.checkin', label: 'Check in', desc: 'Show the door code, and see who checked in.', Icon: DoorOpen, family: 'offerings', slot: 'engage', gate: { kind: 'feature', fn: 'checkin' }, featureKey: 'checkin', render: 'panel', deepLink: (s) => `${base(s)}/settings/offerings#checkin`, order: 65, tier: 'primary', priority: 35 },
  { id: 'space.services', label: 'Store', desc: 'Your storefront items, their pricing, and visibility.', Icon: Store, family: 'offerings', slot: 'engage', gate: { kind: 'always' }, featureKey: null, render: 'panel', deepLink: (s) => `${base(s)}/settings/services`, order: 70, tier: 'primary', priority: 40 },

  // ── Reach & comms ────────────────────────────────────────────────────────────────────────────────────
  { id: 'space.reach', label: 'QR codes', desc: 'Create codes for this space and the pages they open.', Icon: QrCode, family: 'reach', slot: 'reach', gate: { kind: 'feature', fn: 'qr' }, featureKey: 'qr', render: 'panel', deepLink: (s) => `${base(s)}/settings/qr`, order: 75, tier: 'primary', priority: 50, placement: 'bank' },
  { id: 'space.comms', label: 'Email', desc: 'Write a campaign, pick who gets it, and send or schedule it.', Icon: Mail, family: 'reach', slot: 'comms', gate: { kind: 'feature', fn: 'email' }, featureKey: 'email', render: 'panel', deepLink: (s) => `${base(s)}/settings/email`, order: 80, tier: 'primary', priority: 55, placement: 'bank' },
  // Automation is a CRM AMPLIFIER (gated on the `crm.space.automation` capability = spaces.entitlements
  // 'automation'). The menu catalog only gates on a SpaceFunctionKey, so this row rides the `crm` feature
  // gate (automation lives alongside the CRM); the SURFACE itself self-gates on the automation entitlement
  // and shows an upgrade notice when the plan lacks it (like the Email surface's own plan gate). A `link`
  // row out to its own Focus route (rules + drip editor); never banked.
  { id: 'space.automation', label: 'Automation', desc: 'Rules and drip sequences over your own contacts.', Icon: Workflow, family: 'reach', slot: 'comms', gate: { kind: 'feature', fn: 'crm' }, featureKey: 'crm', render: 'link', deepLink: (s) => `${base(s)}/settings/automation`, order: 82, tier: 'extra', priority: 56 },

  // ── Growth & billing ─────────────────────────────────────────────────────────────────────────────────
  { id: 'space.insights', label: 'Insights', desc: 'Scans, growth, and how your space is doing.', Icon: BarChart3, family: 'growth', slot: 'insights', gate: { kind: 'feature', fn: 'qr' }, featureKey: 'qr', render: 'link', deepLink: (s) => `${base(s)}/settings/qr#scans`, order: 85, tier: 'extra', priority: 20, placement: 'bank' },
  { id: 'space.billing', label: 'Plan and usage', desc: 'Your plan, what it unlocks, and billing.', Icon: CreditCard, family: 'growth', slot: 'billing', gate: { kind: 'feature', fn: 'billing' }, featureKey: 'billing', render: 'panel', deepLink: (s) => `${base(s)}/settings/billing`, order: 90, tier: 'extra', priority: 30, placement: 'bank' },

  // ── System ───────────────────────────────────────────────────────────────────────────────────────────
  // The Module Manager (ADR-546, P3): the owner-gated area that turns each service on or off, reorders the
  // menu, and hides a module. An always-on shell area (no featureKey — it can never be turned off or hidden),
  // gated to owner/admin at every render + write, not by a feature. Deep-links to its own page.
  { id: 'space.modules', label: 'Menu and features', desc: 'Turn features on or off, reorder your menu, and hide what you do not use.', Icon: Blocks, family: 'system', slot: 'safety', gate: { kind: 'always' }, featureKey: null, render: 'link', deepLink: (s) => `${base(s)}/manage/modules`, order: 98, tier: 'extra', priority: 40 },
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
  'space.modules',
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
