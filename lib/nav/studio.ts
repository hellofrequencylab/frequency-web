// The Studio (operator) sub-tree of the ONE navigation registry
// (docs/NAV-SYSTEM-REDESIGN.md §5b, §8). PHASE 2 of the nav unification: the two
// hand-maintained admin catalogs — lib/admin/nav.ts (ADMIN_NAV) and
// app/(main)/admin/sections.ts (ADMIN_GROUPS) — collapse into THIS single declaration.
// Every operator destination is a `StudioLeaf` declared exactly ONCE here, carrying:
//   • its §5b Studio WORLD + world section (Overview · Community · Growth · Content ·
//     Platform) — the NEW five-world structure the rail / sub-nav / dashboards project;
//   • its LEGACY placement tags (`adminGroups` = which app/(main)/admin/sections.ts
//     DomainKey buckets it belongs to; `adminNav` = which lib/admin/nav.ts section +
//     heading it renders under) — so the two legacy catalogs derive their EXACT current
//     shapes from here and every existing consumer keeps compiling and rendering.
//
// GATES ARE UNCHANGED (§5b): each leaf keeps its EXACT current `min` + `staffDomain` +
// `staffLevel`, cross-referenced against BOTH old catalogs; where they disagreed the
// STRICTER gate was taken (noted inline). Moving where a gate is declared, never what it
// permits — a janitor-only page stays janitor-only.
//
// Framework-independent (no React / Next): icons are stored as lucide NAMES; the client
// catalogs (sections.ts) map them back to components. Roles are REUSED (lib/core/*),
// never redefined.

import type { CommunityRole } from '@/lib/core/roles'
import type { StaffDomain, Access } from '@/lib/core/staff-roles'

// ── The five Studio worlds (§5b) — the primary categories the operator spine projects.
// `key` is the world id; `href` its dashboard landing; `min`/`staffDomain` its floor.
export type StudioWorldKey = 'overview' | 'community' | 'growth' | 'content' | 'platform'

export type StudioWorld = {
  key: StudioWorldKey
  label: string
  blurb: string
  href: string
  /** lucide icon name (resolved by the consumer). */
  icon: string
  min: CommunityRole
  staffDomain?: StaffDomain
}

export const STUDIO_WORLDS: readonly StudioWorld[] = [
  {
    key: 'overview',
    label: 'Overview',
    blurb: 'The exec read and the daily queue.',
    href: '/admin',
    icon: 'LayoutDashboard',
    min: 'admin',
  },
  {
    key: 'community',
    label: 'Community',
    blurb: 'The people and their spaces. Circles, members, events, and trust and safety.',
    href: '/admin/community',
    icon: 'Users',
    min: 'host',
    staffDomain: 'community',
  },
  {
    key: 'growth',
    label: 'Growth',
    blurb: 'Grow it. Entry points, applications, campaigns, funnels, and the Resonance CRM.',
    href: '/admin/growth',
    icon: 'TrendingUp',
    min: 'host',
    staffDomain: 'marketing',
  },
  {
    key: 'content',
    label: 'Content',
    blurb: 'The Quest content suite, rewards economy, and the Loom library.',
    href: '/admin/programs',
    icon: 'Gamepad2',
    min: 'host',
    staffDomain: 'community',
  },
  {
    key: 'platform',
    label: 'Platform',
    blurb: 'The platform machine. Config, commerce, Vera, insights, and the system trail.',
    href: '/admin/operations',
    icon: 'SlidersHorizontal',
    min: 'janitor',
    staffDomain: 'platform',
  },
] as const

// ── The legacy `app/(main)/admin/sections.ts` domain keys (kept as-is so every consumer
// — the exec dashboard's `area('programs')`, the domain switcher, `related` strips, and
// path resolution — keeps working). Each StudioLeaf tags which of these it belongs to.
export type AdminDomainKey =
  | 'programs'
  | 'content'
  | 'rewards'
  | 'community'
  | 'growth'
  | 'acquisition'
  | 'crm'
  | 'marketing'
  | 'vera-ai'
  | 'operations'

// The legacy `lib/admin/nav.ts` section slugs (the admin sub-header top-level tabs).
export type AdminNavKey =
  | 'dashboard'
  | 'community'
  | 'leadership'
  | 'programs'
  | 'growth'
  | 'crm'
  | 'vera-ai'
  | 'operations'
  | 'marketplace'
  | 'qr'

/** Which legacy `ADMIN_GROUPS` domain a leaf renders under, and (optionally) the titled
 *  sub-section the dashboard buckets it beneath. A leaf can appear in several domains
 *  (the folded Growth/Programs roll-ups duplicate links from their sub-workspaces). */
export type AdminGroupTag = { domain: AdminDomainKey; section?: string }

/** Which legacy `ADMIN_NAV` section + heading a leaf renders under in the mega sub-nav. */
export type AdminNavTag = { section: AdminNavKey; heading?: string }

/** One operator destination — declared ONCE, projected onto the registry (studio spine),
 *  the ADMIN_GROUPS dashboards, and the ADMIN_NAV sub-header. */
export type StudioLeaf = {
  /** Stable key (= registry NavNode id = icon key). */
  id: string
  href: string
  label: string
  /** One-line purpose (dashboard area card / mega card). */
  desc: string
  /** lucide icon NAME (resolved by the consumer). */
  icon: string
  /** The community-ladder / staff-axis floor (ADR-208), verbatim from the old catalogs. */
  min: CommunityRole
  staffDomain?: StaffDomain
  /** Capability level the staff domain needs (default 'write' for admin surfaces). */
  staffLevel?: Access
  /** Active only on an exact path match (a domain / cockpit root). */
  exact?: boolean

  // ── §5b Studio placement (the NEW five-world structure) ──
  /** The Studio world this leaf lives in (§5b). Omit for legacy-only leaves that are NOT
   *  part of the approved five-world sub-tree (they still ride the derived catalogs). */
  world?: StudioWorldKey
  /** The §5b sub-page label (usually the same as `label`, shortened where §5b names it so). */
  worldLabel?: string
  /** Order within the world's sub-nav (§5b list order). */
  worldOrder?: number

  // ── Legacy placement (so the two old catalogs reproduce EXACTLY) ──
  adminGroups?: readonly AdminGroupTag[]
  adminNav?: AdminNavTag
}

// The full operator leaf superset. Order within each `adminGroups`/`adminNav` bucket is
// preserved by declaration order (the derivations keep it). Gates verbatim from the old
// catalogs; the two conflicts resolved to the stricter gate are flagged CONFLICT below.
export const STUDIO_LEAVES: readonly StudioLeaf[] = [
  // ═══════════════ OVERVIEW (§5b: Dashboard · Today) ═══════════════
  // Dashboard is the /admin exec read (ADMIN_HOME / the Dashboard section). Today is
  // Vera's daily queue (the CRM Today loop, surfaced as the Overview daily read).

  // ═══════════════ COMMUNITY ═══════════════
  // §5b: Circles · Templates · Hubs · Nexuses · Channels · Members · Roles · Events ·
  // Broadcasts · Moderation · Support
  { id: 'circles', href: '/admin/circles', label: 'Circles', desc: 'Create, edit, and archive circles.', icon: 'CircleDot', min: 'host', staffDomain: 'community',
    world: 'community', worldLabel: 'Circles', worldOrder: 0,
    adminGroups: [{ domain: 'community', section: 'Structure' }], adminNav: { section: 'community', heading: 'Spaces & groups' } },
  { id: 'circle-templates', href: '/admin/circle-templates', label: 'Circle Templates', desc: 'Starter Circle blueprints members remix into their own.', icon: 'CircleDot', min: 'host', staffDomain: 'community',
    world: 'community', worldLabel: 'Templates', worldOrder: 1,
    adminGroups: [{ domain: 'community', section: 'Structure' }], adminNav: { section: 'community', heading: 'Spaces & groups' } },
  { id: 'hubs', href: '/admin/hubs', label: 'Hubs', desc: 'Clusters of circles in an area.', icon: 'Building2', min: 'guide', staffDomain: 'structure',
    world: 'community', worldLabel: 'Hubs', worldOrder: 2,
    adminGroups: [{ domain: 'community', section: 'Structure' }], adminNav: { section: 'community', heading: 'Spaces & groups' } },
  { id: 'nexuses', href: '/admin/nexuses', label: 'Nexuses', desc: 'Regions that hold hubs.', icon: 'Network', min: 'mentor', staffDomain: 'structure',
    world: 'community', worldLabel: 'Nexuses', worldOrder: 3,
    adminGroups: [{ domain: 'community', section: 'Structure' }], adminNav: { section: 'community', heading: 'Spaces & groups' } },
  { id: 'channels', href: '/admin/channels', label: 'Channels', desc: 'Topical and event channels.', icon: 'Radio', min: 'host', staffDomain: 'community',
    world: 'community', worldLabel: 'Channels', worldOrder: 4,
    adminGroups: [{ domain: 'community', section: 'Structure' }], adminNav: { section: 'community', heading: 'Spaces & groups' } },
  { id: 'members', href: '/admin/members', label: 'Member Roster', desc: 'The platform census: every member, subscriber, and beta account.', icon: 'Users', min: 'janitor', staffDomain: 'members',
    world: 'community', worldLabel: 'Members', worldOrder: 5,
    adminGroups: [{ domain: 'community', section: 'People & access' }], adminNav: { section: 'community', heading: 'People' } },
  { id: 'connections', href: '/admin/connections', label: 'Connection Settings', desc: 'Connection and friend request settings.', icon: 'Users', min: 'janitor', staffDomain: 'members',
    adminNav: { section: 'community', heading: 'People' } },
  { id: 'roles', href: '/admin/roles', label: 'Roles & permissions', desc: 'Assign roles and the permission grid.', icon: 'Shield', min: 'janitor',
    world: 'community', worldLabel: 'Roles', worldOrder: 6,
    adminGroups: [{ domain: 'community', section: 'People & access' }], adminNav: { section: 'operations', heading: 'Platform' } },
  { id: 'personas', href: '/admin/personas', label: 'Partner verification', desc: 'Vet and verify partner persona claims.', icon: 'BadgeCheck', min: 'janitor', staffDomain: 'profiles',
    adminGroups: [{ domain: 'community', section: 'People & access' }], adminNav: { section: 'community', heading: 'People' } },
  { id: 'events', href: '/admin/events', label: 'Events', desc: 'Gatherings across your circles, plus posted events, claims, and poster quality.', icon: 'CalendarDays', min: 'host', staffDomain: 'community',
    world: 'community', worldLabel: 'Events', worldOrder: 7,
    adminGroups: [{ domain: 'community', section: 'Activity' }], adminNav: { section: 'community', heading: 'Activity' } },
  { id: 'dispatches', href: '/admin/dispatches', label: 'Broadcasts', desc: 'Posts and polls to your people.', icon: 'Megaphone', min: 'host', staffDomain: 'community',
    world: 'community', worldLabel: 'Broadcasts', worldOrder: 8,
    adminGroups: [{ domain: 'community', section: 'Activity' }], adminNav: { section: 'community', heading: 'Activity' } },
  { id: 'import', href: '/admin/import', label: 'Import from chat', desc: 'Import members and history from chat.', icon: 'Users', min: 'host', staffDomain: 'community',
    adminNav: { section: 'community', heading: 'Activity' } },
  { id: 'moderation', href: '/admin/moderation', label: 'Moderation', desc: 'Review and resolve reports.', icon: 'ShieldAlert', min: 'host', staffDomain: 'community',
    world: 'community', worldLabel: 'Moderation', worldOrder: 9,
    adminGroups: [{ domain: 'community', section: 'Trust & safety' }], adminNav: { section: 'community', heading: 'Activity' } },
  { id: 'support', href: '/admin/support', label: 'Support', desc: 'Member support tickets and help requests.', icon: 'LifeBuoy', min: 'host', staffDomain: 'members',
    world: 'community', worldLabel: 'Support', worldOrder: 10,
    adminGroups: [{ domain: 'community', section: 'Trust & safety' }], adminNav: { section: 'operations', heading: 'Platform' } },
  { id: 'sms', href: '/admin/sms', label: 'Text messages', desc: 'SMS provisioning status and the operator on/off switch.', icon: 'MessageSquare', min: 'janitor', staffDomain: 'members',
    adminNav: { section: 'operations', heading: 'Platform' } },
  { id: 'nonprofit-verifications', href: '/admin/nonprofit-verifications', label: 'Non Profit verification', desc: 'Review and approve 501(c)(3) verification requests.', icon: 'BadgeCheck', min: 'janitor', staffDomain: 'profiles',
    adminNav: { section: 'operations', heading: 'Platform' } },

  // ═══════════════ CONTENT ═══════════════
  // §5b: Seasons · Journeys · Practices · Challenges · Training · Tips · Gamification ·
  // Store · Tasks · Loom
  { id: 'content-seasons', href: '/admin/content/seasons', label: 'Seasons', desc: 'Season identity, theme, and lifecycle.', icon: 'CalendarDays', min: 'host', staffDomain: 'community',
    world: 'content', worldLabel: 'Seasons', worldOrder: 0,
    adminGroups: [{ domain: 'content', section: 'Content' }], adminNav: { section: 'programs', heading: 'Content' } },
  { id: 'content-journeys', href: '/admin/content/journeys', label: 'Journeys', desc: 'Curate and publish official journeys.', icon: 'BookOpen', min: 'host', staffDomain: 'community',
    world: 'content', worldLabel: 'Journeys', worldOrder: 1,
    adminGroups: [{ domain: 'content', section: 'Content' }], adminNav: { section: 'programs', heading: 'Content' } },
  { id: 'content-practices', href: '/admin/content/practices', label: 'Practices', desc: 'The practice catalog and its adopters.', icon: 'Sparkles', min: 'host', staffDomain: 'community',
    world: 'content', worldLabel: 'Practices', worldOrder: 2,
    adminGroups: [{ domain: 'content', section: 'Content' }], adminNav: { section: 'programs', heading: 'Content' } },
  { id: 'content-practices-health', href: '/admin/content/practices/health', label: 'Library health', desc: 'Practice library health and coverage.', icon: 'Sparkles', min: 'host', staffDomain: 'community',
    adminNav: { section: 'programs', heading: 'Content' } },
  { id: 'content-challenges', href: '/admin/content/challenges', label: 'Challenges', desc: 'Define challenges and watch completion.', icon: 'Target', min: 'host', staffDomain: 'community',
    world: 'content', worldLabel: 'Challenges', worldOrder: 3,
    adminGroups: [{ domain: 'content', section: 'Content' }], adminNav: { section: 'programs', heading: 'Content' } },
  { id: 'content-training', href: '/admin/content/training', label: 'Role training', desc: 'The advancement curriculum each promotion teaches.', icon: 'GraduationCap', min: 'host', staffDomain: 'community',
    world: 'content', worldLabel: 'Training', worldOrder: 4,
    adminGroups: [{ domain: 'content', section: 'Content' }], adminNav: { section: 'programs', heading: 'Content' } },
  { id: 'content-tips', href: '/admin/content/tips', label: 'Creator tips', desc: 'Tips and prompts for content creators.', icon: 'Lightbulb', min: 'host', staffDomain: 'community',
    world: 'content', worldLabel: 'Tips', worldOrder: 5,
    adminGroups: [{ domain: 'content', section: 'Content' }], adminNav: { section: 'programs', heading: 'Content' } },
  { id: 'gamification', href: '/admin/gamification', label: 'Gamification & rewards', desc: 'Achievements, seasons, rewards.', icon: 'Trophy', min: 'host', staffDomain: 'community',
    world: 'content', worldLabel: 'Gamification', worldOrder: 6,
    adminGroups: [{ domain: 'rewards', section: 'Rewards' }], adminNav: { section: 'programs', heading: 'Engagement' } },
  { id: 'store', href: '/admin/store', label: 'Store', desc: 'Manage Vault Store items and catalog.', icon: 'ShoppingBag', min: 'host', staffDomain: 'community',
    world: 'content', worldLabel: 'Store', worldOrder: 7,
    adminGroups: [{ domain: 'rewards', section: 'Rewards' }], adminNav: { section: 'programs', heading: 'Engagement' } },
  { id: 'crew-tasks', href: '/admin/crew-tasks', label: 'Crew tasks', desc: 'Define and verify member tasks.', icon: 'ClipboardList', min: 'host', staffDomain: 'community',
    world: 'content', worldLabel: 'Tasks', worldOrder: 8,
    adminGroups: [{ domain: 'rewards', section: 'Rewards' }], adminNav: { section: 'programs', heading: 'Engagement' } },
  { id: 'library', href: '/admin/library', label: 'Loom Studio', desc: 'The media & asset library: every image the site uses, plus the illustration kit.', icon: 'Images', min: 'janitor',
    world: 'content', worldLabel: 'Loom', worldOrder: 9,
    adminGroups: [{ domain: 'acquisition', section: 'Assets' }] },

  // ═══════════════ GROWTH ═══════════════
  // §5b: Entry points · QR · Referrals · Applications · Onboarding · Campaigns · Funnels ·
  // Automations · CRM (Roster · Intelligence · Pipeline · Segments)
  { id: 'entry-points', href: '/entry-points', label: 'Entry points', desc: 'Where people first enter your spaces.', icon: 'QrCode', min: 'host', staffDomain: 'marketing',
    world: 'growth', worldLabel: 'Entry points', worldOrder: 0,
    adminGroups: [{ domain: 'acquisition', section: 'Entry points' }] },
  // CONFLICT (QR Studio): ADMIN_NAV gated 'admin'+qr; ADMIN_GROUPS gated 'host'+qr.
  // STRICTER = 'admin' (fewer viewers). Resolved to 'admin' + staffDomain 'qr'.
  { id: 'qr', href: '/admin/qr', label: 'QR Studio', desc: 'Generate, design, and manage all QR codes.', icon: 'QrCode', min: 'admin', staffDomain: 'qr',
    world: 'growth', worldLabel: 'QR', worldOrder: 1,
    adminGroups: [{ domain: 'acquisition', section: 'Entry points' }], adminNav: { section: 'qr' } },
  { id: 'qr-stats', href: '/admin/qr/stats', label: 'Scan stats', desc: 'QR scan analytics.', icon: 'QrCode', min: 'admin', staffDomain: 'qr',
    adminNav: { section: 'qr' } },
  { id: 'referrals', href: '/admin/referrals', label: 'Referrals', desc: 'The personal-code referral funnel: signups, activations, and top referrers.', icon: 'Share2', min: 'host', staffDomain: 'marketing',
    world: 'growth', worldLabel: 'Referrals', worldOrder: 2,
    adminGroups: [{ domain: 'acquisition', section: 'Entry points' }], adminNav: { section: 'growth', heading: 'Acquisition' } },
  { id: 'growth-applications', href: '/admin/growth/applications', label: 'Applications', desc: 'The dual-track review queue: builders apply to host, operators bring an offering, and seekers wait for a Circle near them.', icon: 'ClipboardList', min: 'host', staffDomain: 'members',
    world: 'growth', worldLabel: 'Applications', worldOrder: 3,
    adminGroups: [{ domain: 'acquisition', section: 'Waitlist & Applications' }], adminNav: { section: 'growth', heading: 'Acquisition' } },
  { id: 'onboarding-controls', href: '/admin/onboarding-controls', label: 'Onboarding & referral controls', desc: 'Turn Next Steps prompts, popups, and referrals on or off.', icon: 'ToggleRight', min: 'janitor',
    world: 'growth', worldLabel: 'Onboarding', worldOrder: 4,
    adminGroups: [{ domain: 'acquisition', section: 'Onboarding' }], adminNav: { section: 'operations', heading: 'Configuration' } },
  { id: 'onboarding-splash', href: '/pages/splash', label: 'Onboarding splash', desc: 'The first-run splash members land on.', icon: 'Rocket', min: 'janitor',
    adminGroups: [{ domain: 'acquisition', section: 'Onboarding' }] },
  { id: 'onboarding-sequences', href: '/pages/sequences', label: 'Splash pages', desc: 'Sequenced splash pages and flows.', icon: 'Layers', min: 'janitor',
    adminGroups: [{ domain: 'acquisition', section: 'Onboarding' }] },
  { id: 'walkthroughs', href: '/admin/walkthroughs', label: 'Walkthroughs', desc: 'Instructional walkthroughs by role + trigger', icon: 'GraduationCap', min: 'host', staffDomain: 'marketing',
    adminGroups: [{ domain: 'acquisition', section: 'Onboarding' }], adminNav: { section: 'operations', heading: 'Configuration' } },
  { id: 'keystone-density', href: '/admin/keystone/density', label: 'Density by city', desc: 'The cold-start read: where the community has a real pulse, and where a corner is still cold enough to want a founder seeded.', icon: 'Telescope', min: 'admin', staffDomain: 'insights', staffLevel: 'read',
    adminGroups: [{ domain: 'acquisition', section: 'Expansion' }] },
  // ── Campaigns / Marketing ──
  // RETIRED from the menus (2026-07): the legacy email/campaign composing surface — Messaging,
  // Campaigns, Funnels (growth-funnels), Campaign builder (marketing-funnels), Automations, and
  // Nurture — is being rolled into the Resonance CRM Marketing tab (/admin/crm/marketing), which
  // composes in the draft-first popup over the same `campaigns` table. Their leaves are removed so they
  // no longer appear in any admin menu; the PAGES stay reachable (deep links + the roll-in plan uses
  // them) — see docs/DECISIONS.md ADR-623 for the plan to fold the usable functions into the CRM.
  { id: 'marketing-beta', href: '/admin/marketing/beta', label: 'Beta waitlist', desc: 'Triage the waitlist and send invites.', icon: 'Rocket', min: 'host', staffDomain: 'marketing',
    adminGroups: [{ domain: 'marketing', section: 'Audience' }], adminNav: { section: 'growth', heading: 'Marketing' } },
  // Beta Command Center. The operator home for the Beta
  // launch: the phase plan, the task board, admission waves, and the APPROVAL QUEUE where
  // nothing sends without an admin/janitor sign-off. A ?tab= workspace (today · stats ·
  // strategy · phases · timeline · email), like the Vera AI dashboard. The legacy Beta
  // waitlist leaf above stays live until Wave 2 folds its triage into this center.
  { id: 'beta-command', href: '/admin/beta', label: 'Beta Command', desc: 'Run the Beta launch: the phase plan, admission waves, and the approval queue where nothing sends without your sign-off.', icon: 'Rocket', min: 'host', staffDomain: 'marketing',
    world: 'growth', worldLabel: 'Beta Command', worldOrder: 13,
    adminGroups: [{ domain: 'marketing', section: 'Audience' }], adminNav: { section: 'growth', heading: 'Marketing' } },
  { id: 'marketing-analytics', href: '/admin/marketing/analytics', label: 'Marketing analytics', desc: 'Sends, opens, clicks, and bounces by type.', icon: 'PieChart', min: 'host', staffDomain: 'marketing',
    adminGroups: [{ domain: 'marketing', section: 'Analytics' }], adminNav: { section: 'growth', heading: 'Marketing' } },
  { id: 'marketing-deliverability', href: '/admin/marketing/deliverability', label: 'Deliverability', desc: 'Outbox health and the dead-letter queue, with one-tap recovery.', icon: 'Activity', min: 'host', staffDomain: 'marketing',
    adminGroups: [{ domain: 'marketing', section: 'Analytics' }] },
  { id: 'marketing-market-read', href: '/admin/marketing/market-read', label: 'Market read', desc: 'Demand, geography, and content performance.', icon: 'Telescope', min: 'host', staffDomain: 'marketing',
    adminGroups: [{ domain: 'marketing', section: 'Analytics' }], adminNav: { section: 'vera-ai' } },
  { id: 'marketing-control-panel', href: '/admin/marketing/messaging/control-panel', label: 'Control panel', desc: 'Who got what: every campaign email and broadcast Dispatch, per recipient, with where it landed.', icon: 'Send', min: 'host', staffDomain: 'marketing',
    adminGroups: [{ domain: 'marketing', section: 'Analytics' }], adminNav: { section: 'growth', heading: 'Marketing' } },
  { id: 'marketing-agent', href: '/admin/marketing/agent', label: 'Marketing agent', desc: 'Ask the AI operator to draft, segment, and run the busywork.', icon: 'Bot', min: 'host', staffDomain: 'marketing',
    adminGroups: [{ domain: 'marketing', section: 'AI operator' }], adminNav: { section: 'vera-ai' } },
  // ── CRM (§5b: Resonance CRM · Intelligence · Pipeline · Segments). The master-detail
  //    Resonance home (a searchable scored roster + the full member profile, contact info,
  //    network, and message tools in one view) absorbed the old Cockpit, Contacts, All
  //    Contacts, and Member Intelligence tabs; Deals became the rescoped Pipeline. ──
  { id: 'crm', href: '/admin/crm', label: 'Roster', desc: 'Resonance CRM home. The searchable scored roster: pick a member to see their full profile, contact info, network, notes, and message tools in one view. Marketing, Intelligence, and Pipeline live here.', icon: 'Users', min: 'janitor', exact: true,
    world: 'growth', worldLabel: 'Resonance CRM', worldOrder: 8,
    adminGroups: [{ domain: 'crm', section: 'Resonance' }], adminNav: { section: 'crm', heading: 'Engine' } },
  { id: 'crm-intelligence', href: '/admin/crm/intelligence', label: 'Intelligence', desc: "Vera's daily queue, the saved plays, and the resonance graph in one view.", icon: 'ClipboardList', min: 'janitor',
    world: 'overview', worldLabel: 'Intelligence', worldOrder: 1,
    adminGroups: [{ domain: 'crm', section: 'Resonance' }], adminNav: { section: 'crm', heading: 'Engine' } },
  { id: 'crm-pipeline', href: '/admin/crm/pipeline', label: 'Pipeline', desc: 'Upsell members into Business Spaces and grow donations: every prospect by stage, split by lane, with quick add and one-tap stage moves.', icon: 'Briefcase', min: 'host', staffDomain: 'marketing',
    world: 'growth', worldLabel: 'CRM: Pipeline', worldOrder: 9,
    adminGroups: [{ domain: 'crm', section: 'Pipeline' }], adminNav: { section: 'crm', heading: 'Engine' } },
  // RETIRED from the menu (2026-07): the admin "Contacts" tab was the original pre-Resonance CRM and is
  // fully replaced by the Resonance CRM (Roster + Intelligence + Pipeline + Marketing). Its leaf is removed
  // so it no longer shows in any admin menu. The PAGE at /admin/marketing/contacts stays reachable (the
  // platform importer still lands there via the ROOT-space contacts, and deep links from widgets / the CRM
  // graph resolve to it) — this is a MENU removal only, not a page deletion. NOTE: the member-facing "My
  // Contacts" (the personal CRM: card scanner + in-person capture + business lead-gen over network_contacts)
  // is a DIFFERENT surface and is intentionally untouched.
  // Marketing — compose + send email to the whole community or a section (all members, a circle, a saved
  // segment, or individuals), with campaigns / funnels / drafts / sent in one place. Reuses the messaging
  // console + the block editor + the gated send pipeline; the popup composer always saves as a draft.
  { id: 'crm-marketing', href: '/admin/crm/marketing', label: 'Marketing', desc: 'Compose and send email to the whole community or a section: all members, a circle, a saved segment, or individuals. Campaigns, funnels, drafts, and sent in one place.', icon: 'Send', min: 'janitor', staffDomain: 'marketing',
    world: 'growth', worldLabel: 'CRM: Marketing', worldOrder: 10,
    adminGroups: [{ domain: 'crm', section: 'Marketing' }], adminNav: { section: 'crm', heading: 'Engine' } },
  // Contacts — the whole roster in one place: members, subscribers, and imported leads, each read
  // through the classifier (status, community role, business standing, activity, Spaces, relationship
  // kinds) with plenty of sorting + faceting, plus the "ready for a Business Space" upgrade segment.
  { id: 'crm-contacts', href: '/admin/crm/contacts', label: 'Contacts', desc: 'Every contact in one roster: members, subscribers, and imported leads. Sort and filter by status, community role, Space, relationship, and business standing, and spot members ready to upgrade to a Business Space.', icon: 'Contact', min: 'janitor', staffDomain: 'marketing',
    world: 'growth', worldLabel: 'CRM: Contacts', worldOrder: 12,
    adminGroups: [{ domain: 'crm', section: 'Resonance' }], adminNav: { section: 'crm', heading: 'Engine' } },
  // Inbox (ADR-629) — the 2-way threaded conversations view. Reads the contact_interactions timeline
  // (inbound + outbound) grouped by contact; the reply composer enqueues through the gated send path.
  { id: 'crm-inbox', href: '/admin/crm/inbox', label: 'Inbox', desc: 'Every contact conversation in one place: read the thread and reply. Replies go out through the consent gate.', icon: 'Inbox', min: 'janitor', staffDomain: 'marketing',
    world: 'growth', worldLabel: 'CRM: Inbox', worldOrder: 15,
    adminGroups: [{ domain: 'crm', section: 'Resonance' }], adminNav: { section: 'crm', heading: 'Engine' } },
  // Tasks (ADR-628) — the operator follow-up board (open/done/snoozed), optionally tied to a contact.
  // Distinct from member-facing crew_tasks (the volunteer economy); this is the staff to-do queue.
  { id: 'crm-tasks', href: '/admin/crm/tasks', label: 'Tasks', desc: 'Your CRM follow-up list: queue a call-back, mark it done, or snooze it for later.', icon: 'ListTodo', min: 'janitor', staffDomain: 'marketing',
    world: 'growth', worldLabel: 'CRM: Tasks', worldOrder: 16,
    adminGroups: [{ domain: 'crm', section: 'Resonance' }], adminNav: { section: 'crm', heading: 'Engine' } },
  { id: 'segments', href: '/admin/segments', label: 'Segments', desc: 'Saved audiences by tag and trait.', icon: 'PieChart', min: 'janitor', staffDomain: 'insights', staffLevel: 'read',
    world: 'growth', worldLabel: 'CRM: Segments', worldOrder: 11,
    adminGroups: [{ domain: 'crm', section: 'Audiences' }] },

  // ═══════════════ PLATFORM ═══════════════
  // §5b: Menu · Pages · Page layout · Theme · Spaces · Marketplace · Payments · Pricing ·
  // Vera · Insights · Demo · Audit
  { id: 'menu', href: '/admin/menu', label: 'Menu manager', desc: 'Order and hide the one shared nav menu; set who reaches each item.', icon: 'Menu', min: 'janitor',
    world: 'platform', worldLabel: 'Menu', worldOrder: 0,
    adminGroups: [{ domain: 'operations', section: 'Platform' }], adminNav: { section: 'operations', heading: 'Configuration' } },
  { id: 'pages', href: '/pages', label: 'Pages', desc: 'The page library: open any page to edit it in place. Marketing pages + beta induction too.', icon: 'FileText', min: 'admin',
    world: 'platform', worldLabel: 'Pages', worldOrder: 1,
    adminGroups: [{ domain: 'operations', section: 'Platform' }] },
  { id: 'page-layout', href: '/admin/page-layout', label: 'Page layout', desc: "Frame each route's right rail: Global, Scoped, or full-width Focus.", icon: 'LayoutPanelLeft', min: 'janitor',
    world: 'platform', worldLabel: 'Page layout', worldOrder: 2,
    adminGroups: [{ domain: 'operations', section: 'Platform' }], adminNav: { section: 'operations', heading: 'Configuration' } },
  { id: 'appearance', href: '/admin/appearance', label: 'Theme Studio', desc: 'Brand themes, palettes, and seasonal looks. Edit and assign without code.', icon: 'Palette', min: 'janitor',
    world: 'platform', worldLabel: 'Theme', worldOrder: 3,
    adminGroups: [{ domain: 'operations', section: 'Platform' }], adminNav: { section: 'operations', heading: 'Configuration' } },
  { id: 'spaces', href: '/admin/spaces', label: 'Spaces', desc: 'White-label tenants: set each Space its theme and brand, view its live profile, or open the owner settings.', icon: 'Building2', min: 'janitor',
    world: 'platform', worldLabel: 'Spaces', worldOrder: 4,
    adminGroups: [{ domain: 'operations', section: 'Platform' }], adminNav: { section: 'qr' } },
  { id: 'marketplace', href: '/admin/marketplace', label: 'Marketplace', desc: 'Listings, the shop catalog, and area visibility across General, Housing, Makers, and Shop.', icon: 'ShoppingBag', min: 'admin', staffDomain: 'platform',
    world: 'platform', worldLabel: 'Marketplace', worldOrder: 5,
    adminGroups: [{ domain: 'operations', section: 'Commerce' }], adminNav: { section: 'marketplace', heading: 'Catalog' } },
  { id: 'marketplace-orders', href: '/admin/marketplace/orders', label: 'Marketplace orders', desc: 'Every order across makers and the shop, with one-tap refunds.', icon: 'CreditCard', min: 'admin', staffDomain: 'platform',
    adminGroups: [{ domain: 'operations', section: 'Commerce' }], adminNav: { section: 'marketplace', heading: 'Activity' } },
  { id: 'marketplace-reports', href: '/admin/marketplace/reports', label: 'Marketplace reports', desc: 'The moderation queue for reported listings and sellers.', icon: 'ShieldAlert', min: 'admin', staffDomain: 'platform',
    adminGroups: [{ domain: 'operations', section: 'Commerce' }], adminNav: { section: 'marketplace', heading: 'Activity' } },
  { id: 'marketplace-disputes', href: '/admin/marketplace/disputes', label: 'Marketplace disputes', desc: 'Buyer disputes and refund requests on orders, with resolve controls.', icon: 'ShieldAlert', min: 'admin', staffDomain: 'platform',
    adminGroups: [{ domain: 'operations', section: 'Commerce' }], adminNav: { section: 'marketplace', heading: 'Activity' } },
  { id: 'marketplace-reviews', href: '/admin/marketplace/reviews', label: 'Marketplace reviews', desc: 'Every rating members left on a listing or Shop item, with hide and restore controls.', icon: 'Star', min: 'admin', staffDomain: 'platform',
    adminGroups: [{ domain: 'operations', section: 'Commerce' }], adminNav: { section: 'marketplace', heading: 'Activity' } },
  { id: 'payments', href: '/admin/payments', label: 'Payments', desc: 'Turn host payouts (tips, tickets, sales) on or off.', icon: 'CreditCard', min: 'janitor',
    world: 'platform', worldLabel: 'Payments', worldOrder: 6,
    adminGroups: [{ domain: 'operations', section: 'Platform' }], adminNav: { section: 'operations', heading: 'Platform' } },
  { id: 'pricing', href: '/admin/pricing', label: 'Pricing', desc: 'Plans, prices, feature gates, and the switches that govern billing. Ships off.', icon: 'CreditCard', min: 'janitor',
    world: 'platform', worldLabel: 'Pricing', worldOrder: 7,
    adminGroups: [{ domain: 'operations', section: 'Platform' }], adminNav: { section: 'operations', heading: 'Platform' } },
  // Vera (§5b: the assistant world root). ADMIN_NAV gated janitor + insights.
  // Vera config: the ADMIN_GROUPS card points at the ?tab=vera surface; the ADMIN_NAV
  // section ROOT (/admin/vera-ai) is declared on the spec, not here.
  { id: 'vera-ai', href: '/admin/vera-ai?tab=vera', label: 'Vera config', desc: 'Voice, responses, and induction copy.', icon: 'Bot', min: 'janitor', staffDomain: 'insights',
    world: 'platform', worldLabel: 'Vera', worldOrder: 8,
    adminGroups: [{ domain: 'vera-ai', section: 'Assistant' }] },
  { id: 'vera-help-gaps', href: '/admin/vera-ai?tab=help-gaps', label: 'Help gaps', desc: 'Questions Vera deflected. The to-write list.', icon: 'HelpCircle', min: 'janitor',
    adminGroups: [{ domain: 'vera-ai', section: 'Assistant' }] },
  { id: 'vera-ai-controls', href: '/admin/vera-ai?tab=ai', label: 'AI controls', desc: 'Turn AI on or off platform-wide; usage and audit.', icon: 'Power', min: 'janitor', staffDomain: 'platform',
    adminGroups: [{ domain: 'vera-ai', section: 'Assistant' }] },
  { id: 'vera-studio', href: '/admin/vera-ai?tab=studio', label: 'AI Studio', desc: 'Ranked AI recommendations and one-click, reversible changes.', icon: 'Lightbulb', min: 'admin', staffDomain: 'insights',
    adminGroups: [{ domain: 'vera-ai', section: 'Intelligence' }] },
  { id: 'insights', href: '/admin/insights', label: 'Insights', desc: 'All analytics in one place: the read, engagement, outcomes, marketing intel, expansion, and finances.', icon: 'Sparkles', min: 'janitor', staffDomain: 'insights', staffLevel: 'read',
    world: 'platform', worldLabel: 'Insights', worldOrder: 9,
    adminGroups: [{ domain: 'vera-ai', section: 'Intelligence' }], adminNav: { section: 'vera-ai' } },
  { id: 'demo', href: '/admin/demo', label: 'Demo Studio', desc: 'Generate, manage, and purge seeded demo content.', icon: 'Sparkles', min: 'janitor',
    world: 'platform', worldLabel: 'Demo', worldOrder: 10,
    adminGroups: [{ domain: 'operations', section: 'System' }], adminNav: { section: 'operations', heading: 'Configuration' } },
  // Business Seeder (docs/BUSINESS-IMPORTER.md §8, P3). The operator console that pastes a
  // business's URLs and returns a reviewed, seeded Space. A janitor operator tool that WRITES
  // Spaces, so it sits beside Demo Studio in the platform/System world. Its page gates
  // structure:write (requireStaffCap), and every seeded Space defaults to an unlisted demo.
  // NOTE: registered here (STUDIO_LEAVES), not in ADMIN_MODULES — a top-level /admin operator
  // PAGE is a Studio leaf, exactly like Demo Studio; ADMIN_MODULES is the scope-attached page
  // RAIL (its 'global' rows are personal account surfaces, the wrong home for an operator page).
  // Contract-clean: STUDIO_LEAVES is not a *_MODULES catalog, so check:menu is satisfied (ADR).
  { id: 'business-seeder', href: '/admin/business-seeder', label: 'Business Seeder', desc: 'Paste a business’s URLs and get a reviewed, seeded Space.', icon: 'Building2', min: 'janitor',
    world: 'platform', worldLabel: 'Business Seeder', worldOrder: 11,
    adminGroups: [{ domain: 'operations', section: 'System' }], adminNav: { section: 'operations', heading: 'Configuration' } },
  // Listing Seeder (docs: Classifieds & Housing Seeder). A sibling of the Business Seeder: an operator
  // pastes copied classifieds / housing listing copy + photos, the AI extracts the fields, and after
  // review it publishes a listing held by the Frequency seed account until the poster claims it. A
  // janitor operator tool that WRITES public content, so it sits beside Business Seeder in the
  // platform/System world. Registered here (STUDIO_LEAVES), not in ADMIN_MODULES — a top-level /admin
  // operator PAGE is a Studio leaf. Its page gates structure:write (requireStaffCap).
  { id: 'listing-seeder', href: '/admin/listing-seeder', label: 'Listing Seeder', desc: 'Paste a classifieds or housing listing and get a reviewed, published listing to claim.', icon: 'ClipboardPaste', min: 'janitor',
    world: 'platform', worldLabel: 'Listing Seeder', worldOrder: 12,
    adminGroups: [{ domain: 'operations', section: 'System' }], adminNav: { section: 'operations', heading: 'Configuration' } },
  { id: 'audit', href: '/admin/audit', label: 'Audit log', desc: 'Sensitive admin actions. The security trail.', icon: 'ScrollText', min: 'admin',
    world: 'platform', worldLabel: 'Audit', worldOrder: 11,
    adminGroups: [{ domain: 'operations', section: 'System' }], adminNav: { section: 'operations', heading: 'Platform' } },
] as const

// ── Overview world sub-pages that are not admin leaves (Dashboard is the /admin root) ──
// Dashboard is the exec read; it is the Overview world root (STUDIO_WORLDS overview.href).
// Today rides the CRM Today leaf (id 'crm-today', world:'overview'). No extra leaf needed.

// ═══════════════════════════════════════════════════════════════════════════════
// LEGACY DERIVATION LAYER
// The two old catalogs (ADMIN_GROUPS, ADMIN_NAV) reproduce their EXACT current shapes
// as DERIVATIONS over STUDIO_LEAVES. Their bespoke structure — the ten dashboard
// domains, the folded roll-up tab-links, the group blurbs / related strips / primary
// flags, and the ten sub-header sections — is captured by the descriptors below, so a
// feature is declared ONCE (its leaf above) and the legacy views are generated. The
// shims in lib/admin/nav.ts + app/(main)/admin/sections.ts read these and build the
// arrays their consumers expect, unchanged.
// ═══════════════════════════════════════════════════════════════════════════════

const LEAF_BY_ID = new Map(STUDIO_LEAVES.map((l) => [l.id, l]))

/** Look a leaf up by id (the derivations reference leaves by id). */
export function studioLeaf(id: string): StudioLeaf | undefined {
  return LEAF_BY_ID.get(id)
}

// ── ADMIN_GROUPS descriptor (app/(main)/admin/sections.ts) ──
// Each entry = one dashboard domain. `links` is the ORDERED list of what the domain
// shows: a leaf id (real page, gate + icon + desc pulled from its StudioLeaf) OR a
// `synthetic` roll-up tab-link (the folded Programs/Growth workspaces point at a ?tab
// route, not a page of their own). `section` overrides the leaf's default bucket for a
// domain that groups differently. Verbatim from the old ADMIN_GROUPS.
export type AdminGroupLinkRef =
  | { leaf: string; section?: string }
  | {
      synthetic: {
        href: string
        label: string
        desc: string
        icon: string
        min: CommunityRole
        staffDomain?: StaffDomain
        staffLevel?: Access
        section?: string
      }
    }

export type AdminGroupSpec = {
  key: AdminDomainKey
  label: string
  blurb: string
  href: string
  icon: string
  min: CommunityRole
  staffDomain?: StaffDomain
  related?: readonly AdminDomainKey[]
  primary?: boolean
  links: readonly AdminGroupLinkRef[]
}

export const ADMIN_GROUP_SPECS: readonly AdminGroupSpec[] = [
  {
    key: 'programs', label: 'Programs',
    blurb: 'The game. Content, seasons, rewards, and the crews that run them.',
    href: '/admin/programs', icon: 'Gamepad2', min: 'host', staffDomain: 'community',
    related: ['community', 'vera-ai'],
    links: [
      { synthetic: { href: '/admin/programs?tab=content', label: 'Content', desc: 'Seasons, Journeys, Practices, and Challenges.', icon: 'Map', min: 'host', staffDomain: 'community', section: 'Workspaces' } },
      { synthetic: { href: '/admin/programs?tab=rewards', label: 'Rewards & economy', desc: 'Gamification, the store, retroactive rewards, and crew tasks.', icon: 'Trophy', min: 'host', staffDomain: 'community', section: 'Workspaces' } },
    ],
  },
  {
    key: 'content', label: 'Content',
    blurb: 'The Quest content suite. Seasons, Journeys, Practices, Challenges, and creator tips.',
    href: '/admin/programs?tab=content', icon: 'Map', min: 'host', staffDomain: 'community',
    primary: false, related: ['programs', 'community'],
    links: [
      { leaf: 'content-seasons' }, { leaf: 'content-journeys' }, { leaf: 'content-practices' },
      { leaf: 'content-challenges' }, { leaf: 'content-training' }, { leaf: 'content-tips' },
    ],
  },
  {
    key: 'rewards', label: 'Rewards & economy',
    blurb: 'The economy. Gamification, the Vault Store, retroactive grants, and crew tasks.',
    href: '/admin/programs?tab=rewards', icon: 'Trophy', min: 'host', staffDomain: 'community',
    primary: false, related: ['programs'],
    links: [{ leaf: 'gamification' }, { leaf: 'store' }, { leaf: 'crew-tasks' }],
  },
  {
    key: 'community', label: 'Community',
    blurb: 'The people and their spaces. Circles, members, events, and trust and safety.',
    href: '/admin/community', icon: 'Users', min: 'host', staffDomain: 'community',
    related: ['programs', 'crm'],
    links: [
      { leaf: 'circles' }, { leaf: 'circle-templates' }, { leaf: 'hubs' }, { leaf: 'nexuses' }, { leaf: 'channels' },
      { leaf: 'members' }, { leaf: 'roles' }, { leaf: 'personas' },
      { leaf: 'events' }, { leaf: 'dispatches' },
      { leaf: 'moderation' }, { leaf: 'support' },
    ],
  },
  {
    key: 'growth', label: 'Growth',
    blurb: 'The growth engine at a glance. Jump into Acquisition or Marketing.',
    href: '/admin/growth', icon: 'TrendingUp', min: 'host', staffDomain: 'marketing',
    related: ['acquisition', 'crm', 'marketing'],
    links: [
      { synthetic: { href: '/admin/growth?tab=acquisition', label: 'Acquisition', desc: 'How people first arrive and where to grow next.', icon: 'Rocket', min: 'host', staffDomain: 'marketing', section: 'Workspaces' } },
      { synthetic: { href: '/admin/growth?tab=marketing', label: 'Marketing', desc: 'Campaigns, funnels, automations, and outbound.', icon: 'Megaphone', min: 'host', staffDomain: 'marketing', section: 'Workspaces' } },
    ],
  },
  {
    key: 'acquisition', label: 'Acquisition',
    blurb: 'How people first arrive, and where to open the next door.',
    href: '/admin/growth?tab=acquisition', icon: 'Rocket', min: 'host', staffDomain: 'marketing',
    primary: false, related: ['crm', 'marketing', 'community'],
    links: [
      { leaf: 'entry-points' }, { leaf: 'library', section: 'Assets' }, { leaf: 'qr' }, { leaf: 'referrals' },
      { leaf: 'growth-applications' },
      { leaf: 'onboarding-splash' }, { leaf: 'onboarding-sequences' }, { leaf: 'walkthroughs' }, { leaf: 'onboarding-controls' },
      { leaf: 'keystone-density' },
    ],
  },
  {
    key: 'crm', label: 'Resonance CRM',
    blurb: "The Vera-driven CRM. A searchable scored roster with each member's full profile, contact info, network, and message tools; the daily action queue and resonance graph; and the upsell/donation pipeline.",
    href: '/admin/crm', icon: 'Contact', min: 'janitor', staffDomain: 'marketing',
    related: ['acquisition', 'marketing', 'vera-ai'],
    links: [
      // Mirror the sub-nav order (owner directive): Roster | Marketing | Inbox | Tasks | Contacts |
      // Intelligence | Pipeline, then Segments in its own Audiences bucket.
      { leaf: 'crm' }, { leaf: 'crm-marketing' }, { leaf: 'crm-inbox' }, { leaf: 'crm-tasks' }, { leaf: 'crm-contacts' }, { leaf: 'crm-intelligence' }, { leaf: 'crm-pipeline' },
      { leaf: 'segments', section: 'Audiences' },
    ],
  },
  {
    key: 'marketing', label: 'Marketing',
    blurb: 'Campaigns and outbound. Funnels, automations, broadcasts, and the read on how they land.',
    href: '/admin/growth?tab=marketing', icon: 'Megaphone', min: 'host', staffDomain: 'marketing',
    primary: false, related: ['crm', 'vera-ai', 'acquisition'],
    links: [
      // Composing (Campaigns, Funnels, Automations, Nurture) retired to the Resonance CRM Marketing tab.
      { leaf: 'beta-command' }, { leaf: 'marketing-beta' },
      { leaf: 'marketing-analytics' }, { leaf: 'marketing-deliverability' }, { leaf: 'marketing-control-panel' }, { leaf: 'marketing-market-read' },
      { leaf: 'marketing-agent' },
    ],
  },
  {
    key: 'vera-ai', label: 'Vera AI',
    blurb: 'The assistant and the intelligence behind it. Voice, gaps, recommendations, and the read.',
    href: '/admin/vera-ai', icon: 'Bot', min: 'janitor', staffDomain: 'insights',
    related: ['operations', 'marketing', 'community'],
    links: [
      { leaf: 'vera-ai' }, { leaf: 'vera-help-gaps' }, { leaf: 'vera-ai-controls' },
      { leaf: 'vera-studio' }, { leaf: 'insights' },
    ],
  },
  {
    key: 'operations', label: 'Operations',
    blurb: 'The platform machine. Content infrastructure, commerce, and the system trail.',
    href: '/admin/operations', icon: 'SlidersHorizontal', min: 'janitor', staffDomain: 'platform',
    related: ['vera-ai'],
    links: [
      { leaf: 'menu' }, { leaf: 'pages' }, { leaf: 'payments' }, { leaf: 'pricing' }, { leaf: 'appearance' }, { leaf: 'spaces' }, { leaf: 'page-layout' },
      { leaf: 'marketplace' }, { leaf: 'marketplace-orders' }, { leaf: 'marketplace-reports' }, { leaf: 'marketplace-disputes' }, { leaf: 'marketplace-reviews' },
      { leaf: 'demo' }, { leaf: 'business-seeder' }, { leaf: 'listing-seeder' }, { leaf: 'audit' },
    ],
  },
] as const

// ── ADMIN_NAV descriptor (lib/admin/nav.ts) ──
// The ten sub-header sections. Each = a top-level tab (root href + gate) with optional
// `groups` of sub-page leaf-ids. The section gate (min + staffDomain) is verbatim; the
// leaves inherit it in the mega panel (they re-gate server-side anyway). Verbatim from
// the old ADMIN_NAV, referencing leaves by id.
/** A sub-page in an ADMIN_NAV group: a leaf id, with an optional label OVERRIDE for the
 *  cases where the sub-header shows a shorter tab label than the leaf's canonical name
 *  (e.g. "Dispatches" for the Broadcasts page, "Shop catalog" for Marketplace). */
export type AdminNavLeafRef = { leaf: string; label?: string }
export type AdminNavGroupSpec = { heading?: string; leaves: readonly AdminNavLeafRef[] }
export type AdminNavSectionSpec = {
  href: string
  label: string
  min: CommunityRole
  staffDomain?: StaffDomain
  groups?: readonly AdminNavGroupSpec[]
}

// ⚠️ DB OVERRIDES CODE — read before you expect an edit here to move the live admin tab bar.
// The admin sub-nav renders from getMenu('admin_header') (lib/menus/read.ts). If the `admin_header`
// menu has ANY rows in the DB (menus/menu_categories/menu_items — materialized the moment an operator
// opens the Menu Manager for it), those rows WIN and this catalog is ignored on the live site. So a
// change here only shows up when admin_header has NO DB rows (the code-default fallback). If the live
// tabs don't reflect a change you made here, the DB copy is stale: reset it (delete the admin_header
// menu rows so it falls back to this code) or edit it in the Menu Manager. (ADR-390; the 2026-07 CRM
// tab consolidation was invisible for exactly this reason.)
export const ADMIN_NAV_SPECS: readonly AdminNavSectionSpec[] = [
  { href: '/admin', label: 'Dashboard', min: 'admin' },
  {
    href: '/admin/community', label: 'Community', min: 'host', staffDomain: 'community',
    groups: [
      { heading: 'Spaces & groups', leaves: [{ leaf: 'circles' }, { leaf: 'circle-templates' }, { leaf: 'channels' }, { leaf: 'hubs' }, { leaf: 'nexuses' }] },
      { heading: 'People', leaves: [{ leaf: 'members' }, { leaf: 'connections' }, { leaf: 'personas', label: 'Personas' }, { leaf: 'segments' }] },
      { heading: 'Activity', leaves: [{ leaf: 'events' }, { leaf: 'import' }, { leaf: 'dispatches', label: 'Dispatches' }, { leaf: 'moderation' }] },
    ],
  },
  { href: '/lead', label: 'Leadership', min: 'host' },
  {
    href: '/admin/programs', label: 'Programs', min: 'host', staffDomain: 'community',
    groups: [
      { heading: 'Content', leaves: [{ leaf: 'content-practices' }, { leaf: 'content-practices-health' }, { leaf: 'content-journeys' }, { leaf: 'content-challenges' }, { leaf: 'content-seasons' }, { leaf: 'content-tips', label: 'Tips' }, { leaf: 'content-training', label: 'Training' }] },
      { heading: 'Engagement', leaves: [{ leaf: 'crew-tasks' }, { leaf: 'gamification', label: 'Gamification' }, { leaf: 'store' }] },
    ],
  },
  {
    href: '/admin/growth', label: 'Growth', min: 'host', staffDomain: 'marketing',
    groups: [
      { heading: 'Acquisition', leaves: [{ leaf: 'growth-applications' }, { leaf: 'referrals' }] },
      { heading: 'Marketing', leaves: [{ leaf: 'marketing-analytics', label: 'Analytics' }, { leaf: 'beta-command', label: 'Beta Command' }, { leaf: 'marketing-beta', label: 'Beta waitlist' }] },
    ],
  },
  {
    // Resonance CRM — gated janitor (per-member predictions are sensitive).
    href: '/admin/crm', label: 'Resonance CRM', min: 'janitor',
    groups: [
      // NOTE: the `crm` (Roster) leaf is deliberately NOT listed here. The admin sub-nav already
      // renders the section's own landing link ("Resonance CRM" -> /admin/crm, the roster home), so
      // adding the crm leaf too would paint TWO tabs on the same URL (the "Resonance CRM" + "Roster"
      // duplicate). The section link IS the roster tab.
      // Order (owner directive): Resonance CRM (the section landing link) | Marketing | Inbox | Tasks |
      // Contacts | Intelligence | Pipeline. Marketing leads the Engine group so the compose-and-send door
      // sits first, right after the roster home.
      { heading: 'Engine', leaves: [{ leaf: 'crm-marketing' }, { leaf: 'crm-inbox' }, { leaf: 'crm-tasks' }, { leaf: 'crm-contacts' }, { leaf: 'crm-intelligence' }, { leaf: 'crm-pipeline' }] },
    ],
  },
  {
    href: '/admin/vera-ai', label: 'Vera AI', min: 'janitor', staffDomain: 'insights',
    groups: [{ leaves: [{ leaf: 'insights' }, { leaf: 'marketing-market-read' }, { leaf: 'marketing-agent' }] }],
  },
  {
    href: '/admin/operations', label: 'Operations', min: 'janitor', staffDomain: 'platform',
    groups: [
      { heading: 'Platform', leaves: [{ leaf: 'audit', label: 'Audit' }, { leaf: 'payments' }, { leaf: 'pricing' }, { leaf: 'roles', label: 'Roles' }, { leaf: 'support' }] },
      { heading: 'Configuration', leaves: [{ leaf: 'onboarding-controls', label: 'Onboarding' }, { leaf: 'walkthroughs' }, { leaf: 'page-layout' }, { leaf: 'menu', label: 'Menu' }, { leaf: 'appearance', label: 'Appearance' }, { leaf: 'demo', label: 'Demo' }, { leaf: 'business-seeder', label: 'Business Seeder' }, { leaf: 'listing-seeder', label: 'Listing Seeder' }] },
    ],
  },
  {
    href: '/admin/marketplace', label: 'Marketplace', min: 'admin', staffDomain: 'platform',
    groups: [
      { heading: 'Catalog', leaves: [{ leaf: 'marketplace', label: 'Shop catalog' }] },
      { heading: 'Activity', leaves: [{ leaf: 'marketplace-orders', label: 'Orders' }, { leaf: 'marketplace-reports', label: 'Reports' }, { leaf: 'marketplace-disputes', label: 'Disputes' }, { leaf: 'marketplace-reviews', label: 'Reviews' }] },
    ],
  },
  {
    href: '/admin/qr', label: 'QR Studio', min: 'admin', staffDomain: 'qr',
    groups: [{ leaves: [{ leaf: 'qr', label: 'QR codes' }, { leaf: 'qr-stats' }, { leaf: 'spaces' }] }],
  },
]
