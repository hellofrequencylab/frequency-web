// Single source of truth for the admin IA — the grouped catalog of every admin
// surface, the role each one needs, and where it lives. Both the admin nav
// (sub-nav.tsx) and the Overview launchpad (page.tsx) render from this, so a
// feature is declared in exactly ONE place and can never be orphaned again.
//
// Each group is a **suite** (ADR-153): a full-page admin area whose links render
// as the top-bar sub-nav tabs, and as a launchpad section. The nine suites roll up
// into three operator **dashboards** (ADR-171) — Community / Insights / Platform —
// telescoped by role: a host sees only Community (Spaces / Engage / Comms / Safety /
// Reach); a guide/mentor adds the Hubs/Nexuses tabs; a janitor adds the Insights
// (Insights / Vera) and Platform (People / System) dashboards. Each suite manages the
// surfaces for the people under them (docs/GLOSSARY.md). The per-page sidebar console
// links *back* into these suites (it no longer hosts the heavy suites itself).

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
  Globe,
  Cog,
  LifeBuoy,
  ShoppingBag,
  Map,
  CreditCard,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { atLeastRole, type CommunityRole } from '@/lib/core/roles'
import { staffCan, type StaffDomain, type StaffRole, type Access } from '@/lib/core/staff-roles'

export interface AdminLink {
  href: string
  label: string
  /** One-line purpose — shown on the Overview launchpad card. */
  desc: string
  Icon: LucideIcon
  /** Lowest role that may use this surface. */
  min: CommunityRole
  /** Staff capability domain (ADR-127) that ALSO unlocks this surface — fail-closed:
   *  omit it and the link stays community-role-only (sensitive pages do this). */
  staffDomain?: StaffDomain
  /** Capability level the staff domain needs (default 'write'). Read-only surfaces
   *  (Insights) use 'read' so read-only roles (e.g. Analyst) can see them. */
  staffLevel?: Access
  /** Active only on an exact path match (the Overview root). */
  exact?: boolean
}

// The three operator dashboards a suite rolls up into (the owner's IA: collapse the
// nine suites into Community / Insights / Platform). Each suite declares its home.
export type DashboardKey = 'community' | 'insights' | 'platform'

export interface AdminGroup {
  key: string
  label: string
  /** One-line framing for the group, shown as the launchpad section intro. */
  blurb: string
  /** The operator dashboard this suite belongs to (ADR-171). */
  dashboard: DashboardKey
  links: readonly AdminLink[]
}

export interface AdminDashboard {
  key: DashboardKey
  label: string
  /** One-line framing, shown as the dashboard's section intro on the launchpad. */
  blurb: string
  Icon: LucideIcon
}

// The three dashboards, in display order. Community is the people-facing operating
// work; Insights is the read-only signal + Vera tuning; Platform is the sensitive keys.
export const ADMIN_DASHBOARDS: readonly AdminDashboard[] = [
  { key: 'community', label: 'Community', blurb: 'Run your people and spaces — circles, the game, comms, safety, and reach.', Icon: Globe },
  { key: 'insights', label: 'Insights', blurb: 'Read the signal and tune Vera — what’s working, what’s jamming, what to write next.', Icon: Telescope },
  { key: 'platform', label: 'Platform', blurb: 'The roster and the sensitive keys — roles, audit, AI, demo, and public pages.', Icon: Cog },
] as const

export const ADMIN_GROUPS: readonly AdminGroup[] = [
  {
    key: 'spaces',
    label: 'Spaces',
    blurb: 'The circles, channels, and events you run — and the place tree they cluster into.',
    dashboard: 'community',
    links: [
      { href: '/admin', label: 'Overview', desc: 'Your dashboard at a glance.', Icon: LayoutDashboard, min: 'host', staffDomain: 'community', exact: true },
      { href: '/admin/circles', label: 'Circles', desc: 'Create, edit, and archive circles.', Icon: CircleDot, min: 'host', staffDomain: 'community' },
      { href: '/admin/channels', label: 'Channels', desc: 'Interest and event channels.', Icon: Radio, min: 'host', staffDomain: 'community' },
      { href: '/admin/events', label: 'Events', desc: 'Gatherings across your circles.', Icon: CalendarDays, min: 'host', staffDomain: 'community' },
      { href: '/admin/hubs', label: 'Hubs', desc: 'Clusters of circles in an area.', Icon: Building2, min: 'guide', staffDomain: 'structure' },
      { href: '/admin/nexuses', label: 'Nexuses', desc: 'Regions that hold hubs.', Icon: Network, min: 'mentor', staffDomain: 'structure' },
    ],
  },
  {
    key: 'engage',
    label: 'Engage',
    blurb: 'The game that drives members to show up — seasons, tasks, and leader training.',
    dashboard: 'community',
    links: [
      { href: '/admin/gamification', label: 'Gamification', desc: 'Achievements, seasons, rewards.', Icon: Trophy, min: 'host', staffDomain: 'community' },
      { href: '/admin/store', label: 'Store', desc: 'Manage gem store items and catalog.', Icon: ShoppingBag, min: 'host', staffDomain: 'community' },
      { href: '/admin/quests', label: 'Quests', desc: 'Quest chains and journey library.', Icon: Map, min: 'host', staffDomain: 'community' },
      { href: '/admin/crew-tasks', label: 'Crew tasks', desc: 'Define and verify member tasks.', Icon: ClipboardList, min: 'host', staffDomain: 'community' },
      { href: '/admin/rewards', label: 'Retroactive rewards', desc: 'Reward past behavior — define a rule, grant once.', Icon: Gift, min: 'admin' },
      { href: '/programs', label: 'Leader training', desc: 'Materials to start and run a circle.', Icon: BookOpen, min: 'host', staffDomain: 'community' },
    ],
  },
  {
    key: 'comms',
    label: 'Comms',
    blurb: 'Reach your people — broadcasts, posts, and polls.',
    dashboard: 'community',
    links: [
      { href: '/admin/dispatches', label: 'Broadcasts', desc: 'Posts and polls to your people.', Icon: Megaphone, min: 'host', staffDomain: 'community' },
    ],
  },
  {
    key: 'safety',
    label: 'Safety',
    blurb: 'Keep the community healthy — reports, moderation, and member support.',
    dashboard: 'community',
    links: [
      { href: '/admin/moderation', label: 'Moderation', desc: 'Review and resolve reports.', Icon: ShieldAlert, min: 'host', staffDomain: 'community' },
      { href: '/admin/support', label: 'Support', desc: 'Member support tickets and help requests.', Icon: LifeBuoy, min: 'host', staffDomain: 'members' },
    ],
  },
  {
    key: 'reach',
    label: 'Reach',
    blurb: 'How people find and enter your spaces — every QR code and its scans.',
    dashboard: 'community',
    links: [
      { href: '/admin/qr', label: 'QR Studio', desc: 'Generate, design, and manage all QR codes.', Icon: QrCode, min: 'host', staffDomain: 'qr' },
      { href: '/admin/qr/stats', label: 'QR stats', desc: 'Scans, locator map, and the full QR dashboard.', Icon: Activity, min: 'host', staffDomain: 'qr' },
    ],
  },
  {
    key: 'people',
    label: 'People',
    blurb: 'The roster and who can do what.',
    dashboard: 'platform',
    links: [
      { href: '/admin/members', label: 'Members', desc: 'Roster, subscribers, and accounts.', Icon: Users, min: 'janitor' },
      { href: '/admin/roles', label: 'Roles', desc: 'Assign roles and the permission grid.', Icon: Shield, min: 'janitor' },
      { href: '/admin/personas', label: 'Partner verification', desc: 'Vet and verify partner persona claims.', Icon: BadgeCheck, min: 'janitor', staffDomain: 'profiles' },
      { href: '/admin/audit', label: 'Audit log', desc: 'Sensitive admin actions — the security trail.', Icon: ScrollText, min: 'admin' },
    ],
  },
  {
    key: 'insights',
    label: 'Insights',
    blurb: 'Read-only signal on what is working and what is jamming.',
    dashboard: 'insights',
    links: [
      { href: '/admin/studio', label: 'AI Studio', desc: 'Ranked AI recommendations + one-click, reversible site changes.', Icon: Lightbulb, min: 'admin', staffDomain: 'insights' },
      { href: '/admin/engagement', label: 'Engagement', desc: 'Active members and the activation funnel.', Icon: Activity, min: 'janitor', staffDomain: 'insights', staffLevel: 'read' },
      { href: '/admin/intel', label: 'Marketing intel', desc: 'Real-time growth, demand, and leader signal.', Icon: Telescope, min: 'janitor', staffDomain: 'insights', staffLevel: 'read' },
      { href: '/admin/outcomes', label: 'Outcomes', desc: 'Where programs and Journeys stall.', Icon: Target, min: 'janitor', staffDomain: 'insights', staffLevel: 'read' },
      { href: '/admin/expansion', label: 'Expansion signal', desc: 'Where density justifies the next Lab.', Icon: Radar, min: 'janitor', staffDomain: 'insights', staffLevel: 'read' },
      { href: '/admin/insights', label: 'AI read', desc: 'A narrative of what to do next.', Icon: Sparkles, min: 'janitor', staffDomain: 'insights', staffLevel: 'read' },
      { href: '/admin/segments', label: 'Segments', desc: 'Saved audiences by tag and trait.', Icon: PieChart, min: 'janitor', staffDomain: 'insights', staffLevel: 'read' },
    ],
  },
  {
    key: 'vera',
    label: 'Vera',
    blurb: 'Tune the AI guide and see what she could not answer.',
    dashboard: 'insights',
    links: [
      { href: '/admin/vera', label: 'Vera config', desc: 'Voice, responses, and induction copy.', Icon: Bot, min: 'janitor' },
      { href: '/admin/help-gaps', label: 'Help gaps', desc: 'Questions Vera deflected — the to-write list.', Icon: HelpCircle, min: 'janitor' },
    ],
  },
  {
    key: 'system',
    label: 'System',
    blurb: 'The sensitive platform keys — AI, demo content, and public pages.',
    dashboard: 'platform',
    links: [
      { href: '/admin/ai', label: 'AI controls', desc: 'Turn AI on or off platform-wide; usage and audit.', Icon: Power, min: 'janitor' },
      { href: '/admin/payments', label: 'Payments', desc: 'Turn host payouts (tips, tickets, sales) on or off.', Icon: CreditCard, min: 'janitor' },
      { href: '/admin/demo', label: 'Demo Studio', desc: 'Generate, manage, and purge seeded demo content.', Icon: Sparkles, min: 'janitor' },
      { href: '/pages', label: 'Pages', desc: 'Edit public pages and content blocks.', Icon: FileText, min: 'janitor' },
    ],
  },
] as const

/** The suite that owns a path — by longest matching link href (so `/admin/hubs`
 *  resolves to Spaces, `/admin/qr/stats` to Reach, etc.). Drives the suite's
 *  top-bar sub-nav tabs (layer 2) from the current URL. Falls back to the first
 *  visible suite. */
export function groupForPath(pathname: string, role: CommunityRole, staffRole: StaffRole | null = null): AdminGroup {
  const groups = visibleGroups(role, staffRole)
  let best: AdminGroup | null = null
  let bestLen = -1
  for (const g of groups) {
    for (const l of g.links) {
      const match = l.exact ? pathname === l.href : pathname === l.href || pathname.startsWith(`${l.href}/`)
      if (match && l.href.length > bestLen) {
        best = g
        bestLen = l.href.length
      }
    }
  }
  return best ?? groups[0]
}

/** The groups (with only the links) a given role may see. Empty groups drop out.
 *  A link shows if the community ladder grants it OR (ADR-127) the caller's staff
 *  role holds the link's `staffDomain` (write). */
export function visibleGroups(role: CommunityRole, staffRole: StaffRole | null = null): AdminGroup[] {
  return ADMIN_GROUPS.map((g) => ({
    ...g,
    links: g.links.filter(
      (l) => atLeastRole(role, l.min) || (!!l.staffDomain && staffCan(staffRole, l.staffDomain, l.staffLevel ?? 'write')),
    ),
  })).filter((g) => g.links.length > 0)
}

/** Flat list of links a role may see — handy for breadcrumb/title lookups. */
export function visibleLinks(role: CommunityRole, staffRole: StaffRole | null = null): AdminLink[] {
  return visibleGroups(role, staffRole).flatMap((g) => g.links)
}

/** A dashboard plus the suites under it that the viewer may see. */
export interface VisibleDashboard extends AdminDashboard {
  groups: AdminGroup[]
}

/** The role-gated admin catalog rolled up into the three operator dashboards
 *  (ADR-171). Suites the viewer can't see drop out; a dashboard with no visible
 *  suite drops out entirely (a host sees only Community; a janitor sees all three). */
export function visibleDashboards(
  role: CommunityRole,
  staffRole: StaffRole | null = null,
): VisibleDashboard[] {
  const groups = visibleGroups(role, staffRole)
  return ADMIN_DASHBOARDS.map((d) => ({
    ...d,
    groups: groups.filter((g) => g.dashboard === d.key),
  })).filter((d) => d.groups.length > 0)
}

/** The dashboard a suite belongs to — for the sub-nav breadcrumb root. */
export function dashboardForGroup(group: AdminGroup): AdminDashboard {
  return ADMIN_DASHBOARDS.find((d) => d.key === group.dashboard) ?? ADMIN_DASHBOARDS[0]
}
