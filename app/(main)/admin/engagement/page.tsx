import { Suspense } from 'react'
import { Activity, Users, Flame, TrendingUp } from 'lucide-react'
import { requireAdmin } from '@/lib/admin/guard'
import { AdminTemplate, AdminSection } from '@/components/templates'
import { StatCard } from '@/components/ui/stat-card'
import { DashArea, TileGrid, Tile } from '@/components/admin/dash'
import { DataTable, type ColumnDef } from '@/components/admin/data-table'
import { TableSkeleton } from '@/components/admin/table-skeleton'
import { FreshnessNote } from '@/components/admin/freshness-note'
import { RankList } from '@/components/admin/rank-list'
import { StatusChip } from '@/components/admin/status'
import { EmptyState } from '@/components/ui/empty-state'
import { getEngagementDashboard, type FunnelStep, type EventTypeCount } from '@/lib/analytics/dashboard'

// Janitor-only: the live engagement dashboard (ENGAGEMENT-MARKETING-ENGINE.md Phase B).
// WAM + activation, the activation funnel (where it jams), what's happening in the
// ledger, and the most-used pages + features. Reads first-party aggregates only.
// Analytics (ADR-233 §3): StatCard KPIs + a DataTable for the event ledger; the heavy
// aggregate sits behind one Suspense boundary so the shell never blocks.
export const dynamic = 'force-dynamic'

const WINDOW_DAYS = 30
const pct = (n: number) => `${Math.round(n * 100)}%`

export default async function EngagementDashboardPage() {
  await requireAdmin('janitor', { staff: 'insights', staffLevel: 'read' })

  return (
    <AdminTemplate
      title="Engagement"
      eyebrow="Insights"
      icon={Activity}
      description={`Live first-party signal over the last ${WINDOW_DAYS} days.`}
      width="wide"
    >
      <Suspense fallback={<EngagementSkeleton />}>
        <EngagementContent />
      </Suspense>
    </AdminTemplate>
  )
}

async function EngagementContent() {
  const d = await getEngagementDashboard(WINDOW_DAYS)

  const byTypeColumns: ColumnDef<EventTypeCount>[] = [
    { key: 'eventType', header: 'Event', render: (r) => <span className="font-mono text-xs text-text">{r.eventType}</span> },
    { key: 'events', header: 'Events', type: 'number', render: (r) => r.events.toLocaleString() },
    { key: 'actors', header: 'Members', type: 'number', render: (r) => r.actors.toLocaleString() },
  ]

  return (
    <>
      <AdminSection>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Weekly active" value={d.practice.wam} icon={Users} href="/admin/intel" />
          <StatCard label="Verified · 7d" value={d.practice.verifiedThisWeek} icon={Flame} />
          <StatCard label="New · 30d" value={d.practice.newMembers} icon={TrendingUp} />
          <StatCard label="Activation" value={pct(d.practice.activationRate)} icon={TrendingUp} />
        </div>
      </AdminSection>

      <DashArea
        icon={Activity}
        label="Where members drop off"
        blurb="Distinct members reaching each step. The drop tells you where to focus: new-member activation runs induction to a first verified practice; the broader funnel fills in as page and feature events accrue."
        footnote={<FreshnessNote at={new Date()} label="Computed" />}
      >
        <TileGrid>
          <Tile label="New-member activation" span={3} caption="Induction → Vera → first circle → first practice.">
            <FunnelView steps={d.activationFunnel} />
          </Tile>
          <Tile label="Engagement funnel" span={3} caption="Distinct members reaching each broad step across the app.">
            <FunnelView steps={d.funnel} />
          </Tile>
        </TileGrid>
      </DashArea>

      <AdminSection title="Activity by type" description="Event volume and the distinct members behind it, this window.">
        <DataTable
          rows={d.byType}
          getRowId={(r) => r.eventType}
          columns={byTypeColumns}
          caption="Event volume by type."
          empty={<EmptyState variant="first-use" icon={Activity} title="No events yet in this window" description="Activity shows up here as members move through the app." />}
        />
      </AdminSection>

      <AdminSection title="Most-used surfaces" description="The pages and features carrying the most traffic this window.">
        <div className="grid gap-3.5 lg:grid-cols-2">
          <Tile label="Top pages">
            <RankList items={d.topPages} empty="No page views yet." />
          </Tile>
          <Tile label="Top features">
            <RankList items={d.topFeatures} empty="No feature events yet." />
          </Tile>
        </div>
      </AdminSection>
    </>
  )
}

function FunnelView({ steps }: { steps: FunnelStep[] }) {
  const top = steps[0]?.actors ?? 0
  if (steps.length === 0) {
    return <p className="text-sm text-muted">No funnel signal yet in this window.</p>
  }
  return (
    <div className="space-y-2.5">
      {steps.map((s) => {
        const width = top > 0 ? Math.round((s.actors / top) * 100) : 0
        return (
          <div key={s.eventType}>
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="truncate text-text">{s.step}</span>
              <span className="flex shrink-0 items-center gap-2">
                {s.dropPct !== null && s.dropPct > 0 && (
                  <StatusChip tone="danger" size="sm">−{s.dropPct}%</StatusChip>
                )}
                <span className="font-semibold tabular-nums text-text">{s.actors.toLocaleString()}</span>
              </span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-elevated">
              <div className="h-full rounded-full bg-primary" style={{ width: `${width}%` }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}


function EngagementSkeleton() {
  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-20 animate-pulse rounded-2xl bg-surface-elevated/70" />
        ))}
      </div>
      <TableSkeleton rows={6} cols={3} />
    </>
  )
}
