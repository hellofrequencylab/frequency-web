import { Fragment, Suspense } from 'react'
import { cookies } from 'next/headers'
import Link from 'next/link'
import { ArrowUpRight, Users } from 'lucide-react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/admin/guard'
import { dashCookie, sanitizeDashOrder } from '../dash-sections'
import { RelatedAreas } from '@/components/admin/related-areas'
import { AdminTemplate, AdminSection } from '@/components/templates'
import { DashArea, TileGrid, Tile, MiniStat, MiniGrid } from '@/components/admin/dash'
import { AttentionList, type AttentionItem } from '@/components/admin/attention-list'
import { FreshnessNote } from '@/components/admin/freshness-note'
import { groupLinks } from '../sections'
import type { AdminLink } from '../sections'
import { createAdminClient } from '@/lib/supabase/admin'
import { ticketStatusCounts } from '@/lib/support/store'
import { isOpenStatus } from '@/lib/support/types'

// Community — "the people and their spaces." The DOMAIN DASHBOARD (ADR-233 §3.2): the
// same tiled grammar as the exec home, scoped to circles and the regions that hold
// them, the member roster and access, the activity that flows through (events,
// broadcasts), and the trust & safety queue. KPI MiniStat clusters + a domain
// attention strip + area-card entry tiles into the domain's own surfaces. Headers +
// instructional copy print on the canvas; all data lives in white tiles. Gate: host+
// floor (community staff); each linked area keeps its own (often janitor) gate. Each
// slow read sits behind its own Suspense so the shell never blocks (PAGE-FRAMEWORK §5).

const DAY = 24 * 60 * 60 * 1000

export default async function CommunityDashboard() {
  const { role, webRole, staffRole } = await requireAdmin('host', { staff: 'community' })
  const links = groupLinks('community', role, webRole, staffRole)
  const order = sanitizeDashOrder('community', (await cookies()).get(dashCookie('community'))?.value)

  const sections: Record<string, React.ReactNode> = {
    trust: (
      <Suspense fallback={<DashSkeleton title="Trust & safety" />}>
        <TrustSafetyArea />
      </Suspense>
    ),
    structure: (
      <Suspense fallback={<DashSkeleton title="Structure & people" />}>
        <StructureArea />
      </Suspense>
    ),
    work: (
      <AdminSection title="Work in Community" description="Every surface in this domain you can manage.">
        <AreaTiles links={links} />
      </AdminSection>
    ),
  }

  return (
    <AdminTemplate
      title="Community"
      eyebrow="Domain"
      icon={Users}
      width="wide"
      description="The people and their spaces. Circles, members, events, and trust and safety. Start with whatever needs your attention, then dig into a surface."
    >
      {order.map((id) => (
        <Fragment key={id}>{sections[id]}</Fragment>
      ))}

      <RelatedAreas current="community" role={role} webRole={webRole} staffRole={staffRole} />
    </AdminTemplate>
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
    (admin as unknown as SupabaseClient)
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
      icon={Users}
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

// ── Structure & people — the shape of the live site and who's in it. ─────────────
async function StructureArea() {
  const admin = createAdminClient()
  const nowIso = new Date().toISOString()

  const [circles, channels, events, hubs, nexuses, dispatches, members, inCircles, team] =
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
    ])

  return (
    <DashArea
      icon={Users}
      label="Structure & people"
      blurb="The shape of the live site and who's in it — circles, channels, events, the regions and broadcasts that reach them, the roster, and the staff team."
      href="/admin/circles"
      hrefLabel="Open Circles"
      footnote="Counts read live. Members are real (non-system) profiles; In circles counts active memberships."
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
        <Tile label="People" span={3} caption="Every number opens its roster or list.">
          <MiniGrid>
            <MiniStat value={(members.count ?? 0).toLocaleString()} label="Members" />
            <MiniStat value={(inCircles.count ?? 0).toLocaleString()} label="In circles" />
            <MiniStat value={(team.count ?? 0).toLocaleString()} label="Team members" />
          </MiniGrid>
        </Tile>
      </TileGrid>
    </DashArea>
  )
}

// Area-card entry tiles into the domain's surfaces — the soft-surface launchpad style,
// scoped to what the viewer can reach (role filtering happens upstream in groupLinks).
function AreaTiles({ links }: { links: readonly AdminLink[] }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {links.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          className="group flex items-start gap-3 rounded-2xl bg-surface-elevated/60 p-4 transition-colors hover:bg-surface-elevated motion-reduce:transition-none"
        >
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface text-primary-strong">
            <l.Icon className="h-4 w-4" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1 text-sm font-semibold text-text">
              {l.label}
              <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-subtle opacity-0 transition-opacity group-hover:opacity-100" />
            </span>
            <span className="mt-0.5 block text-xs text-muted">{l.desc}</span>
          </span>
        </Link>
      ))}
    </div>
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
