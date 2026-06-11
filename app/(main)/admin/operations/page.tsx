import { Suspense } from 'react'
import {
  Users, CircleDot, CalendarDays, ShieldAlert, LifeBuoy, SlidersHorizontal,
  Layers, Building2, Radio, Hash, UserCog, BadgeCheck, Bot, ScrollText,
  FileText, QrCode, Sparkles, ClipboardList, type LucideIcon,
} from 'lucide-react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/admin/guard'
import { AdminPage, AdminSection } from '@/components/admin/admin-page'
import { StatCard } from '@/components/ui/stat-card'
import { AdminAreaSections } from '@/components/admin/admin-area-grid'
import { groupSections } from '../sections'
import { createAdminClient } from '@/lib/supabase/admin'
import { ticketStatusCounts } from '@/lib/support/store'
import { isOpenStatus } from '@/lib/support/types'
import { aiEnabledFlag, demoContentExists } from '@/lib/platform-flags'

// Operations — "run the site." Rebuilt (ADR-228 pattern, mirroring the admin HOME
// dashboard) into a sectioned operator dashboard: a header KPI strip up top, then
// described sections — Community · People · Trust & safety · System — each a row of
// drill-down StatCards backed by REAL admin head-counts. The "Areas of focus"
// navigation map stays at the bottom. Gate: host+ floor (community staff); each
// linked area keeps its own (often janitor) gate. Heavier per-section sweeps sit
// behind their own <Suspense> so the shell never blocks (PAGE-FRAMEWORK §5).

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
      <Suspense fallback={<SectionSkeleton title="Community" count={6} />}>
        <CommunitySection />
      </Suspense>

      <Suspense fallback={<SectionSkeleton title="People" count={3} />}>
        <PeopleSection />
      </Suspense>

      <Suspense fallback={<SectionSkeleton title="Trust & safety" count={5} />}>
        <TrustSafetySection />
      </Suspense>

      <Suspense fallback={<SectionSkeleton title="System" count={4} />}>
        <SystemSection />
      </Suspense>

      <AdminSection title="Areas of focus" description="Everything in Operations you can manage.">
        <AdminAreaSections sections={sections} />
      </AdminSection>
    </AdminPage>
  )
}

// ── Header KPI strip — the four numbers that frame the domain at a glance.
// Soft container, pronounced numbers (mirrors the admin HOME HeaderKpis). ─────────
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
    <HeaderKpiStrip
      items={[
        { label: 'Circles', value: (circles.count ?? 0).toLocaleString(), icon: CircleDot },
        { label: 'Channels', value: (channels.count ?? 0).toLocaleString(), icon: Hash },
        { label: 'Events', value: (events.count ?? 0).toLocaleString(), icon: CalendarDays },
        { label: 'Open reports', value: (reports.count ?? 0).toLocaleString(), icon: ShieldAlert },
      ]}
    />
  )
}

function HeaderKpiStrip({
  items,
}: {
  items: { label: string; value: React.ReactNode; icon: LucideIcon }[]
}) {
  return (
    <div className="flex flex-wrap items-stretch gap-0.5 rounded-2xl bg-surface-elevated/70 p-1">
      {items.map((k) => (
        <div key={k.label} className="min-w-[5.5rem] rounded-xl px-3.5 py-2">
          <span className="flex items-center gap-1 text-2xs font-semibold uppercase tracking-wide text-subtle">
            <k.icon className="h-3 w-3 shrink-0" aria-hidden />
            {k.label}
          </span>
          <span className="mt-0.5 block text-xl font-extrabold leading-none tabular-nums text-text">
            {k.value}
          </span>
        </div>
      ))}
    </div>
  )
}

function HeaderKpisSkeleton() {
  return (
    <div className="flex flex-wrap items-stretch gap-0.5 rounded-2xl bg-surface-elevated/70 p-1">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="h-14 min-w-[5.5rem] animate-pulse rounded-xl bg-surface-elevated/60" />
      ))}
    </div>
  )
}

// Titled row of pulsing tiles — the per-section Suspense fallback.
function SectionSkeleton({ title, count }: { title: string; count: number }) {
  return (
    <AdminSection title={title}>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="h-14 animate-pulse rounded-2xl bg-surface-elevated/60" />
        ))}
      </div>
    </AdminSection>
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
    <AdminSection
      title="Community"
      description="The shape of the live site — circles, channels, events, and the regions and broadcasts that reach them."
    >
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Active circles" value={(circles.count ?? 0).toLocaleString()} icon={CircleDot} href="/admin/circles" />
        <StatCard label="Channels" value={(channels.count ?? 0).toLocaleString()} icon={Hash} href="/admin/channels" />
        <StatCard label="Upcoming events" value={(events.count ?? 0).toLocaleString()} icon={CalendarDays} href="/admin/events" />
        <StatCard label="Hubs" value={(hubs.count ?? 0).toLocaleString()} icon={Building2} href="/admin/hubs" />
        <StatCard label="Nexuses" value={(nexuses.count ?? 0).toLocaleString()} icon={Layers} href="/admin/nexuses" />
        <StatCard label="Broadcasts" value={(dispatches.count ?? 0).toLocaleString()} icon={Radio} href="/admin/dispatches" />
      </div>
    </AdminSection>
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

  return (
    <AdminSection
      title="People"
      description="Active members, the staff team, and partners waiting on verification."
    >
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <StatCard label="Active members" value={(members.count ?? 0).toLocaleString()} icon={Users} href="/admin/members" />
        <StatCard label="Team members" value={(team.count ?? 0).toLocaleString()} icon={UserCog} href="/admin/roles" />
        <StatCard label="Verify queue" value={(pendingPersonas.count ?? 0).toLocaleString()} icon={BadgeCheck} href="/admin/personas" />
      </div>
    </AdminSection>
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

  return (
    <AdminSection
      title="Trust & safety"
      description="The live queue — open reports, support tickets, pending AI actions, recent moderation, and the AI master switch."
    >
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard label="Open reports" value={(openReports.count ?? 0).toLocaleString()} icon={ShieldAlert} href="/admin/moderation" />
        <StatCard label="Open tickets" value={openTickets.toLocaleString()} icon={LifeBuoy} href="/admin/support" />
        <StatCard label="AI actions · pending" value={(pendingActions.count ?? 0).toLocaleString()} icon={Bot} href="/admin/studio" />
        <StatCard label="Mod actions · 7d" value={(recentModeration.count ?? 0).toLocaleString()} icon={ScrollText} href="/admin/audit" />
        <StatCard label="AI controls" value={aiOn ? 'On' : 'Off'} icon={Sparkles} href="/admin/ai" />
      </div>
    </AdminSection>
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
    <AdminSection
      title="System"
      description="The platform keys — published pages, live QR codes, the audit trail, and whether demo content is present."
    >
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Pages" value={(pages.count ?? 0).toLocaleString()} icon={FileText} href="/admin/content" />
        <StatCard label="Active QR codes" value={(codes.count ?? 0).toLocaleString()} icon={QrCode} href="/admin/qr" />
        <StatCard label="Audit log · 7d" value={(auditEntries.count ?? 0).toLocaleString()} icon={ClipboardList} href="/admin/audit" />
        <StatCard label="Demo content" value={hasDemo ? 'Present' : 'None'} icon={SlidersHorizontal} href="/admin/demo" />
      </div>
    </AdminSection>
  )
}
