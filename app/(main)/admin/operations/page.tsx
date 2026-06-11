import { Suspense } from 'react'
import { SlidersHorizontal } from 'lucide-react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/admin/guard'
import { AdminPage, AdminSection } from '@/components/admin/admin-page'
import { DashSection, StatRow, StatItem } from '@/components/admin/dash'
import { AdminAreaSections } from '@/components/admin/admin-area-grid'
import { groupSections } from '../sections'
import { createAdminClient } from '@/lib/supabase/admin'
import { ticketStatusCounts } from '@/lib/support/store'
import { isOpenStatus } from '@/lib/support/types'
import { aiEnabledFlag, demoContentExists } from '@/lib/platform-flags'

// Operations — "run the site." Restyled onto the ADR-228 dashboard card grammar
// (mirroring the admin HOME dashboard): a header KPI strip up top (one white,
// value-first strip), then described sections — Community · People · Trust &
// safety · System — each a WHITE DashSection card holding a StatRow of value-first
// StatItems backed by REAL admin head-counts, every drill-down href preserved. The
// "Areas of focus" navigation map stays at the bottom. Gate: host+ floor (community
// staff); each linked area keeps its own (often janitor) gate. Heavier per-section
// sweeps sit behind their own <Suspense> so the shell never blocks (PAGE-FRAMEWORK §5).

const DAY = 24 * 60 * 60 * 1000

export default async function OperationsDashboard() {
  const { role, webRole, staffRole } = await requireAdmin('host', { staff: 'community' })
  const sections = groupSections('operations', role, webRole, staffRole)

  return (
    <AdminPage
      title="Operations"
      eyebrow="Domain"
      icon={SlidersHorizontal}
      description="Run the site. Community, people, trust and safety, and the platform keys."
      actions={
        <Suspense fallback={<HeaderKpisSkeleton />}>
          <HeaderKpis />
        </Suspense>
      }
    >
      <Suspense fallback={<DashSkeleton title="Community" />}>
        <CommunitySection />
      </Suspense>

      <Suspense fallback={<DashSkeleton title="People" />}>
        <PeopleSection />
      </Suspense>

      <Suspense fallback={<DashSkeleton title="Trust & safety" />}>
        <TrustSafetySection />
      </Suspense>

      <Suspense fallback={<DashSkeleton title="System" />}>
        <SystemSection />
      </Suspense>

      <AdminSection title="All areas" description="Everything in Operations you can manage.">
        <AdminAreaSections sections={sections} />
      </AdminSection>
    </AdminPage>
  )
}

// ── Header KPI strip — the four numbers that frame the domain at a glance.
// One white, value-first strip (mirrors the admin HOME header). ────────────────────
async function HeaderKpis() {
  const admin = createAdminClient()
  const nowIso = new Date().toISOString()

  const [circles, channels, events, reports] = await Promise.all([
    admin.from('circles').select('id', { count: 'exact', head: true }).eq('status', 'active'),
    admin.from('channels').select('id', { count: 'exact', head: true }),
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
        { label: 'Circles', value: (circles.count ?? 0).toLocaleString() },
        { label: 'Channels', value: (channels.count ?? 0).toLocaleString() },
        { label: 'Events', value: (events.count ?? 0).toLocaleString() },
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

// Suspense fallback — a white section card with pulsing content (mirrors HOME).
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

// ── Community — the structure of the live site. ──────────────────────────────────
async function CommunitySection() {
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
      title="Community"
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

// ── People — who's here and the partner-verification queue. ──────────────────────
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
      title="People"
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

// ── Trust & safety — the live moderation + support queue + the AI kill switch. ───
async function TrustSafetySection() {
  const admin = createAdminClient()
  const weekAgo = new Date(new Date().getTime() - 7 * DAY).toISOString()

  const [openReports, pendingActions, recentModeration, ticketCounts, aiOn] = await Promise.all([
    admin.from('reports').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    admin.from('agent_actions').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    admin.from('admin_audit_log').select('id', { count: 'exact', head: true }).gte('created_at', weekAgo),
    ticketStatusCounts(),
    aiEnabledFlag(),
  ])

  const openTickets = Object.entries(ticketCounts).reduce(
    (sum, [status, n]) => (isOpenStatus(status as never) ? sum + n : sum),
    0,
  )
  const reportsOpen = openReports.count ?? 0
  const actionsPending = pendingActions.count ?? 0

  return (
    <DashSection
      title="Trust & safety"
      description="The live queue — open reports, support tickets, pending AI actions, recent moderation, and the AI master switch."
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
        <StatItem
          value={actionsPending.toLocaleString()}
          label="AI actions · pending"
          deltaTone={actionsPending > 0 ? 'bad' : 'neutral'}
          delta={actionsPending > 0 ? 'awaiting review' : undefined}
          href="/admin/studio"
        />
        <StatItem value={(recentModeration.count ?? 0).toLocaleString()} label="Mod actions · 7d" href="/admin/audit" />
        <StatItem value={aiOn ? 'On' : 'Off'} label="AI controls" href="/admin/ai" />
      </StatRow>
    </DashSection>
  )
}

// ── System — the platform keys: content, codes, audit trail, demo content. ───────
async function SystemSection() {
  const admin = createAdminClient()
  const weekAgo = new Date(new Date().getTime() - 7 * DAY).toISOString()

  const [pages, codes, auditEntries, hasDemo] = await Promise.all([
    admin.from('pages').select('id', { count: 'exact', head: true }),
    admin.from('qr_codes').select('id', { count: 'exact', head: true }).eq('active', true),
    admin.from('admin_audit_log').select('id', { count: 'exact', head: true }).gte('created_at', weekAgo),
    demoContentExists(),
  ])

  return (
    <DashSection
      title="System"
      description="The platform keys — published pages, live QR codes, the audit trail, and whether demo content is present."
    >
      <StatRow>
        <StatItem value={(pages.count ?? 0).toLocaleString()} label="Pages" href="/admin/content" />
        <StatItem value={(codes.count ?? 0).toLocaleString()} label="Active QR codes" href="/admin/qr" />
        <StatItem value={(auditEntries.count ?? 0).toLocaleString()} label="Audit log · 7d" href="/admin/audit" />
        <StatItem value={hasDemo ? 'Present' : 'None'} label="Demo content" href="/admin/demo" />
      </StatRow>
    </DashSection>
  )
}
