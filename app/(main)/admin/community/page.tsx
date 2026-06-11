import { Suspense } from 'react'
import { Users } from 'lucide-react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/admin/guard'
import { AdminPage, AdminSection } from '@/components/admin/admin-page'
import { DashSection, StatRow, StatItem } from '@/components/admin/dash'
import { AdminAreaSections } from '@/components/admin/admin-area-grid'
import { groupSections } from '../sections'
import { createAdminClient } from '@/lib/supabase/admin'
import { ticketStatusCounts } from '@/lib/support/store'
import { isOpenStatus } from '@/lib/support/types'

// Community — the people and their spaces. The domain dashboard for circles and the
// regions that hold them, the member roster and access, the activity that flows
// through (events, broadcasts), and the trust & safety queue. Gate: host+ floor
// (community staff); each linked area keeps its own (often janitor) gate. Header KPIs
// up top, then described sections backed by REAL head-counts, then the area map.
// Heavier per-section sweeps sit behind their own <Suspense> (PAGE-FRAMEWORK §5).

const DAY = 24 * 60 * 60 * 1000

export default async function CommunityDashboard() {
  const { role, webRole, staffRole } = await requireAdmin('host', { staff: 'community' })
  const sections = groupSections('community', role, webRole, staffRole)

  return (
    <AdminPage
      title="Community"
      eyebrow="Domain"
      icon={Users}
      description="The people and their spaces. Circles, members, events, and trust and safety."
      actions={
        <Suspense fallback={<HeaderKpisSkeleton />}>
          <HeaderKpis />
        </Suspense>
      }
    >
      <Suspense fallback={<DashSkeleton title="Structure" />}>
        <StructureSection />
      </Suspense>

      <Suspense fallback={<DashSkeleton title="People & access" />}>
        <PeopleSection />
      </Suspense>

      <Suspense fallback={<DashSkeleton title="Trust & safety" />}>
        <TrustSafetySection />
      </Suspense>

      <AdminSection title="All areas" description="Everything in Community you can manage.">
        <AdminAreaSections sections={sections} />
      </AdminSection>
    </AdminPage>
  )
}

// ── Header KPI strip — the four numbers that frame the domain at a glance. ────────
async function HeaderKpis() {
  const admin = createAdminClient()
  const nowIso = new Date().toISOString()

  const [circles, members, events, reports] = await Promise.all([
    admin.from('circles').select('id', { count: 'exact', head: true }).eq('status', 'active'),
    admin.from('memberships').select('id', { count: 'exact', head: true }).eq('status', 'active'),
    admin
      .from('events')
      .select('id', { count: 'exact', head: true })
      .gte('starts_at', nowIso)
      .eq('is_cancelled', false),
    admin.from('reports').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
  ])

  return (
    <div className="flex divide-x divide-border/60 rounded-2xl border border-border bg-surface px-1 py-2.5 shadow-sm">
      {[
        { label: 'Active circles', value: (circles.count ?? 0).toLocaleString() },
        { label: 'Members', value: (members.count ?? 0).toLocaleString() },
        { label: 'Upcoming events', value: (events.count ?? 0).toLocaleString() },
        { label: 'Open reports', value: (reports.count ?? 0).toLocaleString() },
      ].map((k) => (
        <div key={k.label} className="px-4">
          <p className="text-xl font-extrabold leading-none tabular-nums text-text">{k.value}</p>
          <p className="mt-1 whitespace-nowrap text-xs font-medium text-muted">{k.label}</p>
        </div>
      ))}
    </div>
  )
}

function HeaderKpisSkeleton() {
  return (
    <div className="flex divide-x divide-border/60 rounded-2xl border border-border bg-surface px-1 py-2.5 shadow-sm">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="px-4">
          <div className="h-5 w-12 animate-pulse rounded bg-surface-elevated" />
          <div className="mt-1.5 h-3 w-16 animate-pulse rounded bg-surface-elevated/70" />
        </div>
      ))}
    </div>
  )
}

function DashSkeleton({ title }: { title: string }) {
  return (
    <DashSection title={title}>
      <div className="space-y-2.5">
        <div className="h-4 w-2/3 animate-pulse rounded bg-surface-elevated" />
        <div className="h-4 w-1/2 animate-pulse rounded bg-surface-elevated" />
        <div className="h-10 animate-pulse rounded-xl bg-surface-elevated/70" />
      </div>
    </DashSection>
  )
}

// ── Structure — the shape of the live site. ──────────────────────────────────────
async function StructureSection() {
  const admin = createAdminClient()
  const nowIso = new Date().toISOString()

  const [circles, channels, events, hubs, nexuses, dispatches] = await Promise.all([
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
  ])

  return (
    <DashSection
      title="Structure"
      description="The shape of the live site — circles, channels, events, and the regions and broadcasts that reach them."
    >
      <StatRow>
        <StatItem value={(circles.count ?? 0).toLocaleString()} label="Active circles" href="/admin/circles" />
        <StatItem value={(channels.count ?? 0).toLocaleString()} label="Channels" href="/admin/channels" />
        <StatItem value={(events.count ?? 0).toLocaleString()} label="Upcoming events" href="/admin/events" />
        <StatItem value={(hubs.count ?? 0).toLocaleString()} label="Hubs" href="/admin/hubs" />
        <StatItem value={(nexuses.count ?? 0).toLocaleString()} label="Nexuses" href="/admin/nexuses" />
        <StatItem value={(dispatches.count ?? 0).toLocaleString()} label="Broadcasts" href="/admin/dispatches" />
      </StatRow>
    </DashSection>
  )
}

// ── People & access — who's here, the staff team, and the verify queue. ──────────
async function PeopleSection() {
  const admin = createAdminClient()

  const [members, team, pendingPersonas] = await Promise.all([
    admin.from('memberships').select('id', { count: 'exact', head: true }).eq('status', 'active'),
    admin.from('team_members').select('id', { count: 'exact', head: true }),
    // profile_personas isn't in the generated types yet (repo convention: untyped cast).
    // A `claimed` persona is pending the staff verify queue (lib/personas.ts).
    (admin as unknown as SupabaseClient)
      .from('profile_personas')
      .select('id', { count: 'exact', head: true })
      .eq('state', 'claimed'),
  ])

  const verifyQueue = pendingPersonas.count ?? 0

  return (
    <DashSection
      title="People & access"
      description="Active members, the staff team, and partners waiting on verification."
    >
      <StatRow>
        <StatItem value={(members.count ?? 0).toLocaleString()} label="Active members" href="/admin/members" />
        <StatItem value={(team.count ?? 0).toLocaleString()} label="Team members" href="/admin/roles" />
        <StatItem
          value={verifyQueue.toLocaleString()}
          label="Verify queue"
          deltaTone={verifyQueue > 0 ? 'bad' : 'neutral'}
          delta={verifyQueue > 0 ? 'awaiting verification' : undefined}
          href="/admin/personas"
        />
      </StatRow>
    </DashSection>
  )
}

// ── Trust & safety — the live moderation + support queue. ────────────────────────
async function TrustSafetySection() {
  const admin = createAdminClient()
  const weekAgo = new Date(new Date().getTime() - 7 * DAY).toISOString()

  const [openReports, recentModeration, ticketCounts] = await Promise.all([
    admin.from('reports').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    admin.from('admin_audit_log').select('id', { count: 'exact', head: true }).gte('created_at', weekAgo),
    ticketStatusCounts(),
  ])

  const openTickets = Object.entries(ticketCounts).reduce(
    (sum, [status, n]) => (isOpenStatus(status as never) ? sum + n : sum),
    0,
  )
  const reportsOpen = openReports.count ?? 0

  return (
    <DashSection
      title="Trust & safety"
      description="The live queue — open reports, support tickets, and recent moderation."
    >
      <StatRow>
        <StatItem
          value={reportsOpen.toLocaleString()}
          label="Open reports"
          deltaTone={reportsOpen > 0 ? 'bad' : 'neutral'}
          delta={reportsOpen > 0 ? 'needs attention' : undefined}
          href="/admin/moderation"
        />
        <StatItem
          value={openTickets.toLocaleString()}
          label="Open tickets"
          deltaTone={openTickets > 0 ? 'bad' : 'neutral'}
          delta={openTickets > 0 ? 'needs attention' : undefined}
          href="/admin/support"
        />
        <StatItem value={(recentModeration.count ?? 0).toLocaleString()} label="Mod actions · 7d" href="/admin/audit" />
      </StatRow>
    </DashSection>
  )
}
