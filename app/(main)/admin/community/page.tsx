import { Suspense } from 'react'
import Link from 'next/link'
import {
  Users, ArrowUpRight, CircleDot, Building2, Network, Radio, Shield,
  BadgeCheck, CalendarDays, Megaphone, ShieldAlert, LifeBuoy, Globe2,
  type LucideIcon,
} from 'lucide-react'
import { requireAdmin } from '@/lib/admin/guard'
import { AdminTemplate, AdminSection } from '@/components/templates'
import { feedOpenFlag } from '@/lib/platform-flags'
import { FeedReachToggle } from './feed-reach-toggle'
import { DashArea, TileGrid, Tile, GraphTile, MiniStat, MiniGrid } from '@/components/admin/dash'
import { TrendArea, weeklyBuckets, cumulative } from '@/components/admin/spark-charts'
import { AttentionList, type AttentionItem } from '@/components/admin/attention-list'
import { FreshnessNote } from '@/components/admin/freshness-note'
import { RelatedAreas } from '@/components/admin/related-areas'
import { createAdminClient } from '@/lib/supabase/admin'
import { ticketStatusCounts } from '@/lib/support/store'
import { isOpenStatus } from '@/lib/support/types'

// Community — the people and their spaces, as a single DASHBOARD (no sub-tabs), mirroring
// the Programs operator home: a Structure & people KPI area and a Trust & safety queue
// area up top, then ONE Manage card per working sub-page (Circles, Hubs, Nexuses,
// Channels, Members, Roles, Partner verification, Events, Broadcasts, Moderation,
// Support), each with a live stat and a link straight to the surface that edits it. Gate:
// host + floor (community staff); each linked area keeps its own (often janitor) gate.
// Each slow read streams behind its own Suspense so the shell never blocks (PAGE-FRAMEWORK §5).
export const dynamic = 'force-dynamic'

const DAY = 24 * 60 * 60 * 1000
const WEEK = 7 * DAY
const GROWTH_WEEKS = 12

export default async function CommunityDashboard() {
  const { role, webRole, staffRole } = await requireAdmin('host', { staff: 'community' })

  return (
    <AdminTemplate
      title="Community"
      eyebrow="Domain"
      icon={Users}
      width="wide"
      description="The people and their spaces in one place: the shape of the live site and who's in it, the live trust and safety queue, then every working surface, each a click from editing."
    >
      <Suspense fallback={<DashSkeleton title="Structure & people" />}>
        <StructureArea />
      </Suspense>

      <Suspense fallback={<DashSkeleton title="Trust & safety" />}>
        <TrustSafetyArea />
      </Suspense>

      <Suspense fallback={<DashSkeleton title="Feed reach" />}>
        <FeedReachArea />
      </Suspense>

      <Suspense fallback={<DashSkeleton title="Manage" />}>
        <ManageSections />
      </Suspense>

      <RelatedAreas current="community" role={role} webRole={webRole} staffRole={staffRole} />
    </AdminTemplate>
  )
}

// ── Structure & people — the shape of the live site, who's in it, and how it's grown. ──
async function StructureArea() {
  const admin = createAdminClient()
  const nowMs = new Date().getTime()
  const nowIso = new Date(nowMs).toISOString()
  const since = new Date(nowMs - GROWTH_WEEKS * WEEK).toISOString()

  const [circles, channels, events, hubs, nexuses, dispatches, members, inCircles, team, newMembers] =
    await Promise.all([
      admin.from('circles').select('id', { count: 'exact', head: true }).eq('status', 'active'),
      admin.from('channels').select('id', { count: 'exact', head: true }),
      admin
        .from('events')
        .select('id', { count: 'exact', head: true })
        .gte('starts_at', nowIso)
        .eq('is_cancelled', false),
      admin.from('hubs').select('id', { count: 'exact', head: true }),
      admin.from('nexuses').select('id', { count: 'exact', head: true }),
      admin.from('dispatches').select('id', { count: 'exact', head: true }),
      // Members = real (non-system) person profiles — the canonical count
      // (lib/analytics/members.ts). Circle membership is shown separately.
      admin.from('profiles').select('id', { count: 'exact', head: true }).eq('is_system', false),
      admin.from('memberships').select('id', { count: 'exact', head: true }).eq('status', 'active'),
      admin.from('team_members').select('id', { count: 'exact', head: true }),
      admin
        .from('profiles')
        .select('created_at')
        .eq('is_system', false)
        .gte('created_at', since),
    ])

  const totalMembers = members.count ?? 0
  const createdWeekly = weeklyBuckets(
    ((newMembers.data ?? []) as { created_at: string }[]).map((r) => new Date(r.created_at)),
    GROWTH_WEEKS,
  )
  const inWindow = createdWeekly.reduce((a, b) => a + b, 0)
  const memberGrowth = cumulative(totalMembers - inWindow, createdWeekly)

  return (
    <DashArea
      icon={Users}
      label="Structure & people"
      blurb="The shape of the live site and who's in it — circles, channels, events, the regions and broadcasts that reach them, the roster, and the staff team. Counts read live."
      href="/admin/circles"
      hrefLabel="Open Circles"
      footnote="Members are real (non-system) profiles; In circles counts active memberships. Growth is cumulative new members over the window."
    >
      <TileGrid>
        <Tile label="Network" span={3}>
          <MiniGrid>
            <MiniStat value={(circles.count ?? 0).toLocaleString()} label="Active circles" />
            <MiniStat value={(channels.count ?? 0).toLocaleString()} label="Channels" />
            <MiniStat value={(events.count ?? 0).toLocaleString()} label="Upcoming events" />
            <MiniStat value={(hubs.count ?? 0).toLocaleString()} label="Hubs" />
            <MiniStat value={(nexuses.count ?? 0).toLocaleString()} label="Nexuses" />
            <MiniStat value={(dispatches.count ?? 0).toLocaleString()} label="Broadcasts" />
          </MiniGrid>
        </Tile>
        <Tile label="People">
          <MiniGrid>
            <MiniStat value={totalMembers.toLocaleString()} label="Members" />
            <MiniStat value={(inCircles.count ?? 0).toLocaleString()} label="In circles" />
            <MiniStat value={(team.count ?? 0).toLocaleString()} label="Team members" />
            <MiniStat value={(events.count ?? 0).toLocaleString()} label="Upcoming events" />
          </MiniGrid>
        </Tile>
        <GraphTile
          label="Membership"
          value={totalMembers.toLocaleString()}
          caption={`${GROWTH_WEEKS} weeks · cumulative`}
          span={2}
        >
          <TrendArea points={memberGrowth} height={64} />
        </GraphTile>
      </TileGrid>
    </DashArea>
  )
}

// ── Trust & safety — the live queue, led by what needs attention now. ────────────
async function TrustSafetyArea() {
  const admin = createAdminClient()
  const weekAgo = new Date(new Date().getTime() - 7 * DAY).toISOString()

  const [openReports, recentModeration, ticketCounts, pendingPersonas] = await Promise.all([
    admin.from('reports').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    admin.from('admin_audit_log').select('id', { count: 'exact', head: true }).gte('created_at', weekAgo),
    ticketStatusCounts(),
    // profile_personas isn't in the generated types yet (repo convention: untyped cast).
    // A `claimed` persona is pending the staff verify queue (lib/personas.ts).
    (admin)
      .from('profile_personas')
      .select('id', { count: 'exact', head: true })
      .eq('state', 'claimed'),
  ])

  const openTickets = Object.entries(ticketCounts).reduce(
    (sum, [status, n]) => (isOpenStatus(status as never) ? sum + n : sum),
    0,
  )
  const reportsOpen = openReports.count ?? 0
  const verifyQueue = pendingPersonas.count ?? 0

  // The domain attention spine — only actionable items, ranked by what's waiting.
  const attention: AttentionItem[] = []
  if (reportsOpen > 0) {
    attention.push({
      id: 'reports',
      severity: reportsOpen > 5 ? 'risk' : 'watch',
      title: `${reportsOpen} ${reportsOpen === 1 ? 'report' : 'reports'} waiting`,
      finding: 'Member reports pending a moderation decision.',
      action: { label: 'Review', href: '/admin/moderation' },
    })
  }
  if (openTickets > 0) {
    attention.push({
      id: 'tickets',
      severity: openTickets > 10 ? 'risk' : 'watch',
      title: `${openTickets} open ${openTickets === 1 ? 'ticket' : 'tickets'}`,
      finding: 'Support requests still waiting on a reply.',
      action: { label: 'Open support', href: '/admin/support' },
    })
  }
  if (verifyQueue > 0) {
    attention.push({
      id: 'personas',
      severity: 'watch',
      title: `${verifyQueue} partner ${verifyQueue === 1 ? 'claim' : 'claims'} to verify`,
      finding: 'Persona claims awaiting verification.',
      action: { label: 'Verify', href: '/admin/personas' },
    })
  }

  return (
    <DashArea
      icon={ShieldAlert}
      label="Trust & safety"
      blurb="The live queue — open reports, support tickets, partner verification, and recent moderation. Start with whatever is waiting longest."
      href="/admin/moderation"
      hrefLabel="Open Moderation"
      footnote={<FreshnessNote at={new Date()} label="Read" />}
    >
      <TileGrid>
        {attention.length > 0 && (
          <Tile label="Needs attention" span={3}>
            <AttentionList items={attention} />
          </Tile>
        )}
        <Tile label="The queue" span={3} caption="Each number opens its filtered queue.">
          <MiniGrid>
            <MiniStat value={reportsOpen.toLocaleString()} label="Open reports" tone={reportsOpen > 0 ? 'bad' : 'neutral'} />
            <MiniStat value={openTickets.toLocaleString()} label="Open tickets" tone={openTickets > 0 ? 'bad' : 'neutral'} />
            <MiniStat value={verifyQueue.toLocaleString()} label="Verify queue" tone={verifyQueue > 0 ? 'bad' : 'neutral'} />
            <MiniStat value={(recentModeration.count ?? 0).toLocaleString()} label="Mod actions · 7d" />
          </MiniGrid>
        </Tile>
      </TileGrid>
    </DashArea>
  )
}

// ── Feed reach — the open-feed switch (platform_flags.feed_open). ────────────────
// Early in a community's life the reach gate (a member sees public posts + their own
// circles'/hubs' group & cluster posts — their people and nearby) makes the feed look
// empty. This switch opens it: everyone sees everyone's posts. Flip it back once there
// are enough members and the reach model should apply. The change is audited.
async function FeedReachArea() {
  const open = await feedOpenFlag()
  return (
    <AdminSection
      title="Feed reach"
      description="Who sees whose posts in the main feed. Open it for a young community so the feed feels alive; turn the reach gate back on once there are enough members for it to feel local."
    >
      <div className="rounded-2xl border border-border bg-surface p-4">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-bg text-primary-strong">
            <Globe2 className="h-4 w-4" aria-hidden />
          </span>
          <div className="min-w-0 space-y-3">
            <div>
              <p className="text-sm font-semibold text-text">Open feed</p>
              <p className="mt-0.5 text-xs leading-snug text-muted">
                On: every member sees every member’s posts. Off: a member sees public posts plus their
                own circles’ and nearby posts (the reach gate). Private posts don’t exist, so this never
                exposes anything members didn’t share with the community.
              </p>
            </div>
            <FeedReachToggle open={open} />
          </div>
        </div>
      </div>
    </AdminSection>
  )
}

// ── Manage — one card per working sub-page, each a stat + a link to edit it. ──────
interface ManageCard {
  label: string
  desc: string
  stat: string
  statLabel: string
  href: string
  Icon: LucideIcon
}

async function ManageSections() {
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
    (admin)
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
  const verifyQueue = pendingPersonas.count ?? 0
  const reportsOpen = openReports.count ?? 0

  const cards: ManageCard[] = [
    { label: 'Circles', desc: 'Create, edit, and archive circles.', stat: `${circles.count ?? 0}`, statLabel: 'active circles', href: '/admin/circles', Icon: CircleDot },
    { label: 'Hubs', desc: 'Clusters of circles in an area.', stat: `${hubs.count ?? 0}`, statLabel: 'hubs', href: '/admin/hubs', Icon: Building2 },
    { label: 'Nexuses', desc: 'Regions that hold hubs.', stat: `${nexuses.count ?? 0}`, statLabel: 'nexuses', href: '/admin/nexuses', Icon: Network },
    { label: 'Channels', desc: 'Topical and event channels.', stat: `${channels.count ?? 0}`, statLabel: 'channels', href: '/admin/channels', Icon: Radio },
    { label: 'Members', desc: 'Roster, subscribers, and accounts.', stat: `${members.count ?? 0}`, statLabel: 'members', href: '/admin/members', Icon: Users },
    { label: 'Roles & permissions', desc: 'Assign roles and the permission grid.', stat: `${team.count ?? 0}`, statLabel: 'team members', href: '/admin/roles', Icon: Shield },
    { label: 'Partner verification', desc: 'Vet and verify partner persona claims.', stat: `${verifyQueue}`, statLabel: verifyQueue === 1 ? 'claim to verify' : 'claims to verify', href: '/admin/personas', Icon: BadgeCheck },
    { label: 'Events', desc: 'Gatherings across your circles, plus posted events and claims.', stat: `${events.count ?? 0}`, statLabel: 'upcoming events', href: '/admin/events', Icon: CalendarDays },
    { label: 'Broadcasts', desc: 'Posts and polls to your people.', stat: `${dispatches.count ?? 0}`, statLabel: 'broadcasts', href: '/admin/dispatches', Icon: Megaphone },
    { label: 'Moderation', desc: 'Review and resolve reports.', stat: `${reportsOpen}`, statLabel: reportsOpen === 1 ? 'open report' : 'open reports', href: '/admin/moderation', Icon: ShieldAlert },
    { label: 'Support', desc: 'Member support tickets and help requests.', stat: `${openTickets}`, statLabel: openTickets === 1 ? 'open ticket' : 'open tickets', href: '/admin/support', Icon: LifeBuoy },
  ]

  return (
    <AdminSection title="Manage" description="Every working surface in Community. Open one to edit it.">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className="group flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 transition-colors hover:border-border-strong"
          >
            <div className="flex items-start justify-between gap-2">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-bg text-primary-strong">
                <c.Icon className="h-4 w-4" aria-hidden />
              </span>
              <ArrowUpRight className="h-4 w-4 shrink-0 text-subtle opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-text">{c.label}</p>
              <p className="mt-0.5 text-xs leading-snug text-muted">{c.desc}</p>
            </div>
            <p className="mt-auto flex items-baseline gap-1.5">
              {c.stat && <span className="text-lg font-bold tabular-nums text-text">{c.stat}</span>}
              <span className="text-2xs font-medium uppercase tracking-wide text-subtle">{c.statLabel}</span>
            </p>
          </Link>
        ))}
      </div>
    </AdminSection>
  )
}

// On-canvas area skeleton matching the DashArea grammar — a canvas title + line, then
// a row of white tile placeholders. Mirrors the home + Programs dashboards' fallback.
function DashSkeleton({ title }: { title: string }) {
  return (
    <section className="border-t border-border/70 pt-8 first:border-t-0 first:pt-0 sm:pt-9">
      <h2 className="text-xl font-bold tracking-tight text-text">{title}</h2>
      <div className="mt-2 h-4 w-2/3 animate-pulse rounded bg-surface-elevated" />
      <div className="mt-5 grid grid-cols-2 gap-3.5 lg:grid-cols-3">
        <div className="h-32 animate-pulse rounded-2xl bg-surface-elevated/70" />
        <div className="h-32 animate-pulse rounded-2xl bg-surface-elevated/70" />
        <div className="h-32 animate-pulse rounded-2xl bg-surface-elevated/70" />
      </div>
    </section>
  )
}
