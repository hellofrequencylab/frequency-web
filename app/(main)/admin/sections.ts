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
  Radar,
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
  Gift,
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

// The three operator domains. Each `key` doubles as its dashboard route slug
// ('programs' → /admin/programs). Programs/Operations floor at community host (+
// the community staff domain); Growth floors at host / marketing staff. Individual
// links keep their own (often stricter, janitor) gates.
export type DomainKey = 'programs' | 'operations' | 'growth'

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
    links: [
      { href: '/admin/content', label: 'Content suite', desc: 'Curate the Quest. Seasons, Journeys, Practices, Challenges.', Icon: Map, min: 'host', staffDomain: 'community' },
      { href: '/admin/content/seasons', label: 'Seasons', desc: 'Season identity, theme, and lifecycle.', Icon: CalendarDays, min: 'host', staffDomain: 'community' },
      { href: '/admin/content/journeys', label: 'Journeys', desc: 'Curate and publish official journeys.', Icon: BookOpen, min: 'host', staffDomain: 'community' },
      { href: '/admin/content/practices', label: 'Practices', desc: 'The practice catalog and its adopters.', Icon: Sparkles, min: 'host', staffDomain: 'community' },
      { href: '/admin/content/challenges', label: 'Challenges', desc: 'Define challenges and watch completion.', Icon: Target, min: 'host', staffDomain: 'community' },
      { href: '/admin/content/tips', label: 'Creator tips', desc: 'Tips and prompts for content creators.', Icon: Lightbulb, min: 'host', staffDomain: 'community' },
      { href: '/admin/gamification', label: 'Gamification & rewards', desc: 'Achievements, seasons, rewards.', Icon: Trophy, min: 'host', staffDomain: 'community' },
      { href: '/admin/store', label: 'Store', desc: 'Manage gem store items and catalog.', Icon: ShoppingBag, min: 'host', staffDomain: 'community' },
      { href: '/admin/rewards', label: 'Retroactive rewards', desc: 'Reward past behavior. Define a rule, grant once.', Icon: Gift, min: 'admin' },
      { href: '/admin/crew-tasks', label: 'Crew tasks', desc: 'Define and verify member tasks.', Icon: ClipboardList, min: 'host', staffDomain: 'community' },
      { href: '/programs', label: 'Leader training', desc: 'Materials to start and run a circle.', Icon: BookOpen, min: 'host', staffDomain: 'community' },
      { href: '/admin/outcomes', label: 'Outcomes', desc: 'Where programs and Journeys stall.', Icon: Target, min: 'janitor', staffDomain: 'insights', staffLevel: 'read' },
    ],
  },
  {
    key: 'operations',
    label: 'Operations',
    blurb: 'Run the site. Community, people, trust and safety, and the platform keys.',
    href: '/admin/operations',
    Icon: SlidersHorizontal,
    min: 'host',
    staffDomain: 'community',
    links: [
      // ── Community ──
      { href: '/admin/circles', label: 'Circles', desc: 'Create, edit, and archive circles.', Icon: CircleDot, min: 'host', staffDomain: 'community', section: 'Community' },
      { href: '/admin/channels', label: 'Channels', desc: 'Topical and event channels.', Icon: Radio, min: 'host', staffDomain: 'community', section: 'Community' },
      { href: '/admin/events', label: 'Events', desc: 'Gatherings across your circles.', Icon: CalendarDays, min: 'host', staffDomain: 'community', section: 'Community' },
      { href: '/admin/hubs', label: 'Hubs', desc: 'Clusters of circles in an area.', Icon: Building2, min: 'guide', staffDomain: 'structure', section: 'Community' },
      { href: '/admin/nexuses', label: 'Nexuses', desc: 'Regions that hold hubs.', Icon: Network, min: 'mentor', staffDomain: 'structure', section: 'Community' },
      { href: '/admin/dispatches', label: 'Broadcasts', desc: 'Posts and polls to your people.', Icon: Megaphone, min: 'host', staffDomain: 'community', section: 'Community' },
      // ── People ──
      { href: '/admin/members', label: 'Members', desc: 'Roster, subscribers, and accounts.', Icon: Users, min: 'janitor', section: 'People' },
      { href: '/admin/roles', label: 'Roles & permissions', desc: 'Assign roles and the permission grid.', Icon: Shield, min: 'janitor', section: 'People' },
      { href: '/admin/personas', label: 'Partner verification', desc: 'Vet and verify partner persona claims.', Icon: BadgeCheck, min: 'janitor', staffDomain: 'profiles', section: 'People' },
      // ── Trust & safety ──
      { href: '/admin/moderation', label: 'Moderation', desc: 'Review and resolve reports.', Icon: ShieldAlert, min: 'host', staffDomain: 'community', section: 'Trust & safety' },
      { href: '/admin/support', label: 'Support', desc: 'Member support tickets and help requests.', Icon: LifeBuoy, min: 'host', staffDomain: 'members', section: 'Trust & safety' },
      { href: '/admin/ai', label: 'AI controls', desc: 'Turn AI on or off platform-wide; usage and audit.', Icon: Power, min: 'janitor', staffDomain: 'platform', section: 'Trust & safety' },
      { href: '/admin/audit', label: 'Audit log', desc: 'Sensitive admin actions. The security trail.', Icon: ScrollText, min: 'admin', section: 'Trust & safety' },
      // ── Site & system ──
      { href: '/pages', label: 'Pages', desc: 'Edit public pages and content blocks.', Icon: FileText, min: 'janitor', section: 'Site & system' },
      { href: '/admin/qr', label: 'QR Studio', desc: 'Generate, design, and manage all QR codes.', Icon: QrCode, min: 'host', staffDomain: 'qr', section: 'Site & system' },
      { href: '/admin/vera', label: 'Vera config', desc: 'Voice, responses, and induction copy.', Icon: Bot, min: 'janitor', staffDomain: 'insights', section: 'Site & system' },
      { href: '/admin/help-gaps', label: 'Help gaps', desc: 'Questions Vera deflected. The to-write list.', Icon: HelpCircle, min: 'janitor', section: 'Site & system' },
      { href: '/admin/demo', label: 'Demo Studio', desc: 'Generate, manage, and purge seeded demo content.', Icon: Sparkles, min: 'janitor', section: 'Site & system' },
      { href: '/admin/payments', label: 'Payments', desc: 'Turn host payouts (tips, tickets, sales) on or off.', Icon: CreditCard, min: 'janitor', section: 'Site & system' },
    ],
  },
  {
    key: 'growth',
    label: 'Growth',
    blurb: 'Grow it. Funnels, onboarding, pipeline, campaigns, and the expansion signal.',
    href: '/admin/growth',
    Icon: TrendingUp,
    min: 'host',
    staffDomain: 'marketing',
    links: [
      { href: '/admin/intel', label: 'Lead funnels & marketing intel', desc: 'Real-time growth, demand, and leader signal.', Icon: Telescope, min: 'janitor', staffDomain: 'insights', staffLevel: 'read' },
      { href: '/pages/splash', label: 'Onboarding splash', desc: 'The first-run splash members land on.', Icon: Rocket, min: 'janitor' },
      { href: '/pages/sequences', label: 'Splash pages', desc: 'Sequenced splash pages and flows.', Icon: Layers, min: 'janitor' },
      { href: '/admin/crm', label: 'CRM pipeline', desc: 'Deals, stages, and follow-ups.', Icon: Contact, min: 'host', staffDomain: 'marketing' },
      { href: '/connections', label: 'Profiles & contacts', desc: 'People, contacts, and relationships.', Icon: ContactRound, min: 'host', staffDomain: 'profiles' },
      { href: '/admin/marketing', label: 'Marketing campaigns', desc: 'Campaigns across your channels.', Icon: Briefcase, min: 'host', staffDomain: 'marketing' },
      { href: '/entry-points', label: 'Entry points', desc: 'Where people first enter your spaces.', Icon: QrCode, min: 'host', staffDomain: 'marketing' },
      { href: '/admin/segments', label: 'Segments', desc: 'Saved audiences by tag and trait.', Icon: PieChart, min: 'janitor', staffDomain: 'insights', staffLevel: 'read' },
      { href: '/admin/engagement', label: 'Engagement', desc: 'Active members and the activation funnel.', Icon: Activity, min: 'janitor', staffDomain: 'insights', staffLevel: 'read' },
      { href: '/admin/expansion', label: 'Expansion signal', desc: 'Where density justifies the next Lab.', Icon: Radar, min: 'janitor', staffDomain: 'insights', staffLevel: 'read' },
      { href: '/admin/studio', label: 'AI Studio', desc: 'Ranked AI recommendations and one-click, reversible changes.', Icon: Lightbulb, min: 'admin', staffDomain: 'insights' },
      { href: '/admin/insights', label: 'AI read', desc: 'A narrative of what to do next.', Icon: Sparkles, min: 'janitor', staffDomain: 'insights', staffLevel: 'read' },
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
  label: 'Home',
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
  for (const { href, key } of HREF_TO_DOMAIN) {
    if (pathname === href || pathname.startsWith(`${href}/`)) {
      return ADMIN_GROUPS.find((g) => g.key === key) ?? null
    }
  }
  return null
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
