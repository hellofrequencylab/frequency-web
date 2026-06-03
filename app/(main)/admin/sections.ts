// Single source of truth for the admin IA — the grouped catalog of every admin
// surface, the role each one needs, and where it lives. Both the admin nav
// (sub-nav.tsx) and the Overview launchpad (page.tsx) render from this, so a
// feature is declared in exactly ONE place and can never be orphaned again.
//
// Groups telescope by role: a host sees Community; a guide adds Structure; a
// janitor adds Insights, Vera, and Platform. That mirrors the permission model —
// each role manages the surfaces for the people under them (docs/GLOSSARY.md).

import {
  LayoutDashboard,
  CircleDot,
  Radio,
  CalendarDays,
  Megaphone,
  ClipboardList,
  Trophy,
  ShieldAlert,
  Building2,
  Network,
  Activity,
  Target,
  Sparkles,
  PieChart,
  Bot,
  HelpCircle,
  Users,
  Shield,
  FlaskConical,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { atLeastRole, type CommunityRole } from '@/lib/core/roles'

export interface AdminLink {
  href: string
  label: string
  /** One-line purpose — shown on the Overview launchpad card. */
  desc: string
  Icon: LucideIcon
  /** Lowest role that may use this surface. */
  min: CommunityRole
  /** Active only on an exact path match (the Overview root). */
  exact?: boolean
}

export interface AdminGroup {
  key: string
  label: string
  /** One-line framing for the group, shown as the launchpad section intro. */
  blurb: string
  links: readonly AdminLink[]
}

export const ADMIN_GROUPS: readonly AdminGroup[] = [
  {
    key: 'community',
    label: 'Community',
    blurb: 'The spaces and people you steward day to day.',
    links: [
      { href: '/admin', label: 'Overview', desc: 'Your dashboard at a glance.', Icon: LayoutDashboard, min: 'host', exact: true },
      { href: '/admin/circles', label: 'Circles', desc: 'Create, edit, and archive circles.', Icon: CircleDot, min: 'host' },
      { href: '/admin/channels', label: 'Channels', desc: 'Interest and event channels.', Icon: Radio, min: 'host' },
      { href: '/admin/events', label: 'Events', desc: 'Gatherings across your circles.', Icon: CalendarDays, min: 'host' },
      { href: '/admin/dispatches', label: 'Broadcasts', desc: 'Posts and polls to your people.', Icon: Megaphone, min: 'host' },
      { href: '/admin/crew-tasks', label: 'Crew tasks', desc: 'Define and verify member tasks.', Icon: ClipboardList, min: 'host' },
      { href: '/admin/gamification', label: 'Gamification', desc: 'Achievements, seasons, rewards.', Icon: Trophy, min: 'host' },
      { href: '/admin/moderation', label: 'Moderation', desc: 'Review and resolve reports.', Icon: ShieldAlert, min: 'host' },
    ],
  },
  {
    key: 'structure',
    label: 'Structure',
    blurb: 'The place tree under you — hubs and nexuses.',
    links: [
      { href: '/admin/hubs', label: 'Hubs', desc: 'Clusters of circles in an area.', Icon: Building2, min: 'guide' },
      { href: '/admin/nexuses', label: 'Nexuses', desc: 'Regions that hold hubs.', Icon: Network, min: 'mentor' },
    ],
  },
  {
    key: 'insights',
    label: 'Insights',
    blurb: 'Read-only signal on what is working and what is jamming.',
    links: [
      { href: '/admin/engagement', label: 'Engagement', desc: 'Active members and the activation funnel.', Icon: Activity, min: 'janitor' },
      { href: '/admin/outcomes', label: 'Outcomes', desc: 'Where programs and quests stall.', Icon: Target, min: 'janitor' },
      { href: '/admin/insights', label: 'AI read', desc: 'A narrative of what to do next.', Icon: Sparkles, min: 'janitor' },
      { href: '/admin/segments', label: 'Segments', desc: 'Saved audiences by tag and trait.', Icon: PieChart, min: 'janitor' },
    ],
  },
  {
    key: 'vera',
    label: 'Vera',
    blurb: 'Tune the AI guide and see what she could not answer.',
    links: [
      { href: '/admin/vera', label: 'Vera config', desc: 'Voice, responses, and induction copy.', Icon: Bot, min: 'janitor' },
      { href: '/admin/help-gaps', label: 'Help gaps', desc: 'Questions Vera deflected — the to-write list.', Icon: HelpCircle, min: 'janitor' },
    ],
  },
  {
    key: 'platform',
    label: 'Platform',
    blurb: 'The sensitive keys — handled by janitors only.',
    links: [
      { href: '/admin/members', label: 'Members', desc: 'Roster, subscribers, and accounts.', Icon: Users, min: 'janitor' },
      { href: '/admin/roles', label: 'Roles', desc: 'Assign roles and the permission grid.', Icon: Shield, min: 'janitor' },
      { href: '/admin/demo', label: 'Demo data', desc: 'Toggle and purge seeded content.', Icon: FlaskConical, min: 'janitor' },
    ],
  },
] as const

/** The admin group that owns a path — by longest matching link href (so `/admin`
 *  resolves to Community, `/admin/hubs` to Structure, etc.). Used to drive the
 *  per-category sub-tabs (layer 2) from the current URL. Falls back to the first
 *  visible group. */
export function groupForPath(pathname: string, role: CommunityRole): AdminGroup {
  const groups = visibleGroups(role)
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

/** The groups (with only the links) a given role may see. Empty groups drop out. */
export function visibleGroups(role: CommunityRole): AdminGroup[] {
  return ADMIN_GROUPS.map((g) => ({
    ...g,
    links: g.links.filter((l) => atLeastRole(role, l.min)),
  })).filter((g) => g.links.length > 0)
}

/** Flat list of links a role may see — handy for breadcrumb/title lookups. */
export function visibleLinks(role: CommunityRole): AdminLink[] {
  return visibleGroups(role).flatMap((g) => g.links)
}
