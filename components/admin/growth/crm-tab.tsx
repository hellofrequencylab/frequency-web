import { Suspense } from 'react'
import Link from 'next/link'
import { Briefcase, DollarSign, Trophy, Percent, CheckSquare, Plus } from 'lucide-react'
import { AdminSection } from '@/components/templates'
import { StatCard } from '@/components/ui/stat-card'
import { TableSkeleton } from '@/components/admin/table-skeleton'
import { getStages, getDeals, countOpenTasks, computeMetrics, formatMoney } from '@/lib/crm/pipeline'
import { PipelineBoard } from '@/app/(main)/admin/crm/pipeline-board'

// The "CRM" tab of the consolidated Growth workspace (ADR-264) — formerly /admin/crm.
// The deal pipeline: a KPI row above a stage board. Entry is gated by the Growth
// workspace page; the deal lifecycle pages (/admin/crm/deals/*, /admin/crm/contacts)
// survive as sub-routes. The board's read sits behind its own Suspense (PAGE-FRAMEWORK §5).
export function CrmTab() {
  return (
    <>
      <div className="mb-4 flex justify-end">
        <Link
          href="/admin/crm/deals/new"
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover"
        >
          <Plus className="h-4 w-4" aria-hidden /> New deal
        </Link>
      </div>
      <Suspense fallback={<PipelineSkeleton />}>
        <PipelineBody />
      </Suspense>
    </>
  )
}

// The live pipeline — KPI row + board — read in one parallel sweep behind Suspense.
async function PipelineBody() {
  const [stages, deals, tasksDue] = await Promise.all([getStages(), getDeals(), countOpenTasks()])
  const metrics = computeMetrics(deals, tasksDue)

  return (
    <>
      <AdminSection title="At a glance">
        <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-5">
          <StatCard label="Open deals" value={metrics.openCount.toLocaleString()} icon={Briefcase} />
          <StatCard label="Open pipeline" value={formatMoney(metrics.openValue)} icon={DollarSign} />
          <StatCard label="Won" value={formatMoney(metrics.wonValue)} icon={Trophy} />
          <StatCard label="Win rate" value={metrics.winRatePct === null ? '–' : `${metrics.winRatePct}%`} icon={Percent} />
          <StatCard label="Tasks due" value={metrics.tasksDue.toLocaleString()} icon={CheckSquare} />
        </div>
      </AdminSection>

      <AdminSection title="Pipeline board" description="Move a deal between stages, or open it for the full record.">
        <PipelineBoard stages={stages} deals={deals} />
      </AdminSection>
    </>
  )
}

function PipelineSkeleton() {
  return (
    <>
      <AdminSection title="At a glance">
        <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-5" aria-hidden>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl bg-surface-elevated/70" />
          ))}
        </div>
      </AdminSection>
      <AdminSection title="Pipeline board">
        <TableSkeleton rows={4} cols={4} />
      </AdminSection>
    </>
  )
}
