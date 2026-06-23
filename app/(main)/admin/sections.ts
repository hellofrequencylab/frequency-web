// Single source of truth for the admin IA — the grouped catalog of every admin
// surface, the role each one needs, and where it lives. The admin nav
// (sub-nav.tsx), the three domain dashboards (programs/operations/growth), the
// Home overview (page.tsx), and the in-context console (admin-console.tsx) all
// render from this, so a feature is declared in exactly ONE place and can never be
// orphaned again.
//
// REORG (Phase 1, ADR pending): the nine scattered suites collapse into THREE
// durable operator domains plus a Home —
//   • Programs    — the game: content, seasons, rewards, crews, leader training.
//   • Operations  — run the site: community, people, trust & safety, system keys.
//   • Growth      — grow it: funnels, onboarding, pipeline, campaigns, expansion.
// Each domain has its OWN dashboard route (/admin/{key}) with KPI stat cards on top
// and "areas of focus" cards underneath. The top bar no longer reshuffles per page:
// it switches between Home / Programs / Operations / Growth, with the active domain
// derived from the URL via `domainForPath`.
//
// Every link keeps its EXACT current href, icon, and per-link role/staff gate —
// only the grouping changed. Operations sub-groups its area cards under titled
// sections via the optional `section` field (Community / People / Trust & safety /
// Site & system); the other domains render one flat grid.

import {
  LayoutDashboard,
  CircleDot,
  Radio,
  CalendarDays,
  Megaphone,
  ClipboardList,
  BookOpen,
  Trophy,
  ShieldAlert,
  Building2,
  Network,
  Activity,
  Target,
  Sparkles,
  Telescope,
  PieChart,
  Bot,
  HelpCircle,
  Users,
  Shield,
  QrCode,
  Power,
  FileText,
  BadgeCheck,
  Lightbulb,
  ScrollText,
  LifeBuoy,
  ShoppingBag,
  Map,
  CreditCard,
  Gamepad2,
  SlidersHorizontal,
  TrendingUp,
  Rocket,
  Layers,
  Contact,
  ContactRound,
  Briefcase,
  Menu,
  GraduationCap,
  ToggleRight,
  Share2,
  Palette,
  LayoutPanelLeft,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { atLeastRole, isStaff, isJanitor, type CommunityRole, type WebRole } from '@/lib/core/roles'
import { staffCan, type StaffDomain, type StaffRole, type Access } from '@/lib/core/staff-roles'

export interface AdminLink {
  href: string
  label: string
  /** One-line purpose — shown on the dashboard area card. */
  desc: string
  Icon: LucideIcon
  /** Lowest role that may use this surface. TWO AXES (ADR-208): a community rung
   *  (host/guide/mentor) gates on the trust ladder; 'admin'/'janitor' gate on the
   *  STAFF axis (web_role) — 'admin' admits admin+janitor, 'janitor' admits janitor
   *  only. `linkMeetsMin` below resolves which axis applies. */
  min: CommunityRole
  /** Staff capability domain (ADR-127) that ALSO unlocks this surface — fail-closed:
   *  omit it and the link stays primary-axis-only (sensitive pages do this). */
  staffDomain?: StaffDomain
  /** Capability level the staff domain needs (default 'write'). Read-only surfaces
   *  (Insights) use 'read' so read-only roles (e.g. Analyst) can see them. */
  staffLevel?: Access
  /** Active only on an exact path match (a domain root). */
  exact?: boolean
  /** Titled sub-section a dashboard groups this card under (Operations uses this). */
  section?: string
}

// The operator domains. Each `key` doubles as its dashboard route slug
// ('programs' → /admin/programs). The broad Growth domain is kept as a ROLL-UP whose
// links point into the three operational growth areas below it — Acquisition (how
// people arrive), CRM (relationships + pipeline), and Marketing (campaigns + outbound)
// — and the assistant pulls out of Operations into its own Vera AI area. Analytics are
// distributed to the area they measure (engagement→Community, outcomes→Programs,
// intel→Marketing, expansion→Acquisition, segments→CRM). Individual links keep their
// own (often stricter, janitor) gates.
export type DomainKey =
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

export interface AdminGroup {
  key: DomainKey
  label: string
  /** One-line framing for the domain — its dashboard header + the Home card. */
  blurb: string
  /** Where the domain dashboard lives. */
  href: string
  Icon: LucideIcon
  /** The domain dashboard's primary-axis floor (staff axis still admits per-link). */
  min: CommunityRole
  /** Optional staff capability domain that also clears the dashboard floor. */
  staffDomain?: StaffDomain
  /** Sibling areas worth a cross-link from this one's dashboard (the "Related" strip). */
  related?: readonly DomainKey[]
  /** Whether this domain is a PRIMARY left-nav entry. Sub-workspaces folded into a parent
   *  (Acquisition / CRM / Marketing → the Growth workspace tabs, ADR-264) set this false:
   *  they keep their group object (so the domain switcher + top sub-nav still resolve their
   *  routes) but drop out of the left rail, which lists only primary domains. Default true. */
  primary?: boolean
  links: readonly AdminLink[]
}

export const ADMIN_GROUPS: readonly AdminGroup[] = [
  {
    key: 'programs',
    label: 'Programs',
    blurb: 'The game. Content, seasons, rewards, and the crews that run them.',
    href: '/admin/programs',
    Icon: Gamepad2,
    min: 'host',
    staffDomain: 'community',
    related: ['community', 'vera-ai'],
    links: [
      { href: '/admin/programs?tab=content', label: 'Content', desc: 'Seasons, Journeys, Practices, and Challenges.', Icon: Map, min: 'host', staffDomain: 'community', section: 'Workspaces' },
      { href: '/admin/programs?tab=rewards', label: 'Rewards & economy', desc: 'Gamification, the store, retroactive rewards, and crew tasks.', Icon: Trophy, min: 'host', staffDomain: 'community', section: 'Workspaces' },
      // ── Enablement ──
      { href: '/programs', label: 'Leader training', desc: 'Materials to start and run a circle.', Icon: BookOpen, min: 'host', staffDomain: 'community', section: 'Enablement' },
    ],
  },
  {
    // Content + Rewards are FOLDED sub-workspaces of Programs (primary:false, like the
    // Growth tabs in ADR-264): they keep a group so the domain switcher + sub-nav resolve
    // their leaf editors and highlight the right Programs tab, but drop out of the left
    // rail. Their `href` is the Programs tab that hosts them.
    key: 'content',
    label: 'Content',
    blurb: 'The Quest content suite. Seasons, Journeys, Practices, Challenges, and creator tips.',
    href: '/admin/programs?tab=content',
    Icon: Map,
    min: 'host',
    staffDomain: 'community',
    primary: false,
    related: ['programs', 'community'],
    links: [
      { href: '/admin/content/seasons', label: 'Seasons', desc: 'Season identity, theme, and lifecycle.', Icon: CalendarDays, min: 'host', staffDomain: 'community', section: 'Content' },
      { href: '/admin/content/journeys', label: 'Journeys', desc: 'Curate and publish official journeys.', Icon: BookOpen, min: 'host', staffDomain: 'community', section: 'Content' },
      { href: '/admin/content/practices', label: 'Practices', desc: 'The practice catalog and its adopters.', Icon: Sparkles, min: 'host', staffDomain: 'community', section: 'Content' },
      { href: '/admin/content/challenges', label: 'Challenges', desc: 'Define challenges and watch completion.', Icon: Target, min: 'host', staffDomain: 'community', section: 'Content' },
      { href: '/admin/content/training', label: 'Role training', desc: 'The advancement curriculum each promotion teaches.', Icon: GraduationCap, min: 'host', staffDomain: 'community', section: 'Content' },
      { href: '/admin/content/tips', label: 'Creator tips', desc: 'Tips and prompts for content creators.', Icon: Lightbulb, min: 'host', staffDomain: 'community', section: 'Content' },
    ],
  },
  {
    key: 'rewards',
    label: 'Rewards & economy',
    blurb: 'The economy. Gamification, the gem store, retroactive grants, and crew tasks.',
    href: '/admin/programs?tab=rewards',
    Icon: Trophy,
    min: 'host',
    staffDomain: 'community',
    primary: false,
    related: ['programs'],
    links: [
      { href: '/admin/gamification', label: 'Gamification & rewards', desc: 'Achievements, seasons, rewards.', Icon: Trophy, min: 'host', staffDomain: 'community', section: 'Rewards' },
      { href: '/admin/store', label: 'Store', desc: 'Manage gem store items and catalog.', Icon: ShoppingBag, min: 'host', staffDomain: 'community', section: 'Rewards' },
      { href: '/admin/crew-tasks', label: 'Crew tasks', desc: 'Define and verify member tasks.', Icon: ClipboardList, min: 'host', staffDomain: 'community', section: 'Rewards' },
    ],
  },
  {
    key: 'community',
    label: 'Community',
    blurb: 'The people and their spaces. Circles, members, events, and trust and safety.',
    href: '/admin/community',
    Icon: Users,
    min: 'host',
    staffDomain: 'community',
    related: ['programs', 'crm'],
    links: [
      // ── Structure ──
      { href: '/admin/circles', label: 'Circles', desc: 'Create, edit, and archive circles.', Icon: CircleDot, min: 'host', staffDomain: 'community', section: 'Structure' },
      { href: '/admin/hubs', label: 'Hubs', desc: 'Clusters of circles in an area.', Icon: Building2, min: 'guide', staffDomain: 'structure', section: 'Structure' },
      { href: '/admin/nexuses', label: 'Nexuses', desc: 'Regions that hold hubs.', Icon: Network, min: 'mentor', staffDomain: 'structure', section: 'Structure' },
      { href: '/admin/channels', label: 'Channels', desc: 'Topical and event channels.', Icon: Radio, min: 'host', staffDomain: 'community', section: 'Structure' },
      // ── People & access ──
      { href: '/admin/members', label: 'Members', desc: 'Roster, subscribers, and accounts.', Icon: Users, min: 'janitor', staffDomain: 'members', section: 'People & access' },
      { href: '/admin/roles', label: 'Roles & permissions', desc: 'Assign roles and the permission grid.', Icon: Shield, min: 'janitor', section: 'People & access' },
      { href: '/admin/personas', label: 'Partner verification', desc: 'Vet and verify partner persona claims.', Icon: BadgeCheck, min: 'janitor', staffDomain: 'profiles', section: 'People & access' },
      // ── Activity ──
      { href: '/admin/events', label: 'Events', desc: 'Gatherings across your circles, plus posted events, claims, and poster quality.', Icon: CalendarDays, min: 'host', staffDomain: 'community', section: 'Activity' },
      { href: '/admin/dispatches', label: 'Broadcasts', desc: 'Posts and polls to your people.', Icon: Megaphone, min: 'host', staffDomain: 'community', section: 'Activity' },
      // ── Engagement (the member-side analytics) ──
      // ── Trust & safety ──
      { href: '/admin/moderation', label: 'Moderation', desc: 'Review and resolve reports.', Icon: ShieldAlert, min: 'host', staffDomain: 'community', section: 'Trust & safety' },
      { href: '/admin/support', label: 'Support', desc: 'Member support tickets and help requests.', Icon: LifeBuoy, min: 'host', staffDomain: 'members', section: 'Trust & safety' },
    ],
  },
  {
    key: 'growth',
    label: 'Growth',
    blurb: 'The growth engine at a glance. Jump into Acquisition, CRM, or Marketing.',
    href: '/admin/growth',
    Icon: TrendingUp,
    min: 'host',
    staffDomain: 'marketing',
    related: ['acquisition', 'crm', 'marketing'],
    links: [
      // Roll-up: the three operational growth areas. The dashboard reads their KPIs;
      // these point into each one's own home (resolved to its own domain, not Growth).
      { href: '/admin/growth?tab=acquisition', label: 'Acquisition', desc: 'How people first arrive and where to grow next.', Icon: Rocket, min: 'host', staffDomain: 'marketing', section: 'Workspaces' },
      { href: '/admin/growth?tab=crm', label: 'CRM', desc: 'Contacts, relationships, and the deal pipeline.', Icon: Contact, min: 'host', staffDomain: 'marketing', section: 'Workspaces' },
      { href: '/admin/growth?tab=marketing', label: 'Marketing', desc: 'Campaigns, funnels, automations, and outbound.', Icon: Megaphone, min: 'host', staffDomain: 'marketing', section: 'Workspaces' },
    ],
  },
  {
    key: 'acquisition',
    label: 'Acquisition',
    blurb: 'How people first arrive, and where to open the next door.',
    href: '/admin/growth?tab=acquisition',
    Icon: Rocket,
    min: 'host',
    staffDomain: 'marketing',
    primary: false,
    related: ['crm', 'marketing', 'community'],
    links: [
      // ── Entry points ──
      { href: '/entry-points', label: 'Entry points', desc: 'Where people first enter your spaces.', Icon: QrCode, min: 'host', staffDomain: 'marketing', section: 'Entry points' },
      { href: '/admin/qr', label: 'QR Studio', desc: 'Generate, design, and manage all QR codes.', Icon: QrCode, min: 'host', staffDomain: 'qr', section: 'Entry points' },
      { href: '/admin/referrals', label: 'Referrals', desc: 'The personal-code referral funnel: signups, activations, and top referrers.', Icon: Share2, min: 'host', staffDomain: 'marketing', section: 'Entry points' },
      // ── Onboarding ──
      { href: '/pages/splash', label: 'Onboarding splash', desc: 'The first-run splash members land on.', Icon: Rocket, min: 'janitor', section: 'Onboarding' },
      { href: '/pages/sequences', label: 'Splash pages', desc: 'Sequenced splash pages and flows.', Icon: Layers, min: 'janitor', section: 'Onboarding' },
      { href: '/admin/walkthroughs', label: 'Walkthroughs', desc: 'Instructional walkthroughs by role + trigger', Icon: GraduationCap, min: 'host', staffDomain: 'marketing', section: 'Onboarding' },
      { href: '/admin/onboarding-controls', label: 'Onboarding & referral controls', desc: 'Turn Next Steps prompts, popups, and referrals on or off.', Icon: ToggleRight, min: 'janitor', section: 'Onboarding' },
      // ── Expansion ──
    ],
  },
  {
    key: 'crm',
    label: 'CRM',
    blurb: 'Relationships and the pipeline. Contacts, deals, and the audiences they form.',
    href: '/admin/growth?tab=crm',
    Icon: Contact,
    min: 'host',
    staffDomain: 'marketing',
    primary: false,
    related: ['acquisition', 'marketing'],
    links: [
      // ── Pipeline (the area home /admin/crm is the deal board) ──
      { href: '/admin/crm/deals/new', label: 'New deal', desc: 'Add a deal to the pipeline.', Icon: Briefcase, min: 'host', staffDomain: 'marketing', section: 'Pipeline' },
      // ── Contacts ──
      { href: '/admin/crm/contacts', label: 'Contacts', desc: 'Leads, customers, and members as one record.', Icon: Contact, min: 'host', staffDomain: 'marketing', section: 'Contacts' },
      { href: '/connections', label: 'Profiles & contacts', desc: 'People, contacts, and relationships.', Icon: ContactRound, min: 'host', staffDomain: 'profiles', section: 'Contacts' },
      // ── Audiences ──
      { href: '/admin/segments', label: 'Segments', desc: 'Saved audiences by tag and trait.', Icon: PieChart, min: 'janitor', staffDomain: 'insights', staffLevel: 'read', section: 'Audiences' },
    ],
  },
  {
    key: 'marketing',
    label: 'Marketing',
    blurb: 'Campaigns and outbound. Funnels, automations, broadcasts, and the read on how they land.',
    href: '/admin/growth?tab=marketing',
    Icon: Megaphone,
    min: 'host',
    staffDomain: 'marketing',
    primary: false,
    related: ['crm', 'vera-ai', 'acquisition'],
    links: [
      // ── Campaigns ──
      { href: '/admin/marketing/campaigns', label: 'Campaigns', desc: 'Compose and send email and push broadcasts.', Icon: Megaphone, min: 'host', staffDomain: 'marketing', section: 'Campaigns' },
      { href: '/admin/marketing/funnels', label: 'Funnels', desc: 'Create, test, and compare conversion funnels.', Icon: Activity, min: 'host', staffDomain: 'marketing', section: 'Campaigns' },
      { href: '/admin/marketing/automations', label: 'Automations', desc: 'Event-triggered rules and follow-ups.', Icon: SlidersHorizontal, min: 'host', staffDomain: 'marketing', section: 'Campaigns' },
      { href: '/admin/marketing/nurture', label: 'Nurture', desc: 'Sequenced nurture flows.', Icon: Layers, min: 'host', staffDomain: 'marketing', section: 'Campaigns' },
      // ── Audience ──
      { href: '/admin/marketing/beta', label: 'Beta waitlist', desc: 'Triage the waitlist and send invites.', Icon: Rocket, min: 'host', staffDomain: 'marketing', section: 'Audience' },
      // ── Analytics ──
      { href: '/admin/marketing/analytics', label: 'Marketing analytics', desc: 'Sends, opens, clicks, and bounces by type.', Icon: PieChart, min: 'host', staffDomain: 'marketing', section: 'Analytics' },
      { href: '/admin/marketing/market-read', label: 'Market read', desc: 'Demand, geography, and content performance.', Icon: Telescope, min: 'host', staffDomain: 'marketing', section: 'Analytics' },
      // ── AI operator ──
      { href: '/admin/marketing/agent', label: 'Marketing agent', desc: 'Ask the AI operator to draft, segment, and run the busywork.', Icon: Bot, min: 'host', staffDomain: 'marketing', section: 'AI operator' },
    ],
  },
  {
    key: 'vera-ai',
    label: 'Vera AI',
    blurb: 'The assistant and the intelligence behind it. Voice, gaps, recommendations, and the read.',
    href: '/admin/vera-ai',
    Icon: Bot,
    min: 'janitor',
    staffDomain: 'insights',
    related: ['operations', 'marketing', 'community'],
    links: [
      // ── Assistant ──
      { href: '/admin/vera-ai?tab=vera', label: 'Vera config', desc: 'Voice, responses, and induction copy.', Icon: Bot, min: 'janitor', staffDomain: 'insights', section: 'Assistant' },
      { href: '/admin/vera-ai?tab=help-gaps', label: 'Help gaps', desc: 'Questions Vera deflected. The to-write list.', Icon: HelpCircle, min: 'janitor', section: 'Assistant' },
      { href: '/admin/vera-ai?tab=ai', label: 'AI controls', desc: 'Turn AI on or off platform-wide; usage and audit.', Icon: Power, min: 'janitor', staffDomain: 'platform', section: 'Assistant' },
      // ── Intelligence ──
      { href: '/admin/vera-ai?tab=studio', label: 'AI Studio', desc: 'Ranked AI recommendations and one-click, reversible changes.', Icon: Lightbulb, min: 'admin', staffDomain: 'insights', section: 'Intelligence' },
      { href: '/admin/insights', label: 'Insights', desc: 'All analytics in one place: the read, engagement, outcomes, marketing intel, expansion, and finances.', Icon: Sparkles, min: 'janitor', staffDomain: 'insights', staffLevel: 'read', section: 'Intelligence' },
    ],
  },
  {
    key: 'operations',
    label: 'Operations',
    blurb: 'The platform machine. Content infrastructure, commerce, and the system trail.',
    href: '/admin/operations',
    Icon: SlidersHorizontal,
    min: 'janitor',
    staffDomain: 'platform',
    related: ['vera-ai'],
    links: [
      // ── Platform ──
      { href: '/admin/menu', label: 'Menu manager', desc: 'Order and hide the one shared nav menu; set who reaches each item.', Icon: Menu, min: 'janitor', section: 'Platform' },
      { href: '/pages', label: 'Pages', desc: 'The page library: open any page to edit it in place. Marketing pages + beta induction too.', Icon: FileText, min: 'admin', section: 'Platform' },
      { href: '/admin/payments', label: 'Payments', desc: 'Turn host payouts (tips, tickets, sales) on or off.', Icon: CreditCard, min: 'janitor', section: 'Platform' },
      { href: '/admin/pricing', label: 'Pricing', desc: 'Plans, prices, feature gates, and the switches that govern billing. Ships off.', Icon: CreditCard, min: 'janitor', section: 'Platform' },
      { href: '/admin/appearance', label: 'Theme Studio', desc: 'Brand themes, palettes, and seasonal looks. Edit and assign without code.', Icon: Palette, min: 'janitor', section: 'Platform' },
      { href: '/admin/spaces', label: 'Spaces', desc: 'White-label tenants: set each Space its theme and brand, view its live profile, or open the owner settings.', Icon: Building2, min: 'janitor', section: 'Platform' },
      { href: '/admin/page-layout', label: 'Page layout', desc: "Frame each route's right rail: Global, Scoped, or full-width Focus.", Icon: LayoutPanelLeft, min: 'janitor', section: 'Platform' },
      // ── System ──
      { href: '/admin/demo', label: 'Demo Studio', desc: 'Generate, manage, and purge seeded demo content.', Icon: Sparkles, min: 'janitor', section: 'System' },
      { href: '/admin/audit', label: 'Audit log', desc: 'Sensitive admin actions. The security trail.', Icon: ScrollText, min: 'admin', section: 'System' },
    ],
  },
] as const

// ── Home pseudo-entry ─────────────────────────────────────────────────────────
// /admin is the exec dashboard that fans out to the three domains. It is not a
// domain (no area cards of its own), so it lives outside ADMIN_GROUPS but is part of
// the stable top switcher + the rail.

export interface AdminDestination {
  key: string
  label: string
  href: string
  Icon: LucideIcon
  /** Exact-match active rule (Home only). */
  exact?: boolean
}

export const ADMIN_HOME: AdminDestination = {
  key: 'home',
  label: 'Admin Dashboard',
  href: '/admin',
  Icon: LayoutDashboard,
  exact: true,
}

/** The four stable top-switcher / rail destinations: Home + the three domains. */
export function adminDestinations(): AdminDestination[] {
  return [
    ADMIN_HOME,
    ...ADMIN_GROUPS.map((g) => ({ key: g.key, label: g.label, href: g.href, Icon: g.Icon })),
  ]
}

// ── Gating ────────────────────────────────────────────────────────────────────

/**
 * Does a link's `min` admit the viewer? TWO AXES (ADR-208): 'admin'/'janitor' read
 * the STAFF axis (web_role) — 'janitor' admits janitor only, 'admin' admits both;
 * every other rung reads the COMMUNITY trust ladder (community_role). Mirrors
 * `meetsMin` in lib/admin/guard.ts so nav visibility matches the page gate exactly.
 */
function linkMeetsMin(min: CommunityRole, role: CommunityRole, webRole: WebRole): boolean {
  if (min === 'janitor') return isJanitor(webRole)
  if (min === 'admin') return isStaff(webRole)
  return atLeastRole(role, min)
}

/** True if a viewer may use a link — its `min` axis (community ladder OR staff axis,
 *  ADR-208) grants it, OR (ADR-127) the team_members staff role holds its `staffDomain`. */
export function canUseLink(
  link: AdminLink,
  role: CommunityRole,
  webRole: WebRole = 'none',
  staffRole: StaffRole | null = null,
): boolean {
  return (
    linkMeetsMin(link.min, role, webRole) ||
    (!!link.staffDomain && staffCan(staffRole, link.staffDomain, link.staffLevel ?? 'write'))
  )
}

/** True if a viewer may enter a domain dashboard (primary-axis floor OR its staff domain). */
export function canSeeGroup(
  group: AdminGroup,
  role: CommunityRole,
  webRole: WebRole = 'none',
  staffRole: StaffRole | null = null,
): boolean {
  return (
    linkMeetsMin(group.min, role, webRole) ||
    (!!group.staffDomain && staffCan(staffRole, group.staffDomain, 'read'))
  )
}

/** The groups (with only the links a viewer may see). Empty groups drop out. */
export function visibleGroups(
  role: CommunityRole,
  webRole: WebRole = 'none',
  staffRole: StaffRole | null = null,
): AdminGroup[] {
  return ADMIN_GROUPS.map((g) => ({
    ...g,
    links: g.links.filter((l) => canUseLink(l, role, webRole, staffRole)),
  })).filter((g) => g.links.length > 0)
}

/** Flat list of links a viewer may see — handy for breadcrumb/title lookups + the
 *  in-context console (admin-console.tsx buckets these by href). */
export function visibleLinks(
  role: CommunityRole,
  webRole: WebRole = 'none',
  staffRole: StaffRole | null = null,
): AdminLink[] {
  return visibleGroups(role, webRole, staffRole).flatMap((g) => g.links)
}

/** The links of one domain a viewer may see, in declaration order (dashboard cards). */
export function groupLinks(
  key: DomainKey,
  role: CommunityRole,
  webRole: WebRole = 'none',
  staffRole: StaffRole | null = null,
): AdminLink[] {
  const g = ADMIN_GROUPS.find((x) => x.key === key)
  if (!g) return []
  return g.links.filter((l) => canUseLink(l, role, webRole, staffRole))
}

/** Operations-style grouping: a domain's role-visible links bucketed by their
 *  `section` (declaration order preserved within and across sections). Links with no
 *  `section` collapse into a single unlabeled bucket. */
export function groupSections(
  key: DomainKey,
  role: CommunityRole,
  webRole: WebRole = 'none',
  staffRole: StaffRole | null = null,
): { section: string; links: AdminLink[] }[] {
  const out: { section: string; links: AdminLink[] }[] = []
  for (const l of groupLinks(key, role, webRole, staffRole)) {
    const s = l.section ?? ''
    const last = out[out.length - 1]
    if (last && last.section === s) last.links.push(l)
    else out.push({ section: s, links: [l] })
  }
  return out
}

// ── Path → domain resolution (drives the stable top switcher's active state) ───

// Every domain-owned href (and external route) → its domain key, built once from
// ADMIN_GROUPS so the switcher highlights the right domain for any /admin/* page AND
// the external routes (/programs, /pages, …). Longest hrefs first so the most
// specific prefix wins.
const HREF_TO_DOMAIN: ReadonlyArray<{ href: string; key: DomainKey }> = ADMIN_GROUPS
  .flatMap((g) => g.links.map((l) => ({ href: l.href, key: g.key })))
  .concat(ADMIN_GROUPS.map((g) => ({ href: g.href, key: g.key })))
  .sort((a, b) => b.href.length - a.href.length)

/** The domain a path belongs to, or null for Home (/admin) and anything unowned. */
export function domainForPath(pathname: string): AdminGroup | null {
  if (pathname === '/admin') return null
  // A group's OWN dashboard always belongs to that group — the Growth roll-up lists the
  // sibling homes (/admin/acquisition, /admin/crm, /admin/marketing) as links, but those
  // paths resolve to their own area, not Growth.
  const own = ADMIN_GROUPS.find((g) => g.href === pathname)
  if (own) return own
  for (const { href, key } of HREF_TO_DOMAIN) {
    if (pathname === href || pathname.startsWith(`${href}/`)) {
      return ADMIN_GROUPS.find((g) => g.key === key) ?? null
    }
  }
  return null
}

/** The sibling areas worth a cross-link from `key`'s dashboard, filtered to the ones the
 *  viewer can enter (the "Related" strip). */
export function relatedGroups(
  key: DomainKey,
  role: CommunityRole,
  webRole: WebRole = 'none',
  staffRole: StaffRole | null = null,
): AdminGroup[] {
  const g = ADMIN_GROUPS.find((x) => x.key === key)
  if (!g?.related) return []
  return g.related
    .map((k) => ADMIN_GROUPS.find((x) => x.key === k))
    .filter((x): x is AdminGroup => !!x && canSeeGroup(x, role, webRole, staffRole))
}

/** The label of the current page within a domain (the breadcrumb tail), or null
 *  when the path is a domain root / unowned. */
export function pageLabelForPath(pathname: string): string | null {
  let best: { label: string; len: number } | null = null
  for (const g of ADMIN_GROUPS) {
    for (const l of g.links) {
      const match = l.href === pathname || pathname.startsWith(`${l.href}/`)
      if (match && (!best || l.href.length > best.len)) best = { label: l.label, len: l.href.length }
    }
  }
  return best?.label ?? null
}

/** The back-link a sub-page shows to its parent DOMAIN dashboard (or null on a domain
 *  root / unowned path). A folded sub-group (content/rewards/acquisition/crm/marketing)
 *  resolves UP to its primary domain by stripping the ?tab from its href, so e.g. a
 *  Journeys editor links back to "Programs", a Campaign back to "Growth". */
export function backToDomainFor(pathname: string): { href: string; label: string } | null {
  if (pathname === '/admin') return null
  const group = domainForPath(pathname)
  if (!group || pathname === group.href) return null
  const baseHref = group.href.split('?')[0]
  const primary = ADMIN_GROUPS.find((g) => g.href === baseHref && g.primary !== false) ?? group
  if (pathname === primary.href) return null
  return { href: primary.href, label: primary.label }
}
