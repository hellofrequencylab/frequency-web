import Link from 'next/link'
import {
  Users, ArrowUpRight, CircleDot, Building2, Network, Radio, Shield,
  BadgeCheck, CalendarDays, Megaphone, ShieldAlert, LifeBuoy, LayoutDashboard,
  type LucideIcon,
} from 'lucide-react'
import { AdminSection } from '@/components/templates'
import { canUseLink, type AdminLink } from '@/app/(main)/admin/sections'
import { studioLeaf } from '@/lib/nav/studio'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCallerProfile } from '@/lib/auth'
import { getStaffMember } from '@/lib/staff'
import { ticketStatusCounts } from '@/lib/support/store'
import { isOpenStatus } from '@/lib/support/types'
import type { CommunityRole, WebRole } from '@/lib/core/roles'
import type { StaffRole } from '@/lib/core/staff-roles'

// Community layout module (LP7): "Manage" — one card per working sub-page, each a live stat plus a
// link straight to the surface that edits it. Self-fetching RSC; the page owns the gate and every
// linked area keeps its own. Fail-safe: any read error degrades to honest zeros. The grid is a
// container query so it sizes to whatever slot it lands in. Semantic tokens only; no hex, no fixed px.
//
// THE DESTINATIONS ARE DERIVED, NOT TYPED (SCAN-503). Label, description, href, icon and GATE all
// come from the one nav catalog (lib/nav/studio.ts::STUDIO_LEAVES) via `studioLeaf(id)`. This file
// declares only what the catalog cannot know: which leaves belong on this dashboard, and the live
// stat under each. Two things were wrong while the cards were hand-declared, and `check:menu` is
// structurally blind to a list rendered by a page (docs/MENU-CONTRACT.md §"What is NOT enforced"):
// the copy drifted from the leaf `desc`, and the cards carried NO gate, so a host+marketing viewer
// was shown janitor-gated destinations (Members, Roles, Partner verification) that bounce on click.

/** A destination card: the catalog's link, plus the live stat this dashboard reads for it. */
type ManageCard = AdminLink & { stat: string; statLabel: string }

/** What this dashboard adds to a leaf: which one, and the stat beneath it. */
type CardSpec = { leaf: string; stat: string; statLabel: string }

/** lucide icon NAME → component, for the leaves listed below. The catalog stores names
 *  (framework-free); app/(main)/admin/sections.ts keeps the same map for its own consumers but
 *  does not export the resolver, so the widget resolves the handful of names it renders. */
const ICONS: Record<string, LucideIcon> = {
  CircleDot, Building2, Network, Radio, Users, Shield, BadgeCheck, CalendarDays,
  Megaphone, ShieldAlert, LifeBuoy,
}

interface ViewerRoles {
  role: CommunityRole
  webRole: WebRole
  staffRole: StaffRole | null
}

/** The viewer's three role axes, read the same way the sibling "Related areas" module reads them
 *  (components/widgets/community/related.tsx). Null on a signed-out or failed read, which hides the
 *  section rather than showing destinations we cannot prove the viewer may enter. */
async function loadRoles(): Promise<ViewerRoles | null> {
  try {
    const [profile, staff] = await Promise.all([
      getCallerProfile(),
      getStaffMember().catch(() => null),
    ])
    if (!profile) return null
    return { role: profile.community_role, webRole: profile.webRole, staffRole: staff?.role ?? null }
  } catch {
    return null
  }
}

/** Resolve each spec against the catalog and drop what this viewer may not use. `canUseLink` is the
 *  SAME gate the admin rail and both consoles apply, so a card can never offer a destination that
 *  bounces. A spec naming a leaf that no longer exists drops out rather than rendering a dead card. */
function cardsFor(specs: readonly CardSpec[], viewer: ViewerRoles): ManageCard[] {
  return specs.flatMap((spec) => {
    const leaf = studioLeaf(spec.leaf)
    if (!leaf) return []
    const link: AdminLink = {
      href: leaf.href,
      label: leaf.label,
      desc: leaf.desc,
      Icon: ICONS[leaf.icon] ?? LayoutDashboard,
      min: leaf.min,
    }
    if (leaf.staffDomain) link.staffDomain = leaf.staffDomain
    if (leaf.staffLevel) link.staffLevel = leaf.staffLevel
    if (!canUseLink(link, viewer.role, viewer.webRole, viewer.staffRole)) return []
    return [{ ...link, stat: spec.stat, statLabel: spec.statLabel }]
  })
}

interface ManageCounts {
  circles: number
  hubs: number
  nexuses: number
  channels: number
  members: number
  team: number
  verifyQueue: number
  events: number
  dispatches: number
  reportsOpen: number
  openTickets: number
}

const EMPTY: ManageCounts = {
  circles: 0, hubs: 0, nexuses: 0, channels: 0, members: 0, team: 0,
  verifyQueue: 0, events: 0, dispatches: 0, reportsOpen: 0, openTickets: 0,
}

async function load(): Promise<ManageCounts> {
  try {
    const admin = createAdminClient()
    const nowIso = new Date().toISOString()

    const [
      circles, hubs, nexuses, channels, members, team, pendingPersonas,
      events, dispatches, openReports, ticketCounts,
    ] = await Promise.all([
      admin.from('circles').select('id', { count: 'exact', head: true }).eq('status', 'active'),
      admin.from('hubs').select('id', { count: 'exact', head: true }),
      admin.from('nexuses').select('id', { count: 'exact', head: true }),
      admin.from('channels').select('id', { count: 'exact', head: true }),
      admin.from('profiles').select('id', { count: 'exact', head: true }).eq('is_system', false),
      admin.from('team_members').select('id', { count: 'exact', head: true }),
      admin
        .from('profile_personas')
        .select('id', { count: 'exact', head: true })
        .eq('state', 'claimed'),
      admin
        .from('events')
        .select('id', { count: 'exact', head: true })
        .gte('starts_at', nowIso)
        .eq('is_cancelled', false),
      admin.from('dispatches').select('id', { count: 'exact', head: true }),
      admin.from('reports').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      ticketStatusCounts(),
    ])

    const openTickets = Object.entries(ticketCounts).reduce(
      (sum, [status, n]) => (isOpenStatus(status as never) ? sum + n : sum),
      0,
    )

    return {
      circles: circles.count ?? 0,
      hubs: hubs.count ?? 0,
      nexuses: nexuses.count ?? 0,
      channels: channels.count ?? 0,
      members: members.count ?? 0,
      team: team.count ?? 0,
      verifyQueue: pendingPersonas.count ?? 0,
      events: events.count ?? 0,
      dispatches: dispatches.count ?? 0,
      reportsOpen: openReports.count ?? 0,
      openTickets,
    }
  } catch {
    return EMPTY
  }
}

export async function CommunityManage() {
  const [c, viewer] = await Promise.all([load(), loadRoles()])
  if (!viewer) return null

  const specs: CardSpec[] = [
    { leaf: 'circles', stat: `${c.circles}`, statLabel: 'active circles' },
    { leaf: 'hubs', stat: `${c.hubs}`, statLabel: 'hubs' },
    { leaf: 'nexuses', stat: `${c.nexuses}`, statLabel: 'nexuses' },
    { leaf: 'channels', stat: `${c.channels}`, statLabel: 'channels' },
    { leaf: 'members', stat: `${c.members}`, statLabel: 'members' },
    { leaf: 'roles', stat: `${c.team}`, statLabel: 'team members' },
    { leaf: 'personas', stat: `${c.verifyQueue}`, statLabel: c.verifyQueue === 1 ? 'claim to verify' : 'claims to verify' },
    { leaf: 'events', stat: `${c.events}`, statLabel: 'upcoming events' },
    { leaf: 'dispatches', stat: `${c.dispatches}`, statLabel: 'dispatches' },
    { leaf: 'moderation', stat: `${c.reportsOpen}`, statLabel: c.reportsOpen === 1 ? 'open report' : 'open reports' },
    { leaf: 'support', stat: `${c.openTickets}`, statLabel: c.openTickets === 1 ? 'open ticket' : 'open tickets' },
  ]

  const cards = cardsFor(specs, viewer)
  if (cards.length === 0) return null

  return (
    <AdminSection title="Manage" description="Every working surface in Community. Open one to edit it.">
      <div className="grid gap-3 @2xl:grid-cols-2 @4xl:grid-cols-3">
        {cards.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="group flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 transition-colors hover:border-border-strong"
          >
            <div className="flex items-start justify-between gap-2">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-bg text-primary-strong">
                <card.Icon className="h-4 w-4" aria-hidden />
              </span>
              <ArrowUpRight className="h-4 w-4 shrink-0 text-subtle opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
            </div>
            <div className="min-w-0">
              <p className="text-body-sm font-semibold text-text">{card.label}</p>
              <p className="mt-0.5 text-meta leading-snug text-muted">{card.desc}</p>
            </div>
            <p className="mt-auto flex items-baseline gap-1.5">
              {card.stat && <span className="text-body-lg font-bold tabular-nums text-text">{card.stat}</span>}
              <span className="text-2xs font-medium uppercase tracking-wide text-muted">{card.statLabel}</span>
            </p>
          </Link>
        ))}
      </div>
    </AdminSection>
  )
}
