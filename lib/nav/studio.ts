// The Studio (operator) sub-tree of the ONE navigation registry
// (docs/NAV-SYSTEM-REDESIGN.md §5b, §8). PHASE 2 of the nav unification: the two
// hand-maintained admin catalogs — lib/admin/nav.ts (ADMIN_NAV) and
// app/(main)/admin/sections.ts (ADMIN_GROUPS) — collapse into THIS single declaration.
// Every operator destination is a `StudioLeaf` declared exactly ONCE here, carrying:
//   • its §5b Studio WORLD + world section (Overview · Community · Growth · Content ·
//     Platform) — the NEW five-world structure the rail / sub-nav / dashboards project;
//   • its LEGACY `adminNav` tag (which old lib/admin/nav.ts section + heading it rendered
//     under). The /admin dashboard's domains (ADMIN_GROUP_SPECS) no longer take a per-leaf
//     tag: since ADR-1746 they are DERIVED from the operator console's seven sections
//     (ADMIN_NAV_SPECS), so a leaf's dashboard home and its sidebar home are one fact.
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

// ── The `app/(main)/admin/sections.ts` domain keys: the /admin dashboard's SEVEN sections, the same
// seven as the operator console (ADR-1746 folded the ten ADR-264 domains into them). Each key names
// one ADMIN_NAV_SPECS section; the exec dashboard (`area('content')`), the domain switcher, the
// `related` strips, and path resolution all read these.
export type AdminDomainKey =
  | 'overview'
  | 'community'
  | 'content'
  | 'growth'
  | 'crm'
  | 'vera-ai'
  | 'platform'

// The legacy `lib/admin/nav.ts` section slugs (the admin sub-header top-level tabs).
type AdminNavKey =
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

/** Which legacy `ADMIN_NAV` section + heading a leaf renders under in the mega sub-nav. */
type AdminNavTag = { section: AdminNavKey; heading?: string }

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

  // ── Legacy placement ──
  adminNav?: AdminNavTag
}

// The full operator leaf superset. Order within each `adminNav` bucket is
// preserved by declaration order (the derivations keep it). Gates verbatim from the old
// catalogs; the two conflicts resolved to the stricter gate are flagged CONFLICT below.
export const STUDIO_LEAVES: readonly StudioLeaf[] = [
  // ═══════════════ OVERVIEW (§5b: Dashboard · Today) ═══════════════
  // Dashboard is the /admin exec read (ADMIN_HOME / the Dashboard section). Today is
  // Vera's daily queue (the CRM Today loop, surfaced as the Overview daily read).

  // ═══════════════ COMMUNITY ═══════════════
  // §5b: Circles · Templates · Hubs · Nexuses · Channels · Members · Roles · Events ·
  // Dispatches · Moderation · Support
  { id: 'circles', href: '/admin/circles', label: 'Circles', desc: 'Create, edit, and archive circles.', icon: 'CircleDot', min: 'host', staffDomain: 'community',
    world: 'community', worldLabel: 'Circles', worldOrder: 0,
    adminNav: { section: 'community', heading: 'Spaces & groups' } },
  { id: 'circle-templates', href: '/admin/circle-templates', label: 'Circle Templates', desc: 'Starter Circle blueprints members remix into their own.', icon: 'CircleDot', min: 'host', staffDomain: 'community',
    world: 'community', worldLabel: 'Templates', worldOrder: 1,
    adminNav: { section: 'community', heading: 'Spaces & groups' } },
  { id: 'hubs', href: '/admin/hubs', label: 'Hubs', desc: 'Clusters of circles in an area.', icon: 'Building2', min: 'guide', staffDomain: 'structure',
    world: 'community', worldLabel: 'Hubs', worldOrder: 2,
    adminNav: { section: 'community', heading: 'Spaces & groups' } },
  { id: 'nexuses', href: '/admin/nexuses', label: 'Nexuses', desc: 'Regions that hold hubs.', icon: 'Network', min: 'mentor', staffDomain: 'structure',
    world: 'community', worldLabel: 'Nexuses', worldOrder: 3,
    adminNav: { section: 'community', heading: 'Spaces & groups' } },
  { id: 'channels', href: '/admin/channels', label: 'Channels', desc: 'Topical and event channels.', icon: 'Radio', min: 'host', staffDomain: 'community',
    world: 'community', worldLabel: 'Channels', worldOrder: 4,
    adminNav: { section: 'community', heading: 'Spaces & groups' } },
  { id: 'members', href: '/admin/members', label: 'Member Roster', desc: 'The platform census: every member, subscriber, and beta account.', icon: 'Users', min: 'janitor', staffDomain: 'members',
    world: 'community', worldLabel: 'Members', worldOrder: 5,
    adminNav: { section: 'community', heading: 'People' } },
  { id: 'connections', href: '/admin/connections', label: 'Connection Settings', desc: 'Connection and friend request settings.', icon: 'Users', min: 'admin',
    adminNav: { section: 'community', heading: 'People' } },
  { id: 'roles', href: '/admin/roles', label: 'Roles & permissions', desc: 'Assign roles and the permission grid.', icon: 'Shield', min: 'janitor',
    world: 'community', worldLabel: 'Roles', worldOrder: 6,
    adminNav: { section: 'operations', heading: 'Platform' } },
  { id: 'personas', href: '/admin/personas', label: 'Partner verification', desc: 'Vet and verify partner persona claims.', icon: 'BadgeCheck', min: 'janitor', staffDomain: 'profiles',
    adminNav: { section: 'community', heading: 'People' } },
  { id: 'events', href: '/admin/events', label: 'Events', desc: 'Gatherings across your circles, plus posted events, claims, and poster quality.', icon: 'CalendarDays', min: 'host', staffDomain: 'community',
    world: 'community', worldLabel: 'Events', worldOrder: 7,
    adminNav: { section: 'community', heading: 'Activity' } },
  { id: 'dispatches', href: '/admin/dispatches', label: 'Dispatches', desc: 'Posts and polls to your people.', icon: 'Megaphone', min: 'host', staffDomain: 'community',
    world: 'community', worldLabel: 'Dispatches', worldOrder: 8,
    adminNav: { section: 'community', heading: 'Activity' } },
  { id: 'import', href: '/admin/import', label: 'Import from chat', desc: 'Import members and history from chat.', icon: 'Users', min: 'host', staffDomain: 'community',
    adminNav: { section: 'community', heading: 'Activity' } },
  { id: 'moderation', href: '/admin/moderation', label: 'Moderation', desc: 'Review and resolve reports.', icon: 'ShieldAlert', min: 'host', staffDomain: 'community',
    world: 'community', worldLabel: 'Moderation', worldOrder: 9,
    adminNav: { section: 'community', heading: 'Activity' } },
  { id: 'support', href: '/admin/support', label: 'Support', desc: 'Member support tickets and help requests.', icon: 'LifeBuoy', min: 'host', staffDomain: 'members',
    world: 'community', worldLabel: 'Support', worldOrder: 10,
    adminNav: { section: 'operations', heading: 'Platform' } },
  { id: 'sms', href: '/admin/sms', label: 'Text messages', desc: 'SMS provisioning status and the operator on/off switch.', icon: 'MessageSquare', min: 'janitor', staffDomain: 'platform',
    adminNav: { section: 'operations', heading: 'Platform' } },
  { id: 'nonprofit-verifications', href: '/admin/nonprofit-verifications', label: 'Non Profit verification', desc: 'Review and approve 501(c)(3) verification requests.', icon: 'BadgeCheck', min: 'janitor',
    adminNav: { section: 'operations', heading: 'Platform' } },

  // ═══════════════ CONTENT ═══════════════
  // §5b: Seasons · Journeys · Practices · Challenges · Training · Tips · Gamification ·
  // Store · Tasks · Loom
  { id: 'content-seasons', href: '/admin/content/seasons', label: 'Seasons', desc: 'Season identity, theme, and lifecycle.', icon: 'CalendarDays', min: 'host', staffDomain: 'community',
    world: 'content', worldLabel: 'Seasons', worldOrder: 0,
    adminNav: { section: 'programs', heading: 'Content' } },
  { id: 'content-journeys', href: '/admin/content/journeys', label: 'Journeys', desc: 'Curate and publish official journeys.', icon: 'BookOpen', min: 'host', staffDomain: 'community',
    world: 'content', worldLabel: 'Journeys', worldOrder: 1,
    adminNav: { section: 'programs', heading: 'Content' } },
  { id: 'content-practices', href: '/admin/content/practices', label: 'Practices', desc: 'The practice catalog and its adopters.', icon: 'Sparkles', min: 'host', staffDomain: 'community',
    world: 'content', worldLabel: 'Practices', worldOrder: 2,
    adminNav: { section: 'programs', heading: 'Content' } },
  { id: 'content-practices-health', href: '/admin/content/practices/health', label: 'Library health', desc: 'Practice library health and coverage.', icon: 'Sparkles', min: 'host', staffDomain: 'community',
    adminNav: { section: 'programs', heading: 'Content' } },
  { id: 'content-challenges', href: '/admin/content/challenges', label: 'Challenges', desc: 'Define challenges and watch completion.', icon: 'Target', min: 'host', staffDomain: 'community',
    world: 'content', worldLabel: 'Challenges', worldOrder: 3,
    adminNav: { section: 'programs', heading: 'Content' } },
  { id: 'content-training', href: '/admin/content/training', label: 'Role training', desc: 'The advancement curriculum each promotion teaches.', icon: 'GraduationCap', min: 'host', staffDomain: 'community',
    world: 'content', worldLabel: 'Training', worldOrder: 4,
    adminNav: { section: 'programs', heading: 'Content' } },
  { id: 'content-tips', href: '/admin/content/tips', label: 'Creator tips', desc: 'Tips and prompts for content creators.', icon: 'Lightbulb', min: 'janitor',
    world: 'content', worldLabel: 'Tips', worldOrder: 5,
    adminNav: { section: 'programs', heading: 'Content' } },
  { id: 'gamification', href: '/admin/gamification', label: 'Gamification & rewards', desc: 'Achievements, seasons, rewards.', icon: 'Trophy', min: 'host', staffDomain: 'community',
    world: 'content', worldLabel: 'Gamification', worldOrder: 6,
    adminNav: { section: 'programs', heading: 'Engagement' } },
  { id: 'store', href: '/admin/store', label: 'Store', desc: 'Manage Vault Store items and catalog.', icon: 'ShoppingBag', min: 'host', staffDomain: 'community',
    world: 'content', worldLabel: 'Store', worldOrder: 7,
    adminNav: { section: 'programs', heading: 'Engagement' } },
  { id: 'crew-tasks', href: '/admin/crew-tasks', label: 'Crew tasks', desc: 'Define and verify member tasks.', icon: 'ClipboardList', min: 'host', staffDomain: 'community',
    world: 'content', worldLabel: 'Tasks', worldOrder: 8,
    adminNav: { section: 'programs', heading: 'Engagement' } },
  { id: 'library', href: '/admin/library', label: 'Loom Studio', desc: 'The media & asset library: every image the site uses, plus the illustration kit.', icon: 'Images', min: 'janitor', staffDomain: 'marketing',
    world: 'content', worldLabel: 'Loom', worldOrder: 9 },
  { id: 'elements', href: '/admin/elements', label: 'Elements', desc: 'The reusable elements across the site (the Loom picker, and more): edit each one\'s master settings and role gates once, applied site-wide.', icon: 'LayoutGrid', min: 'admin',
    world: 'content', worldLabel: 'Elements', worldOrder: 10 },

  // ═══════════════ GROWTH ═══════════════
  // §5b: Entry points · QR · Referrals · Applications · Onboarding · Campaigns · Funnels ·
  // Automations · CRM (Roster · Intelligence · Pipeline · Segments)
  { id: 'entry-points', href: '/entry-points', label: 'Entry points', desc: 'Where people first enter your spaces.', icon: 'QrCode', min: 'host', staffDomain: 'marketing',
    world: 'growth', worldLabel: 'Entry points', worldOrder: 0 },
  // CONFLICT (QR Studio): ADMIN_NAV gated 'admin'+qr; ADMIN_GROUPS gated 'host'+qr.
  // STRICTER = 'admin' (fewer viewers). Resolved to 'admin' + staffDomain 'qr'.
  { id: 'qr', href: '/admin/qr', label: 'QR Studio', desc: 'Generate, design, and manage all QR codes.', icon: 'QrCode', min: 'admin', staffDomain: 'qr',
    world: 'growth', worldLabel: 'QR', worldOrder: 1,
    adminNav: { section: 'qr' } },
  { id: 'qr-stats', href: '/admin/qr/stats', label: 'Scan stats', desc: 'QR scan analytics.', icon: 'QrCode', min: 'admin', staffDomain: 'qr',
    adminNav: { section: 'qr' } },
  // The Link Generator (BUILD-LIST P5) shipped without a row, so a working, gated tool was
  // unreachable from every derived menu and invisible to check:gate-parity — the same "a tool
  // its authorized users can never find" shape the automations/nurture rows above record.
  // min/staffDomain mirror the page's own gate: requireAdmin('host', { staff: 'qr' }).
  { id: 'growth-links', href: '/admin/growth/links', label: 'Link Generator', desc: 'Compose a trackable link with campaign tags, then generate a short link and QR to share.', icon: 'QrCode', min: 'host', staffDomain: 'qr' },
  { id: 'referrals', href: '/admin/referrals', label: 'Referrals', desc: 'The personal-code referral funnel: signups, activations, and top referrers.', icon: 'Share2', min: 'host', staffDomain: 'marketing',
    world: 'growth', worldLabel: 'Referrals', worldOrder: 2,
    adminNav: { section: 'growth', heading: 'Acquisition' } },
  { id: 'onboarding-controls', href: '/admin/onboarding-controls', label: 'Onboarding & referral controls', desc: 'Turn Next Steps prompts, popups, and referrals on or off.', icon: 'ToggleRight', min: 'janitor',
    world: 'growth', worldLabel: 'Onboarding', worldOrder: 4,
    adminNav: { section: 'operations', heading: 'Configuration' } },
  // Funnels holds the Default Funnel as a TAB (/pages/sequences?tab=default) since the owner ruling of
  // 2026-10-14 (ADR-1746). The 'onboarding-splash' leaf (/pages/splash, "Default Funnel") was removed
  // with it; next.config.ts 301s that route to the tab, so no menu needs a second door.
  { id: 'onboarding-sequences', href: '/pages/sequences', label: 'Funnels', desc: 'Sign-up Funnels: the Default Funnel every new member walks, plus splash pages, audiences, and share links.', icon: 'Layers', min: 'janitor' },
  { id: 'walkthroughs', href: '/admin/walkthroughs', label: 'Walkthroughs', desc: 'Instructional walkthroughs by role + trigger', icon: 'GraduationCap', min: 'host', staffDomain: 'marketing',
    adminNav: { section: 'operations', heading: 'Configuration' } },
  { id: 'keystone-density', href: '/admin/keystone/density', label: 'Density by city', desc: 'The cold-start read: where the community has a real pulse, and where a corner is still cold enough to want a founder seeded.', icon: 'Telescope', min: 'admin', staffDomain: 'insights', staffLevel: 'read' },
  // ── Campaigns / Marketing ──
  // RETIRED from the menus (2026-07): the legacy email/campaign composing surface — Messaging,
  // Campaigns, Funnels (growth-funnels), Campaign builder (marketing-funnels), Automations, and
  // Nurture — is being rolled into the Resonance CRM Marketing tab (/admin/crm/marketing), which
  // composes in the draft-first popup over the same `campaigns` table. Their leaves are removed so they
  // no longer appear in any admin menu; the PAGES stay reachable (deep links + the roll-in plan uses
  // them) — see docs/DECISIONS.md ADR-623 for the plan to fold the usable functions into the CRM.
  // RETIRED 2026-08-19: the Beta Command Center ('beta-command' -> /admin/beta), the operator
  // home for the Beta launch (phase plan, task board, and the approval queue). The beta launch
  // is over, so the console and the whole beta email arc went with it. What survives is the
  // APPROVAL SPINE itself (lib/outbound/*), which has no console of its own: a campaign is
  // reviewed and sent from the Resonance CRM Marketing tab, and nothing sends without an
  // admin/janitor sign-off there. A 'Beta waitlist' leaf sat beside this one and pointed at
  // /admin/marketing/beta; it went away with the waitlist.
  { id: 'marketing-analytics', href: '/admin/marketing/analytics', label: 'Marketing analytics', desc: 'Sends, opens, clicks, and bounces by type.', icon: 'PieChart', min: 'host', staffDomain: 'marketing',
    adminNav: { section: 'growth', heading: 'Marketing' } },
  // Automations + Persona nurture were built, gated by the marketing layout, and then never given
  // a catalog row — so the only surfaces that can list, edit or DISABLE two engines that run in
  // production were unreachable from every menu. `lib/automations.ts` fires from
  // lib/engagement/events.ts and `lib/nurture/` from app/api/cron/nurture, enrolling members the
  // whole time. Owner call 2026-08-10: a live engine with no off switch is the riskier state, so
  // they get their rows rather than a deletion. Same axis as their marketing siblings; both pages
  // inherit the layout's `staffCan(marketing, read)` gate rather than calling requireAdmin.
  { id: 'marketing-automations', href: '/admin/marketing/automations', label: 'Automations', desc: 'Rules that watch the event backbone and act: a trigger, its conditions, and the send that follows.', icon: 'Workflow', min: 'host', staffDomain: 'marketing',
    adminNav: { section: 'growth', heading: 'Marketing' } },
  { id: 'marketing-nurture', href: '/admin/marketing/nurture', label: 'Persona nurture', desc: 'The timed sequences a captured lead is enrolled in, by persona. Consent-gated, every send carries an unsubscribe.', icon: 'Sprout', min: 'host', staffDomain: 'marketing',
    adminNav: { section: 'growth', heading: 'Marketing' } },
  { id: 'marketing-deliverability', href: '/admin/marketing/deliverability', label: 'Deliverability', desc: 'Outbox health and the dead-letter queue, with one-tap recovery.', icon: 'Activity', min: 'host', staffDomain: 'marketing' },
  { id: 'marketing-market-read', href: '/admin/marketing/market-read', label: 'Market read', desc: 'Demand, geography, and content performance.', icon: 'Telescope', min: 'host', staffDomain: 'marketing',
    adminNav: { section: 'vera-ai' } },
  { id: 'marketing-control-panel', href: '/admin/marketing/messaging/control-panel', label: 'Control panel', desc: 'Who got what: every campaign email and Dispatch, per recipient, with where it landed.', icon: 'Send', min: 'admin', staffDomain: 'marketing',
    adminNav: { section: 'growth', heading: 'Marketing' } },
  { id: 'marketing-agent', href: '/admin/marketing/agent', label: 'Marketing agent', desc: 'Ask the AI operator to draft, segment, and run the busywork.', icon: 'Bot', min: 'host', staffDomain: 'marketing',
    adminNav: { section: 'vera-ai' } },
  // ── CRM (§5b: Resonance CRM · Intelligence · Pipeline · Segments). The master-detail
  //    Resonance home (a searchable scored roster + the full member profile, contact info,
  //    network, and message tools in one view) absorbed the old Cockpit, Contacts, All
  //    Contacts, and Member Intelligence tabs; Deals became the rescoped Pipeline. ──
  { id: 'crm', href: '/admin/crm', label: 'Roster', desc: 'Resonance CRM home. The searchable scored roster: pick a member to see their full profile, contact info, network, notes, and message tools in one view. Marketing, Intelligence, and Pipeline live here.', icon: 'Users', min: 'janitor', exact: true,
    world: 'growth', worldLabel: 'Resonance CRM', worldOrder: 8,
    adminNav: { section: 'crm', heading: 'Engine' } },
  { id: 'crm-intelligence', href: '/admin/crm/intelligence', label: 'Intelligence', desc: "Vera's daily queue, the saved plays, and the resonance graph in one view.", icon: 'ClipboardList', min: 'janitor',
    world: 'overview', worldLabel: 'Intelligence', worldOrder: 1,
    adminNav: { section: 'crm', heading: 'Engine' } },
  { id: 'crm-pipeline', href: '/admin/crm/pipeline', label: 'Pipeline', desc: 'Upsell members into Business Spaces and grow donations: every prospect by stage, split by lane, with quick add and one-tap stage moves.', icon: 'Briefcase', min: 'janitor',
    world: 'growth', worldLabel: 'CRM: Pipeline', worldOrder: 9,
    adminNav: { section: 'crm', heading: 'Engine' } },
  // RETIRED from the menu (2026-07) and now RETIRED OUTRIGHT (LIVE-239, 2026-09-15): the admin "Contacts"
  // tab was the original pre-Resonance CRM, fully replaced by the Resonance CRM (Roster + Intelligence +
  // Pipeline + Marketing). Removing its leaf left the PAGE at /admin/marketing/contacts alive on deep
  // links alone for two months, which is how one cohort ended up with two rosters. It is deleted now and
  // /admin/marketing/contacts 308s to the `crm-contacts` leaf below; the three things only it carried
  // (per-row consent, bulk consent, the scan-intro switch) moved onto that leaf's page in the same change.
  // NOTE: the member-facing "My Contacts" (the personal CRM: card scanner + in-person capture + business
  // lead-gen over network_contacts) is a DIFFERENT surface and is intentionally untouched.
  // Marketing — compose + send email to the whole community or a section (all members, a circle, a saved
  // segment, or individuals), with campaigns / funnels / drafts / sent in one place. Reuses the messaging
  // console + the block editor + the gated send pipeline; the popup composer always saves as a draft.
  { id: 'crm-marketing', href: '/admin/crm/marketing', label: 'Marketing', desc: 'Compose and send email to the whole community or a section: all members, a circle, a saved segment, or individuals. Campaigns, funnels, drafts, and sent in one place.', icon: 'Send', min: 'admin', staffDomain: 'marketing',
    world: 'growth', worldLabel: 'CRM: Marketing', worldOrder: 10,
    adminNav: { section: 'crm', heading: 'Engine' } },
  // Contacts — the whole roster in one place: members, subscribers, and imported leads, each read
  // through the classifier (status, community role, business standing, activity, Spaces, relationship
  // kinds) with plenty of sorting + faceting, plus the "ready for a Business Space" upgrade segment.
  { id: 'crm-contacts', href: '/admin/crm/contacts', label: 'Contacts', desc: 'Every contact in one roster: members, subscribers, and imported leads. Sort and filter by status, community role, Space, relationship, and business standing, and spot members ready to upgrade to a Business Space.', icon: 'Contact', min: 'janitor', staffDomain: 'marketing',
    world: 'growth', worldLabel: 'CRM: Contacts', worldOrder: 12,
    adminNav: { section: 'crm', heading: 'Engine' } },
  // The flat Inbox (ADR-629) is RETIRED (ADR-820): folded into Conversations; /admin/crm/inbox redirects.
  // Conversations (ADR-812) — the unified ticketed workspace over the comms_* spine: support, outreach,
  // leader notes, and inbound replies as ONE assignable, status-tracked thread with a per-thread reply
  // address so a reply comes straight back to it. Dormant until conversation-mode sends are switched on.
  { id: 'crm-conversations', href: '/admin/crm/conversations', label: 'Conversations', desc: 'One ticketed inbox for support, outreach, and replies. Assign a thread, reply as yourself, and their reply comes back to the same place.', icon: 'MessagesSquare', min: 'janitor', staffDomain: 'marketing',
    world: 'growth', worldLabel: 'CRM: Conversations', worldOrder: 15.5,
    adminNav: { section: 'crm', heading: 'Engine' } },
  // Tasks (ADR-628) — the operator follow-up board (open/done/snoozed), optionally tied to a contact.
  // Distinct from member-facing crew_tasks (the volunteer economy); this is the staff to-do queue.
  { id: 'crm-tasks', href: '/admin/crm/tasks', label: 'Tasks', desc: 'Your CRM follow-up list: queue a call-back, mark it done, or snooze it for later.', icon: 'ListTodo', min: 'janitor', staffDomain: 'marketing',
    world: 'growth', worldLabel: 'CRM: Tasks', worldOrder: 16,
    adminNav: { section: 'crm', heading: 'Engine' } },
  // Signup leads (scan2 L9-03, 2026-09-05): the people who gave an email at /join and never finished.
  // The induction writes `signup_leads` on every beat; this is the only surface that reads it back.
  { id: 'crm-leads', href: '/admin/crm/leads', label: 'Signup leads', desc: 'People who gave an email at /join and never finished. See the beat they stopped at, reach out, or export the list.', icon: 'UserPlus', min: 'janitor', staffDomain: 'marketing',
    world: 'growth', worldLabel: 'CRM: Signup leads', worldOrder: 16.5,
    adminNav: { section: 'crm', heading: 'Engine' } },
  { id: 'segments', href: '/admin/segments', label: 'Segments', desc: 'Saved audiences by tag and trait.', icon: 'PieChart', min: 'janitor', staffDomain: 'insights', staffLevel: 'read',
    world: 'growth', worldLabel: 'CRM: Segments', worldOrder: 11 },

  // ═══════════════ PLATFORM ═══════════════
  // §5b: Menu · Pages · Page layout · Theme · Spaces · Market · Payments · Pricing ·
  // Vera · Insights · Demo · Audit
  { id: 'menu', href: '/admin/menu', label: 'Menu manager', desc: 'Order and hide the one shared nav menu; set who reaches each item.', icon: 'Menu', min: 'janitor',
    world: 'platform', worldLabel: 'Menu', worldOrder: 0,
    adminNav: { section: 'operations', heading: 'Configuration' } },
  { id: 'pages', href: '/pages', label: 'Pages', desc: 'The page library: open any page to edit it in place. Marketing pages + beta induction too.', icon: 'FileText', min: 'admin',
    world: 'platform', worldLabel: 'Pages', worldOrder: 1 },
  { id: 'page-layout', href: '/admin/page-layout', label: 'Page layout', desc: "Frame each route's right rail: Global, Scoped, or full-width Focus.", icon: 'LayoutPanelLeft', min: 'admin',
    world: 'platform', worldLabel: 'Page layout', worldOrder: 2,
    adminNav: { section: 'operations', heading: 'Configuration' } },
  { id: 'appearance', href: '/admin/appearance', label: 'Theme Studio', desc: 'Brand themes, palettes, and seasonal looks. Edit and assign without code.', icon: 'Palette', min: 'janitor',
    world: 'platform', worldLabel: 'Theme', worldOrder: 3,
    adminNav: { section: 'operations', heading: 'Configuration' } },
  { id: 'spaces', href: '/admin/spaces', label: 'Spaces', desc: 'White-label tenants: set each Space its theme and brand, view its live profile, or open the owner settings.', icon: 'Building2', min: 'janitor',
    world: 'platform', worldLabel: 'Spaces', worldOrder: 4,
    adminNav: { section: 'operations', heading: 'Platform' } },
  { id: 'marketplace', href: '/admin/marketplace', label: 'Market', desc: 'Listings, the store catalog, and area visibility across Classifieds, Housing, Market, and the Frequency Store.', icon: 'ShoppingBag', min: 'admin', staffDomain: 'platform',
    world: 'platform', worldLabel: 'Market', worldOrder: 5,
    adminNav: { section: 'marketplace', heading: 'Catalog' } },
  { id: 'marketplace-orders', href: '/admin/marketplace/orders', label: 'Market orders', desc: 'Every order across makers and the Frequency Store, with one-tap refunds.', icon: 'CreditCard', min: 'admin', staffDomain: 'platform',
    adminNav: { section: 'marketplace', heading: 'Activity' } },
  { id: 'marketplace-reports', href: '/admin/marketplace/reports', label: 'Market reports', desc: 'The moderation queue for reported listings and sellers.', icon: 'ShieldAlert', min: 'admin', staffDomain: 'platform',
    adminNav: { section: 'marketplace', heading: 'Activity' } },
  { id: 'marketplace-disputes', href: '/admin/marketplace/disputes', label: 'Market disputes', desc: 'Buyer disputes and refund requests on orders, with resolve controls.', icon: 'ShieldAlert', min: 'admin', staffDomain: 'platform',
    adminNav: { section: 'marketplace', heading: 'Activity' } },
  { id: 'marketplace-reviews', href: '/admin/marketplace/reviews', label: 'Market reviews', desc: 'Every rating members left on a listing or Frequency Store item, with hide and restore controls.', icon: 'Star', min: 'admin', staffDomain: 'platform',
    adminNav: { section: 'marketplace', heading: 'Activity' } },
  { id: 'payments', href: '/admin/payments', label: 'Payments', desc: 'Turn host payouts (tips, tickets, sales) on or off.', icon: 'CreditCard', min: 'janitor',
    world: 'platform', worldLabel: 'Payments', worldOrder: 6,
    adminNav: { section: 'operations', heading: 'Platform' } },
  { id: 'pricing', href: '/admin/pricing', label: 'Pricing', desc: 'Plans, prices, feature gates, and the switches that govern billing. Ships off.', icon: 'CreditCard', min: 'janitor',
    world: 'platform', worldLabel: 'Pricing', worldOrder: 7,
    adminNav: { section: 'operations', heading: 'Platform' } },
  // Vera (§5b: the assistant world root). ADMIN_NAV gated janitor + insights.
  // Vera config: the ADMIN_GROUPS card points at the ?tab=vera surface; the ADMIN_NAV
  // section ROOT (/admin/vera-ai) is declared on the spec, not here.
  { id: 'vera-ai', href: '/admin/vera-ai?tab=vera', label: 'Vera config', desc: 'Voice, responses, and induction copy.', icon: 'Bot', min: 'janitor', staffDomain: 'insights',
    world: 'platform', worldLabel: 'Vera', worldOrder: 8 },
  { id: 'vera-help-gaps', href: '/admin/vera-ai?tab=help-gaps', label: 'Help gaps', desc: 'Questions Vera deflected. The to-write list.', icon: 'HelpCircle', min: 'janitor' },
  { id: 'vera-ai-controls', href: '/admin/vera-ai?tab=ai', label: 'AI controls', desc: 'Turn AI on or off platform-wide; usage and audit.', icon: 'Power', min: 'janitor', staffDomain: 'platform' },
  { id: 'vera-studio', href: '/admin/vera-ai?tab=studio', label: 'AI Studio', desc: 'Ranked AI recommendations and one-click, reversible changes.', icon: 'Lightbulb', min: 'admin', staffDomain: 'insights' },
  { id: 'insights', href: '/admin/insights', label: 'Insights', desc: 'All analytics in one place: the read, engagement, outcomes, marketing intel, expansion, and finances.', icon: 'Sparkles', min: 'janitor', staffDomain: 'insights', staffLevel: 'read',
    world: 'platform', worldLabel: 'Insights', worldOrder: 9,
    adminNav: { section: 'vera-ai' } },
  { id: 'demo', href: '/admin/demo', label: 'Demo Studio', desc: 'Generate, manage, and purge seeded demo content.', icon: 'Sparkles', min: 'janitor',
    world: 'platform', worldLabel: 'Demo', worldOrder: 10,
    adminNav: { section: 'operations', heading: 'Configuration' } },
  // Business Seeder (docs/BUSINESS-IMPORTER.md §8, P3). The operator console that pastes a
  // business's URLs and returns a reviewed, seeded Space. A janitor operator tool that WRITES
  // Spaces, so it sits beside Demo Studio in the platform/System world. Its page gates
  // structure:write (requireStaffCap), and every seeded Space defaults to an unlisted demo.
  // NOTE: registered here (STUDIO_LEAVES), not in ADMIN_MODULES — a top-level /admin operator
  // PAGE is a Studio leaf, exactly like Demo Studio; ADMIN_MODULES is the scope-attached page
  // RAIL (its 'global' rows are personal account surfaces, the wrong home for an operator page).
  // Contract-clean: STUDIO_LEAVES is not a *_MODULES catalog, so check:menu is satisfied (ADR).
  { id: 'business-seeder', href: '/admin/business-seeder', label: 'Business Seeder', desc: 'Paste a business’s URLs and get a reviewed, seeded Space.', icon: 'Building2', min: 'admin', staffDomain: 'structure',
    world: 'platform', worldLabel: 'Business Seeder', worldOrder: 11,
    adminNav: { section: 'operations', heading: 'Configuration' } },
  // Listing Seeder (docs: Classifieds & Housing Seeder). A sibling of the Business Seeder: an operator
  // pastes copied classifieds / housing listing copy + photos, the AI extracts the fields, and after
  // review it publishes a listing held by the Frequency seed account until the poster claims it. A
  // janitor operator tool that WRITES public content, so it sits beside Business Seeder in the
  // platform/System world. Registered here (STUDIO_LEAVES), not in ADMIN_MODULES — a top-level /admin
  // operator PAGE is a Studio leaf. Its page gates structure:write (requireStaffCap).
  { id: 'listing-seeder', href: '/admin/listing-seeder', label: 'Listing Seeder', desc: 'Paste a classifieds or housing listing and get a reviewed, published listing to claim.', icon: 'ClipboardPaste', min: 'admin', staffDomain: 'structure',
    world: 'platform', worldLabel: 'Listing Seeder', worldOrder: 12,
    adminNav: { section: 'operations', heading: 'Configuration' } },
  // Event Seeder (ADR-989, docs/DECISIONS.md). The third seeder, for events: the WhatsApp chat
  // importer and the flyer scan stage what they read on event_intake, and this console reviews it
  // field by field (from the EVENT manifest, through the Studio kernel) before it is seeded as an
  // UNLISTED event draft the operator publishes. Registered here (STUDIO_LEAVES) beside its two
  // siblings, not in ADMIN_MODULES — a top-level /admin operator PAGE is a Studio leaf. Its page
  // gates community:write (requireAdmin), the same rung as Import from chat, which feeds it.
  // The row states the SAME gate the page runs (admin + community:write), so the community team
  // who own this tool can both see it and open it. Its two siblings are frozen gate debt for
  // exactly the mismatch this avoids (scripts/check-gate-parity.mjs).
  { id: 'event-seeder', href: '/admin/event-seeder', label: 'Event Seeder', desc: 'Review the events a chat export or a flyer scan found, then seed them as unlisted drafts.', icon: 'CalendarDays', min: 'admin', staffDomain: 'community',
    world: 'platform', worldLabel: 'Event Seeder', worldOrder: 13,
    adminNav: { section: 'operations', heading: 'Configuration' } },
  { id: 'audit', href: '/admin/audit', label: 'Audit log', desc: 'Sensitive admin actions. The security trail.', icon: 'ScrollText', min: 'admin',
    world: 'platform', worldLabel: 'Audit', worldOrder: 11,
    adminNav: { section: 'operations', heading: 'Platform' } },
] as const

// ── Overview world sub-pages that are not admin leaves (Dashboard is the /admin root) ──
// Dashboard is the exec read; it is the Overview world root (STUDIO_WORLDS overview.href).
// Today rides the Intelligence leaf (id 'crm-intelligence', world:'overview') — /admin/crm/today
// redirects there, and the old 'crm-today' LEAF was merged away (the 'crm-today' ids that remain
// are widget ids in lib/widgets/modules.ts, not catalog rows). No extra leaf needed.

// ═══════════════════════════════════════════════════════════════════════════════
// LEGACY DERIVATION LAYER
// The two old catalogs (ADMIN_GROUPS, ADMIN_NAV) are DERIVATIONS over STUDIO_LEAVES. The
// console's seven sections (ADMIN_NAV_SPECS, ADR-1745) are the one layout; the /admin
// dashboard's seven sections (ADMIN_GROUP_SPECS, ADR-1746) are derived from it, so a
// feature is declared ONCE (its leaf above) and placed ONCE (its console group). The
// shims in lib/admin/nav.ts + app/(main)/admin/sections.ts read these and build the
// arrays their consumers expect.
// ═══════════════════════════════════════════════════════════════════════════════

const LEAF_BY_ID = new Map(STUDIO_LEAVES.map((l) => [l.id, l]))

/** Look a leaf up by id (the derivations reference leaves by id). */
export function studioLeaf(id: string): StudioLeaf | undefined {
  return LEAF_BY_ID.get(id)
}

// ── ADMIN_GROUPS descriptor (app/(main)/admin/sections.ts) ──
// Each entry = one /admin dashboard section. `links` is the ORDERED list of what the section shows:
// a leaf id (real page, gate + icon + desc pulled from its StudioLeaf) with the titled sub-section
// the dashboard buckets it beneath. Since ADR-1746 the list is DERIVED (see ADMIN_GROUP_SPECS below).
export type AdminGroupLinkRef = { leaf: string; section?: string }

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

// ── ADMIN_NAV descriptor (lib/admin/nav.ts) ──
// THE OPERATOR CONSOLE'S SEVEN SECTIONS (ADR-1745, consolidating the eleven ADR-390 / ADR-979 left
// behind). Each = a top-level tab (root href + gate) with `groups` of sub-page leaf-ids. The sections
// are the five §5b Studio worlds (Overview · Community · Content · Growth · Platform) plus the two
// janitor engines that already had their own landing pages (Resonance CRM, Vera AI). Folded in:
//   • Leadership (/lead) left the operator console: it is a host's own workspace, reached from the
//     member rail (lib/nav-areas.ts `lead`), not an operator page. No StudioLeaf ever claimed it.
//   • QR Studio → Growth · Acquisition (QR is an entry point; its leaf already said `world: 'growth'`).
//   • Loom Studio → Content · Assets (its leaf already said `world: 'content'`).
//   • Market → Platform · Commerce (its leaves already said `world: 'platform'`).
//   • Operations is renamed Platform, Programs is renamed Content, Dashboard is renamed Overview, so the
//     section labels finally match STUDIO_WORLDS, the design, and the Frequency console's world icons.
//
// 🔴 GATES MOVED FROM THE SECTION TO THE LEAF. adminHeaderMenu() used to stamp the SECTION's min +
// staffDomain onto every item inside it, which is why Loom, QR and Market each needed a section of
// their own (ADR-979): filing one under a neighbour re-gated it. Each item now carries its OWN leaf's
// gate, the same row `check:gate-parity` locks to the page's requireAdmin, so a link shows exactly to
// the people its page admits. The eleven FROZEN_GATE_DEBT rows that once disagreed with their page were
// fixed on the CATALOG side (owner ruling, 2026-10-14, ADR-1746): each leaf now states its page's gate,
// so no per-item override is needed. The section's own landing link keeps the section gate.
//
// ⚠️ DB OVERRIDES CODE — read before you expect an edit here to move the live admin tab bar.
// The admin sub-nav renders from getMenu('admin_header') (lib/menus/read.ts). If the `admin_header`
// menu has ANY rows in the DB (menus/menu_categories/menu_items — materialized the moment an operator
// opens the Menu Manager for it), those rows WIN and this catalog is ignored on the live site. So a
// change here only shows up when admin_header has NO DB rows (the code-default fallback). If the live
// tabs don't reflect a change you made here, the DB copy is stale: reset it (delete the admin_header
// menu rows so it falls back to this code) or edit it in the Menu Manager. (ADR-390; the 2026-07 CRM
// tab consolidation was invisible for exactly this reason.)

/** A gate, in the StudioLeaf vocabulary. */
type StudioGate = { min: CommunityRole; staffDomain?: StaffDomain; staffLevel?: Access }

/** A sub-page in an ADMIN_NAV group: a leaf id, with an optional label OVERRIDE (a shorter tab label
 *  than the leaf's canonical name). The gate is always the leaf's own row gate: a leaf that disagrees
 *  with its page is fixed on the leaf, never patched per menu (check:gate-parity). */
type AdminNavLeafRef = { leaf: string; label?: string }
type AdminNavGroupSpec = { heading?: string; leaves: readonly AdminNavLeafRef[] }
type AdminNavSectionSpec = {
  href: string
  label: string
  min: CommunityRole
  staffDomain?: StaffDomain
  groups?: readonly AdminNavGroupSpec[]
}

export const ADMIN_NAV_SPECS: readonly AdminNavSectionSpec[] = [
  { href: '/admin', label: 'Overview', min: 'admin' },
  {
    href: '/admin/community', label: 'Community', min: 'host', staffDomain: 'community',
    groups: [
      { heading: 'Spaces & groups', leaves: [{ leaf: 'circles' }, { leaf: 'circle-templates' }, { leaf: 'channels' }, { leaf: 'hubs' }, { leaf: 'nexuses' }] },
      { heading: 'People', leaves: [{ leaf: 'members' }, { leaf: 'personas', label: 'Personas' }, { leaf: 'connections' }] },
      { heading: 'Activity', leaves: [{ leaf: 'events' }, { leaf: 'dispatches' }, { leaf: 'import' }] },
      { heading: 'Trust & safety', leaves: [{ leaf: 'moderation' }, { leaf: 'support' }] },
    ],
  },
  {
    href: '/admin/programs', label: 'Content', min: 'host', staffDomain: 'community',
    groups: [
      { heading: 'Library', leaves: [{ leaf: 'content-practices' }, { leaf: 'content-practices-health' }, { leaf: 'content-journeys' }, { leaf: 'content-challenges' }, { leaf: 'content-seasons' }, { leaf: 'content-tips', label: 'Tips' }, { leaf: 'content-training', label: 'Training' }] },
      { heading: 'Rewards', leaves: [{ leaf: 'crew-tasks' }, { leaf: 'gamification', label: 'Gamification' }, { leaf: 'store' }] },
      { heading: 'Assets', leaves: [{ leaf: 'library' }, { leaf: 'elements' }] },
    ],
  },
  {
    href: '/admin/growth', label: 'Growth', min: 'host', staffDomain: 'marketing',
    groups: [
      { heading: 'Acquisition', leaves: [{ leaf: 'entry-points' }, { leaf: 'qr' }, { leaf: 'qr-stats' }, { leaf: 'growth-links' }, { leaf: 'referrals' }, { leaf: 'keystone-density' }] },
      { heading: 'Onboarding', leaves: [{ leaf: 'onboarding-sequences' }, { leaf: 'walkthroughs' }, { leaf: 'onboarding-controls', label: 'Onboarding' }] },
      { heading: 'Marketing', leaves: [{ leaf: 'marketing-analytics', label: 'Analytics' }, { leaf: 'marketing-deliverability' }, { leaf: 'marketing-control-panel' }, { leaf: 'marketing-automations' }, { leaf: 'marketing-nurture' }] },
    ],
  },
  {
    // Resonance CRM — janitor (per-member predictions are sensitive).
    href: '/admin/crm', label: 'Resonance CRM', min: 'janitor',
    groups: [
      // NOTE: the `crm` (Roster) leaf is deliberately NOT listed here. The section's own landing link
      // ("Resonance CRM" -> /admin/crm) IS the roster tab; listing the leaf too painted two tabs on one URL.
      // Order (owner directive): the landing | Marketing | Conversations | Tasks | Contacts | Intelligence |
      // Pipeline, then the two audience tools.
      { heading: 'Engine', leaves: [{ leaf: 'crm-marketing' }, { leaf: 'crm-conversations' }, { leaf: 'crm-tasks' }, { leaf: 'crm-contacts' }, { leaf: 'crm-intelligence' }, { leaf: 'crm-pipeline' }] },
      { heading: 'Audiences', leaves: [{ leaf: 'segments' }, { leaf: 'crm-leads' }] },
    ],
  },
  {
    href: '/admin/vera-ai', label: 'Vera AI', min: 'janitor', staffDomain: 'insights',
    groups: [
      { heading: 'Assistant', leaves: [{ leaf: 'vera-ai' }, { leaf: 'vera-help-gaps' }, { leaf: 'vera-ai-controls' }, { leaf: 'vera-studio' }] },
      { heading: 'Intelligence', leaves: [{ leaf: 'insights' }, { leaf: 'marketing-market-read' }, { leaf: 'marketing-agent' }] },
    ],
  },
  {
    href: '/admin/operations', label: 'Platform', min: 'janitor', staffDomain: 'platform',
    groups: [
      { heading: 'Site', leaves: [{ leaf: 'menu' }, { leaf: 'pages' }, { leaf: 'page-layout' }, { leaf: 'appearance' }] },
      { heading: 'Commerce', leaves: [{ leaf: 'payments' }, { leaf: 'pricing' }, { leaf: 'marketplace' }, { leaf: 'marketplace-orders' }, { leaf: 'marketplace-reports' }, { leaf: 'marketplace-disputes' }, { leaf: 'marketplace-reviews' }] },
      { heading: 'Accounts', leaves: [{ leaf: 'spaces' }, { leaf: 'roles' }, { leaf: 'sms' }, { leaf: 'nonprofit-verifications' }] },
      { heading: 'Tools', leaves: [{ leaf: 'demo' }, { leaf: 'business-seeder' }, { leaf: 'listing-seeder' }, { leaf: 'event-seeder' }, { leaf: 'audit' }] },
    ],
  },
]

/** The gate an ADMIN_NAV item carries: the leaf's own row gate, the one check:gate-parity locks to
 *  its page. PURE. Undefined for an unknown leaf id. */
export function adminNavLeafGate(ref: AdminNavLeafRef): StudioGate | undefined {
  const leaf = LEAF_BY_ID.get(ref.leaf)
  if (!leaf) return undefined
  return { min: leaf.min, ...(leaf.staffDomain ? { staffDomain: leaf.staffDomain } : {}), ...(leaf.staffLevel ? { staffLevel: leaf.staffLevel } : {}) }
}

// ── THE /admin DASHBOARD'S SEVEN SECTIONS (owner ruling 2026-10-14, ADR-1746) ──
// The dashboard drew ten ADR-264 domains (Programs, Content, Rewards, Community, Growth, Acquisition,
// Resonance CRM, Marketing, Vera AI, Operations) while the console beside it drew seven. They are now
// the SAME seven, in the same order, under the same labels, and each section's cards are its console
// section's leaves bucketed by the console's group headings. So a page cannot sit in one place on the
// sidebar and another on the dashboard: there is one list. Only the blurb, glyph, `related` strip, and
// the section's own staff domain are declared here.
//
// Two notes keep every card the ten domains offered reachable:
//   • Resonance CRM lists the Roster (`crm`) first. The console omits it because its landing link IS
//     the roster; a dashboard section has no landing tab, so the card stays.
//   • Overview has no cards: the dashboard itself is the overview (ADMIN_HOME), and visibleGroups drops
//     an empty section.
type AdminGroupMeta = Pick<AdminGroupSpec, 'key' | 'blurb' | 'icon' | 'staffDomain' | 'related'> & {
  /** The ADMIN_NAV_SPECS section this dashboard section mirrors (by its landing href). */
  nav: string
  /** Leaves listed before the console's own (the CRM roster). */
  lead?: readonly AdminGroupLinkRef[]
}

const ADMIN_GROUP_META: readonly AdminGroupMeta[] = [
  { key: 'overview', nav: '/admin', icon: 'LayoutDashboard',
    blurb: 'The exec read and the daily queue.' },
  { key: 'community', nav: '/admin/community', icon: 'Users', related: ['content', 'crm'],
    blurb: 'The people and their spaces. Circles, members, events, and trust and safety.' },
  { key: 'content', nav: '/admin/programs', icon: 'Gamepad2', related: ['community', 'vera-ai'],
    blurb: 'The Quest content suite, the rewards economy, and the Loom library.' },
  { key: 'growth', nav: '/admin/growth', icon: 'TrendingUp', related: ['crm', 'community'],
    blurb: 'How people arrive and stay. Entry points, onboarding and Funnels, and the marketing read.' },
  // The section admits marketing staff too (the old Resonance CRM domain did): its Engine tools are theirs.
  { key: 'crm', nav: '/admin/crm', icon: 'Contact', staffDomain: 'marketing', related: ['growth', 'vera-ai'],
    lead: [{ leaf: 'crm', section: 'Engine' }],
    blurb: "The Vera-driven CRM. A searchable scored roster with each member's full profile, contact info, network, and message tools; the daily action queue and resonance graph; and the upsell/donation pipeline." },
  { key: 'vera-ai', nav: '/admin/vera-ai', icon: 'Bot', related: ['platform', 'growth', 'community'],
    blurb: 'The assistant and the intelligence behind it. Voice, gaps, recommendations, and the read.' },
  { key: 'platform', nav: '/admin/operations', icon: 'SlidersHorizontal', related: ['vera-ai'],
    blurb: 'The platform machine. Site config, commerce, accounts, and the system tools and trail.' },
]

export const ADMIN_GROUP_SPECS: readonly AdminGroupSpec[] = ADMIN_GROUP_META.map((m) => {
  const nav = ADMIN_NAV_SPECS.find((n) => n.href === m.nav)
  if (!nav) throw new Error(`ADMIN_GROUP_META ${m.key}: no ADMIN_NAV_SPECS section at ${m.nav}`)
  const links: AdminGroupLinkRef[] = [
    ...(m.lead ?? []),
    ...(nav.groups ?? []).flatMap((g) =>
      g.leaves.map((ref) => (g.heading ? { leaf: ref.leaf, section: g.heading } : { leaf: ref.leaf })),
    ),
  ]
  const spec: AdminGroupSpec = {
    key: m.key,
    label: nav.label,
    blurb: m.blurb,
    href: nav.href,
    icon: m.icon,
    min: nav.min,
    links,
  }
  const staffDomain = m.staffDomain ?? nav.staffDomain
  if (staffDomain) spec.staffDomain = staffDomain
  if (m.related) spec.related = m.related
  return spec
})
