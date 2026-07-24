import Link from 'next/link'
import {
  Users, ArrowUpRight, CircleDot, Building2, Network, Radio, Shield,
  BadgeCheck, CalendarDays, Megaphone, ShieldAlert, LifeBuoy, type LucideIcon,
} from 'lucide-react'
import { AdminSection } from '@/components/templates'
import { createAdminClient } from '@/lib/supabase/admin'
import { ticketStatusCounts } from '@/lib/support/store'
import { isOpenStatus } from '@/lib/support/types'

// Community layout module (LP7): "Manage" — one card per working sub-page, each a live stat plus a
// link straight to the surface that edits it. Self-fetching RSC; the page owns the gate and every
// linked area keeps its own. Fail-safe: any read error degrades to honest zeros. The grid is a
// container query so it sizes to whatever slot it lands in. Semantic tokens only; no hex, no fixed px.

interface ManageCard {
  label: string
  desc: string
  stat: string
  statLabel: string
  href: string
  Icon: LucideIcon
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
  const c = await load()

  const cards: ManageCard[] = [
    { label: 'Circles', desc: 'Create, edit, and archive circles.', stat: `${c.circles}`, statLabel: 'active circles', href: '/admin/circles', Icon: CircleDot },
    { label: 'Hubs', desc: 'Clusters of circles in an area.', stat: `${c.hubs}`, statLabel: 'hubs', href: '/admin/hubs', Icon: Building2 },
    { label: 'Nexuses', desc: 'Regions that hold hubs.', stat: `${c.nexuses}`, statLabel: 'nexuses', href: '/admin/nexuses', Icon: Network },
    { label: 'Channels', desc: 'Topical and event channels.', stat: `${c.channels}`, statLabel: 'channels', href: '/admin/channels', Icon: Radio },
    { label: 'Members', desc: 'Roster, subscribers, and accounts.', stat: `${c.members}`, statLabel: 'members', href: '/admin/members', Icon: Users },
    { label: 'Roles & permissions', desc: 'Assign roles and the permission grid.', stat: `${c.team}`, statLabel: 'team members', href: '/admin/roles', Icon: Shield },
    { label: 'Partner verification', desc: 'Vet and verify partner persona claims.', stat: `${c.verifyQueue}`, statLabel: c.verifyQueue === 1 ? 'claim to verify' : 'claims to verify', href: '/admin/personas', Icon: BadgeCheck },
    { label: 'Events', desc: 'Gatherings across your circles, plus posted events and claims.', stat: `${c.events}`, statLabel: 'upcoming events', href: '/admin/events', Icon: CalendarDays },
    { label: 'Dispatches', desc: 'Posts and polls to your people.', stat: `${c.dispatches}`, statLabel: 'dispatches', href: '/admin/dispatches', Icon: Megaphone },
    { label: 'Moderation', desc: 'Review and resolve reports.', stat: `${c.reportsOpen}`, statLabel: c.reportsOpen === 1 ? 'open report' : 'open reports', href: '/admin/moderation', Icon: ShieldAlert },
    { label: 'Support', desc: 'Member support tickets and help requests.', stat: `${c.openTickets}`, statLabel: c.openTickets === 1 ? 'open ticket' : 'open tickets', href: '/admin/support', Icon: LifeBuoy },
  ]

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
              <p className="text-sm font-semibold text-text">{card.label}</p>
              <p className="mt-0.5 text-xs leading-snug text-muted">{card.desc}</p>
            </div>
            <p className="mt-auto flex items-baseline gap-1.5">
              {card.stat && <span className="text-lg font-bold tabular-nums text-text">{card.stat}</span>}
              <span className="text-2xs font-medium uppercase tracking-wide text-subtle">{card.statLabel}</span>
            </p>
          </Link>
        ))}
      </div>
    </AdminSection>
  )
}
