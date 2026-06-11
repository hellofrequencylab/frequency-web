import { Suspense } from 'react'
import { SlidersHorizontal } from 'lucide-react'
import { requireAdmin } from '@/lib/admin/guard'
import { AdminPage, AdminSection } from '@/components/admin/admin-page'
import { DashSection, StatRow, StatItem } from '@/components/admin/dash'
import { AdminAreaSections } from '@/components/admin/admin-area-grid'
import { groupSections } from '../sections'
import { createAdminClient } from '@/lib/supabase/admin'
import { aiEnabledFlag, demoContentExists } from '@/lib/platform-flags'

// Operations — "the platform machine." The domain dashboard for the system layer:
// the AI/assistant controls, content infrastructure (pages), commerce switches, and
// the security trail. Community, people, and trust & safety now live in their own
// Community domain. Gate: janitor / platform staff (everything here is sensitive);
// each linked area keeps its own gate. KPI strip up top, described sections backed by
// REAL counts, then the area map. Heavier sweeps sit behind <Suspense> (§5).

const DAY = 24 * 60 * 60 * 1000

export default async function OperationsDashboard() {
  const { role, webRole, staffRole } = await requireAdmin('janitor', { staff: 'platform' })
  const sections = groupSections('operations', role, webRole, staffRole)

  return (
    <AdminPage
      title="Operations"
      eyebrow="Domain"
      icon={SlidersHorizontal}
      description="The platform machine. AI, content infrastructure, commerce, and the system trail."
      actions={
        <Suspense fallback={<HeaderKpisSkeleton />}>
          <HeaderKpis />
        </Suspense>
      }
    >
      <Suspense fallback={<DashSkeleton title="AI & assistant" />}>
        <AiSection />
      </Suspense>

      <Suspense fallback={<DashSkeleton title="Platform" />}>
        <PlatformSection />
      </Suspense>

      <AdminSection title="All areas" description="Everything in Operations you can manage.">
        <AdminAreaSections sections={sections} />
      </AdminSection>
    </AdminPage>
  )
}

// ── Header KPI strip — the system layer at a glance. ─────────────────────────────
async function HeaderKpis() {
  const admin = createAdminClient()
  const weekAgo = new Date(new Date().getTime() - 7 * DAY).toISOString()

  const [pages, auditEntries, aiOn, hasDemo] = await Promise.all([
    admin.from('pages').select('id', { count: 'exact', head: true }),
    admin.from('admin_audit_log').select('id', { count: 'exact', head: true }).gte('created_at', weekAgo),
    aiEnabledFlag(),
    demoContentExists(),
  ])

  return (
    <div className="flex divide-x divide-border/60 rounded-2xl border border-border bg-surface px-1 py-2.5 shadow-sm">
      {[
        { label: 'AI', value: aiOn ? 'On' : 'Off' },
        { label: 'Pages', value: (pages.count ?? 0).toLocaleString() },
        { label: 'Audit · 7d', value: (auditEntries.count ?? 0).toLocaleString() },
        { label: 'Demo content', value: hasDemo ? 'Present' : 'None' },
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

// ── AI & assistant — the master switch, pending agent actions, and Vera. ─────────
async function AiSection() {
  const admin = createAdminClient()

  const [aiOn, pendingActions, deflected7d] = await Promise.all([
    aiEnabledFlag(),
    admin.from('agent_actions').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    admin
      .from('ai_help_queries')
      .select('id', { count: 'exact', head: true })
      .eq('deflected', true)
      .gte('created_at', new Date(new Date().getTime() - 7 * DAY).toISOString()),
  ])

  const actionsPending = pendingActions.count ?? 0
  const gaps = deflected7d.count ?? 0

  return (
    <DashSection
      title="AI & assistant"
      description="The AI master switch, the agent actions awaiting review, and the help gaps Vera couldn't answer."
    >
      <StatRow>
        <StatItem value={aiOn ? 'On' : 'Off'} label="AI controls" href="/admin/ai" />
        <StatItem
          value={actionsPending.toLocaleString()}
          label="AI actions · pending"
          deltaTone={actionsPending > 0 ? 'bad' : 'neutral'}
          delta={actionsPending > 0 ? 'awaiting review' : undefined}
          href="/admin/studio"
        />
        <StatItem
          value={gaps.toLocaleString()}
          label="Help gaps · 7d"
          deltaTone={gaps > 0 ? 'bad' : 'neutral'}
          delta={gaps > 0 ? 'articles to write' : undefined}
          href="/admin/help-gaps"
        />
        <StatItem value="Tune" label="Vera config" href="/admin/vera" />
      </StatRow>
    </DashSection>
  )
}

// ── Platform — content infrastructure, commerce, the trail, and demo content. ────
async function PlatformSection() {
  const admin = createAdminClient()
  const weekAgo = new Date(new Date().getTime() - 7 * DAY).toISOString()

  const [pages, auditEntries, hasDemo] = await Promise.all([
    admin.from('pages').select('id', { count: 'exact', head: true }),
    admin.from('admin_audit_log').select('id', { count: 'exact', head: true }).gte('created_at', weekAgo),
    demoContentExists(),
  ])

  return (
    <DashSection
      title="Platform"
      description="The platform keys — published pages, payouts, the audit trail, and whether demo content is present."
    >
      <StatRow>
        <StatItem value={(pages.count ?? 0).toLocaleString()} label="Pages" href="/pages" />
        <StatItem value="Payouts" label="Payments" href="/admin/payments" />
        <StatItem value={(auditEntries.count ?? 0).toLocaleString()} label="Audit log · 7d" href="/admin/audit" />
        <StatItem value={hasDemo ? 'Present' : 'None'} label="Demo content" href="/admin/demo" />
      </StatRow>
    </DashSection>
  )
}
