import type { LucideIcon } from 'lucide-react'
import {
  IdCard,
  LayoutTemplate,
  Users,
  UserPlus,
  Share2,
  Star,
  Briefcase,
  Images,
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
  Sparkles,
  Route,
  Handshake,
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
  /** The freemium/premium marking shown in the console (ADR-782): `included` = free for every Space,
   *  `freemium` = free with a cap a paid plan lifts, `premium` = paid plan or add-on only. Purely a BADGE
   *  (it does NOT gate — gating stays in lib/pricing/gates.ts + the function registry); it makes the plan
   *  story legible on the /manage console. Defaults to `included` when omitted. */
  access?: 'included' | 'freemium' | 'premium'
  /** Console CONSOLIDATION (ADR-782): the id of the PARENT module this one folds UNDER on the /manage
   *  console, so the console shows ONE card per surface with its siblings nested (Email design/style under
   *  Email; Automation / Lead capture / Capture links / Shared under CRM; Scans under QR codes). The module
   *  stays a first-class catalog row (still gated, still in the rail, still deep-linkable); only the console
   *  groups it beneath its parent instead of as its own top-level card. Top-level modules omit it. */
  parent?: string
  /** The free-tier LEVER shown as a sublabel on the console card (ADR-784): the cap a free Space hits or
   *  the take-rate a paid plan buys down, e.g. "250 contacts free" / "5% take-rate, 3% on a paid plan".
   *  This makes the upgrade motivation legible instead of a bare Freemium/Premium badge. The numbers mirror
   *  lib/pricing/feature-meters.ts (RAW_METERS) + lib/pricing/settings.ts (take_rate); it is presentation
   *  only and never gates. Omit for a plain Included shell with no cap. */
  freeNote?: string
  /** PROGRESSIVE DISCLOSURE (ADR-796): an ADVANCED tool — collapsed OUT of the primary menu until the owner
   *  turns it ON from the per-area control board (the Module Manager). Presentation only: the function stays
   *  available (default-ON in the pure resolver); this governs only whether it shows UP FRONT. The manifest
   *  drops an advanced module unless its id is in `ModuleManifestOptions.activated`. Defaults to false (a
   *  primary, always-up-front module). Never set on a shell / Danger module (they must always show). */
  advanced?: boolean
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
  // ONE "Profile and Settings" card (ADR-782): the former three shell cards (Identity and Branding · Info
  // and Connect · Settings) all deep-linked to the SAME /settings/basics editor, which is already one
  // section-based form (pictures · name & bio · brand · page theme · info & connect · visibility). They
  // collapse to this single card so the console no longer shows three rows that open the same page.
  { id: 'space.basics', label: 'Profile and Settings', desc: 'Your name, tagline and story, brand and accent, page theme, contact and hours, links, and who can see your space.', Icon: IdCard, family: 'space', slot: 'basics', gate: { kind: 'always' }, featureKey: null, render: 'inline', deepLink: (s) => `${base(s)}/settings/basics`, order: 15, tier: 'standard', priority: 15, access: 'included' },
  { id: 'space.layout', label: 'Page', desc: 'Arrange the sections of your page into rows and columns.', Icon: LayoutTemplate, family: 'space', slot: 'layout', gate: { kind: 'always' }, featureKey: null, render: 'inline', deepLink: (s) => `${base(s)}/manage/layout`, order: 20, tier: 'standard', priority: 20, access: 'included' },

  // ── Audience & relationships ─────────────────────────────────────────────────────────────────────────
  { id: 'space.people', label: 'Team and members', desc: 'The people on your team and the role each one holds.', Icon: Users, family: 'audience', slot: 'people', gate: { kind: 'feature', fn: 'members' }, featureKey: 'members', render: 'panel', deepLink: (s) => `${base(s)}/settings/members`, order: 30, tier: 'primary', priority: 10, access: 'freemium', freeNote: '1 seat free, then paid per seat' },
  // CRM is the ONE card for the whole pipeline (ADR-782): Automation, Lead capture, Capture links, and
  // Shared with team fold UNDER it on the console (each `parent: 'space.crm'`), so the Audience group shows
  // one CRM card with its four workspaces nested instead of five separate rows. Each stays a first-class
  // module (own gate + deepLink + rail row); only the console consolidates them.
  { id: 'space.crm', label: 'CRM', desc: 'Your pipeline, contacts, private notes, and Vera autonomy.', Icon: Briefcase, family: 'audience', slot: 'people', gate: { kind: 'feature', fn: 'crm' }, featureKey: 'crm', render: 'panel', deepLink: (s) => `${base(s)}/crm`, order: 35, tier: 'primary', priority: 15, access: 'freemium', freeNote: '250 contacts free, then unlimited' },
  // Inbox (ADR-786): the space's 2-way conversation view — read a contact thread and reply through the
  // consent gate. Same `crm` gate as the board; lives under /crm and clusters into Resonance on the hub.
  { id: 'space.inbox', label: 'Inbox', desc: 'Read every contact conversation and reply, through the consent gate.', Icon: Mail, family: 'audience', slot: 'people', gate: { kind: 'feature', fn: 'crm' }, featureKey: 'crm', render: 'link', deepLink: (s) => `${base(s)}/crm/inbox`, order: 35.5, tier: 'primary', priority: 15.5, access: 'included' },
  // Automation rides the `crm` feature gate; the surface self-gates on the automation ENTITLEMENT (a paid
  // amplifier) and shows an upgrade notice when the plan lacks it. Nested under CRM on the console.
  { id: 'space.automation', label: 'Automation', desc: 'Rules and drip sequences over your own contacts.', Icon: Workflow, family: 'audience', slot: 'people', gate: { kind: 'feature', fn: 'crm' }, featureKey: 'crm', render: 'link', deepLink: (s) => `${base(s)}/settings/automation`, order: 36, tier: 'primary', priority: 16, access: 'premium', parent: 'space.crm', freeNote: 'On a paid plan' },
  // Reviews is a gateable feature keyed on the `reviews` function: the member rating and review wall on the
  // public profile. Default ON (only an explicit `false` hides it); we recommend keeping it on to build trust.
  { id: 'space.reviews', label: 'Reviews', desc: 'The member rating and review wall on your profile.', Icon: Star, family: 'audience', slot: 'people', gate: { kind: 'feature', fn: 'reviews' }, featureKey: 'reviews', render: 'link', deepLink: (s) => `${base(s)}/reviews`, order: 37, tier: 'primary', priority: 17, access: 'included' },
  // Lead capture (CRM Phase 3): contacts captured from Space QR scans, events, and referrals, with the
  // immutable entry point each arrived through. Same `crm` feature gate as the CRM board; nested under CRM.
  { id: 'space.leads', label: 'Lead capture', desc: 'Contacts captured from QR scans, events, and referrals, and how each one arrived.', Icon: UserPlus, family: 'audience', slot: 'people', gate: { kind: 'feature', fn: 'crm' }, featureKey: 'crm', render: 'link', deepLink: (s) => `${base(s)}/crm/leads`, order: 38, tier: 'primary', priority: 18, access: 'freemium', parent: 'space.crm' },
  // Capture links (CRM Phase 3): make a shareable link for each of the other front doors, a warm intro,
  // an event check-in, a lead magnet, or a card swap. Same `crm` feature gate as the CRM board; nested under CRM.
  { id: 'space.doors', label: 'Capture links', desc: 'Make a link for a warm intro, an event, a lead magnet, or a card swap.', Icon: Link2, family: 'audience', slot: 'people', gate: { kind: 'feature', fn: 'crm' }, featureKey: 'crm', render: 'link', deepLink: (s) => `${base(s)}/crm/doors`, order: 39, tier: 'primary', priority: 19, access: 'freemium', parent: 'space.crm' },
  // Shared with team (ADR-778): the contact CARDS members chose to share with this Space's team (network
  // 'shared' tier). Nested under CRM on the console; the PAGE itself gates on team membership (broader than
  // the CRM role), and the reader returns card fields only (never notes/tags).
  { id: 'space.shared', label: 'Shared with team', desc: 'Contact cards your members shared with the team.', Icon: Share2, family: 'audience', slot: 'people', gate: { kind: 'feature', fn: 'crm' }, featureKey: 'crm', render: 'link', deepLink: (s) => `${base(s)}/crm/shared`, order: 39.5, tier: 'primary', priority: 19.5, access: 'freemium', parent: 'space.crm' },
  // Collaborator spaces (ADR-799 B): host separate businesses that operate inside your space, and approve
  // requests to collaborate. Free to host; a link-row out to the /settings/collaborators surface.
  { id: 'space.collaborators', label: 'Collaborators', desc: 'The businesses that operate inside your space, and requests to collaborate.', Icon: Handshake, family: 'audience', slot: 'people', gate: { kind: 'feature', fn: 'collaborators' }, featureKey: 'collaborators', render: 'link', deepLink: (s) => `${base(s)}/settings/collaborators`, order: 39.7, tier: 'primary', priority: 19.7, access: 'included' },

  // ── Offerings & money (independent modules) ──────────────────────────────────────────────────────────
  { id: 'space.booking', label: 'Booking', desc: 'Set the weekly times members can book, and see the calendar.', Icon: CalendarClock, family: 'offerings', slot: 'engage', gate: { kind: 'feature', fn: 'availability' }, featureKey: 'availability', render: 'panel', deepLink: (s) => `${base(s)}/settings/offerings#availability`, order: 40, tier: 'primary', priority: 30, access: 'freemium', freeNote: '15 bookings/mo free, then unlimited' },
  { id: 'space.memberships', label: 'Memberships', desc: 'The tiers members can join, and who has joined.', Icon: BadgeCheck, family: 'offerings', slot: 'engage', gate: { kind: 'feature', fn: 'memberships' }, featureKey: 'memberships', render: 'panel', deepLink: (s) => `${base(s)}/settings/offerings#memberships`, order: 45, tier: 'primary', priority: 31, access: 'freemium', freeNote: '10 members, 1 tier free · 5% take-rate, 3% on a paid plan' },
  { id: 'space.donations', label: 'Donations', desc: 'The fund, a short description, and the amounts members can pick.', Icon: HeartHandshake, family: 'offerings', slot: 'engage', gate: { kind: 'feature', fn: 'donations' }, featureKey: 'donations', render: 'panel', deepLink: (s) => `${base(s)}/settings/offerings#donations`, order: 50, tier: 'primary', priority: 32, access: 'included', freeNote: '5% take-rate, 3% on a paid plan' },
  { id: 'space.enroll', label: 'Enrollment', desc: 'The program details, and who has enrolled.', Icon: GraduationCap, family: 'offerings', slot: 'engage', gate: { kind: 'feature', fn: 'enroll' }, featureKey: 'enroll', render: 'panel', deepLink: (s) => `${base(s)}/settings/enroll`, order: 55, tier: 'primary', priority: 33, access: 'included' },
  // Practices + Journeys (the practitioner's content). Practices are the daily-log atom (each with its
  // own timer); Journeys compose them into multi week programs (the e-learning upsell: free spaces publish
  // one). Both are `link` rows out to their own space-scoped manager (data-heavy authoring, like Airwaves).
  // On the console they cluster with Airwaves into the "Content" group (console.tsx groupForModule).
  { id: 'space.practices', label: 'Practices', desc: 'Build the practices members do, each with its own timer.', Icon: Sparkles, family: 'offerings', slot: 'engage', gate: { kind: 'feature', fn: 'practices' }, featureKey: 'practices', render: 'link', deepLink: (s) => `${base(s)}/practices`, order: 56, tier: 'primary', priority: 33.5, access: 'included' },
  { id: 'space.journeys', label: 'Journeys', desc: 'Build multi week programs from your practices.', Icon: Route, family: 'offerings', slot: 'engage', gate: { kind: 'feature', fn: 'journeys' }, featureKey: 'journeys', render: 'link', deepLink: (s) => `${base(s)}/journeys`, order: 57, tier: 'primary', priority: 33.6, access: 'freemium', freeNote: '1 published free, then unlimited' },
  { id: 'space.tickets', label: 'Tickets', desc: 'Free or RSVP ticket tiers, and who has reserved a spot.', Icon: Ticket, family: 'offerings', slot: 'engage', gate: { kind: 'feature', fn: 'tickets' }, featureKey: 'tickets', render: 'panel', deepLink: (s) => `${base(s)}/settings/offerings#tickets`, order: 60, tier: 'primary', priority: 34, access: 'freemium', freeNote: '50 tickets, 1 event free, then unlimited' },
  { id: 'space.checkin', label: 'Check in', desc: 'Show the door code, and see who checked in.', Icon: DoorOpen, family: 'offerings', slot: 'engage', gate: { kind: 'feature', fn: 'checkin' }, featureKey: 'checkin', render: 'panel', deepLink: (s) => `${base(s)}/settings/offerings#checkin`, order: 65, tier: 'primary', priority: 35, access: 'included' },
  // Shop is now a first-class GATEABLE feature keyed on the `shop` function (SpaceFunctionKey), so it can
  // be turned off, role-gated, and entitlement-gated (the `storefront` tier key) like every sibling
  // offering — it is no longer the always-on outlier. Free Spaces can sell; a paid plan lowers fees.
  { id: 'space.services', label: 'Shop', desc: 'Your catalog, orders, and storefront.', Icon: Store, family: 'offerings', slot: 'engage', gate: { kind: 'feature', fn: 'shop' }, featureKey: 'shop', render: 'link', deepLink: (s) => `${base(s)}/settings/shop`, order: 70, tier: 'primary', priority: 40, access: 'freemium', freeNote: 'Full store · 5% take-rate, 3% on a paid plan' },
  // Airwaves (ADR-608, P1): the Space's audio/video Recordings library. Upload a Recording into the Loom,
  // manage the catalog, and attach a Recording to any offering, journey, event, or the Space itself.
  { id: 'space.airwaves', label: 'Airwaves', desc: 'Your recordings, and where each one plays.', Icon: Radio, family: 'offerings', slot: 'engage', gate: { kind: 'feature', fn: 'airwaves' }, featureKey: 'airwaves', render: 'link', deepLink: (s) => `${base(s)}/settings/airwaves`, order: 72, tier: 'primary', priority: 41, access: 'included' },
  // Loom Studio (per-space image library): the full-page manager for a space's own images — browse, upload,
  // organize, and delete. The image counterpart to Airwaves (audio/video); both are media libraries and
  // cluster into the "Content" group. Reuses the space-scoped Loom actions (loomImages / uploadLoomImage),
  // gated owner/admin/editor via the Manage console, so regular members only ever get the popup picker.
  { id: 'space.loom', label: 'Loom Studio', desc: 'Browse, upload, and organize your space images.', Icon: Images, family: 'offerings', slot: 'engage', gate: { kind: 'feature', fn: 'loom' }, featureKey: 'loom', render: 'link', deepLink: (s) => `${base(s)}/loom`, order: 73, tier: 'primary', priority: 41.5, access: 'included' },

  // ── Reach & comms ────────────────────────────────────────────────────────────────────────────────────
  // QR codes is the ONE reach card (ADR-782): Scans and insights (`space.insights`, same `qr` gate, the
  // /settings/qr#scans view) folds UNDER it on the console, so Reach shows one QR card with its scan
  // analytics nested rather than two near-duplicate rows onto the same page.
  { id: 'space.reach', label: 'QR codes', desc: 'Create codes for this space, and see the scans they drive.', Icon: QrCode, family: 'reach', slot: 'reach', gate: { kind: 'feature', fn: 'qr' }, featureKey: 'qr', render: 'panel', deepLink: (s) => `${base(s)}/settings/qr`, order: 75, tier: 'primary', priority: 50, placement: 'bank', access: 'freemium', freeNote: '3 codes free, then unlimited' },
  // Email is the ONE comms card (ADR-782): Email design (the canvas editor, `space.marketing`) and Email
  // style (the palette, `space.emailstyle`) fold UNDER it on the console — Compose / Design / Style read as
  // one Email surface. Each stays a first-class module (own deepLink + rail row).
  { id: 'space.comms', label: 'Email', desc: 'Write a campaign, pick who gets it, and send or schedule it.', Icon: Mail, family: 'reach', slot: 'comms', gate: { kind: 'feature', fn: 'email' }, featureKey: 'email', render: 'panel', deepLink: (s) => `${base(s)}/settings/email`, order: 80, tier: 'primary', priority: 55, placement: 'bank', access: 'freemium', freeNote: '300 sends/mo free, then 25,000/mo' },
  // Email design (Email in the Business CRM, P1): the FULL on-canvas email editor. Reuses the one Email Studio
  // engine (EmailCanvasEditor) pointed at this Space's own drafts, seeded from the Space brand. Gated on the
  // `email` function; nested under Email on the console. Distinct destination from `space.comms` (the composer).
  { id: 'space.marketing', label: 'Email design', desc: 'Design a branded email on the canvas, block by block.', Icon: Megaphone, family: 'reach', slot: 'comms', gate: { kind: 'feature', fn: 'email' }, featureKey: 'email', render: 'link', deepLink: (s) => `${base(s)}/marketing`, order: 81, tier: 'primary', priority: 56, access: 'freemium', parent: 'space.comms' },
  // Email style (Email in the Business CRM, P1): tune the brand-derived palette a Space's emails default to
  // (spaces.preferences.emailStyle, seeded from the brand accent). Gated on `email`; nested under Email.
  { id: 'space.emailstyle', label: 'Email style', desc: 'Set the brand colors your emails use by default.', Icon: Paintbrush, family: 'reach', slot: 'comms', gate: { kind: 'feature', fn: 'email' }, featureKey: 'email', render: 'link', deepLink: (s) => `${base(s)}/settings/email-style`, order: 82, tier: 'extra', priority: 57, access: 'freemium', parent: 'space.comms' },

  // ── Growth & billing ─────────────────────────────────────────────────────────────────────────────────
  { id: 'space.insights', label: 'Scans and insights', desc: 'Scans, growth, and how your space is doing.', Icon: BarChart3, family: 'growth', slot: 'insights', gate: { kind: 'feature', fn: 'qr' }, featureKey: 'qr', render: 'link', deepLink: (s) => `${base(s)}/settings/qr#scans`, order: 85, tier: 'extra', priority: 20, placement: 'bank', access: 'freemium', parent: 'space.reach' },
  { id: 'space.billing', label: 'Plan & Billing', desc: 'Your plan and pricing, what it unlocks, usage, and billing.', Icon: CreditCard, family: 'growth', slot: 'billing', gate: { kind: 'feature', fn: 'billing' }, featureKey: 'billing', render: 'panel', deepLink: (s) => `${base(s)}/settings/billing`, order: 90, tier: 'extra', priority: 30, placement: 'bank', access: 'included' },

  // ── System ───────────────────────────────────────────────────────────────────────────────────────────
  // The "Menu and features" (Module Manager) rail entry was REMOVED (item 7): the bottom More menu no longer
  // lists it. The /manage/modules page still exists for direct access; it is just no longer a menu item.
  // Danger renders as a rail LINK-row (its inline delete lives in the /manage console + Module Manager, which
  // special-case `space.danger` by id — the `render` value drives only the rail, ADR-546b). It has no
  // deepLink, so the rail row falls back to the /manage console (its delete control home). Never banked.
  { id: 'space.danger', label: 'Danger zone', desc: 'Delete this space. This cannot be undone.', Icon: Trash2, family: 'system', slot: 'danger', gate: { kind: 'always' }, featureKey: null, render: 'link', order: 99, tier: 'extra', priority: 99, access: 'included' },
]

/** Module ids that may NEVER be hidden from the menu or turned off: the shell config surfaces (Profile
 *  and Settings, Page) and Danger. Hiding any of these would strand the owner (they could not get back to
 *  edit their space). The Module Manager UI hard-disables the hide + feature controls for these, and
 *  `readModuleMenuPrefs` drops them from any stored hidden list. (Identity / Settings collapsed INTO
 *  `space.basics` "Profile and Settings" in ADR-782.) */
export const UNHIDEABLE_MODULE_IDS: readonly string[] = [
  'space.basics',
  'space.layout',
  'space.danger',
]

/** Whether a module may be hidden from the menu (everything but the shell + Danger + the Module Manager). */
export function isModuleHideable(id: string): boolean {
  return !UNHIDEABLE_MODULE_IDS.includes(id)
}

/** ADVANCED modules (ADR-796 progressive disclosure): deeper tools that stay OFF the primary menu until the
 *  owner activates them from the per-area control board. Chosen so every area keeps a sensible PRIMARY set
 *  up front and only its deeper/nested tools fold away: the four nested CRM workspaces (Automation · Lead
 *  capture · Capture links · Shared), the nested Email design + style, the nested Scans & insights, the
 *  niche offerings (Enrollment · Check in), and the deeper media libraries (Airwaves · Loom). Presentation
 *  only — never gates. A shell / Danger module is NEVER advanced (it must always show). */
const ADVANCED_MODULE_IDS: ReadonlySet<string> = new Set([
  'space.automation',
  'space.leads',
  'space.doors',
  'space.shared',
  'space.marketing',
  'space.emailstyle',
  'space.insights',
  'space.enroll',
  'space.checkin',
  'space.airwaves',
  'space.loom',
])

/** Whether a module is ADVANCED (collapsed until activated). An explicit `advanced` flag on the catalog row
 *  wins; otherwise the curated set above. A shell / Danger / Module Manager module is never advanced. */
export function isModuleAdvanced(module: SpaceModule): boolean {
  if (UNHIDEABLE_MODULE_IDS.includes(module.id) || module.id === 'space.danger') return false
  return module.advanced ?? ADVANCED_MODULE_IDS.has(module.id)
}

/** Whether a module id is ADVANCED — the id-keyed variant the rail uses (it holds App ids, not modules).
 *  An unknown id is not advanced (fail-open: never hide a surface we can't resolve). */
export function isAdvancedModuleId(id: string): boolean {
  const m = spaceModuleById(id)
  return m ? isModuleAdvanced(m) : false
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

/** Options that let the Module Manager (P3) override the default menu: hide modules, reorder them, and/or
 *  activate advanced ones (ADR-796 progressive disclosure). */
export interface ModuleManifestOptions {
  /** Module ids the owner has hidden from the menu. */
  hidden?: readonly string[]
  /** Module ids in the owner's preferred order; unlisted modules keep their catalog order, after these. */
  order?: readonly string[]
  /** ADVANCED module ids the owner has ACTIVATED (surfaced) from the control board. An `advanced` module is
   *  collapsed out of the menu unless its id appears here. Omitting the field (undefined) means "no owner
   *  override supplied" and, to keep the console/rail drift-guard comparing the FULL catalog, advanced
   *  modules are NOT collapsed — the collapse applies only once a caller passes an `activated` list (every
   *  production caller reads it from prefs, defaulting to []). */
  activated?: readonly string[]
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
  // Progressive disclosure (ADR-796): collapse an ADVANCED module unless the owner has ACTIVATED it. A
  // NULL set (opts.activated undefined) means "no override supplied" → do NOT collapse, so the un-overridden
  // catalog the console/rail drift-guard compares stays whole. A supplied list (every production caller
  // passes one from prefs, default []) collapses advanced modules not in it.
  const activated = opts.activated ? new Set(opts.activated) : null
  const enabled = SPACE_MODULES.filter(
    (m) =>
      isModuleEnabled(m, entitlements) &&
      !hidden.has(m.id) &&
      (!isModuleAdvanced(m) || activated === null || activated.has(m.id)),
  )
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
