import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Briefcase, DollarSign, Trophy, Percent, CheckSquare, Plus } from 'lucide-react'
import { getCallerProfile } from '@/lib/auth'
import { atLeastRole } from '@/lib/core/roles'
import { canUseSurface } from '@/lib/core/viewer-hats'
import { AdminTemplate, AdminSection } from '@/components/templates'
import { StatCard } from '@/components/ui/stat-card'
import { TableSkeleton } from '@/components/admin/table-skeleton'
import { getStages, getDeals, countOpenTasks, computeMetrics, formatMoney } from '@/lib/crm/pipeline'
import { PipelineBoard } from './pipeline-board'

export const dynamic = 'force-dynamic'

// The unified CRM suite (ADR-102). Pipeline: a KPI row on the canvas above a stage
// board of deals. Open to stewards (host+) OR a Business/Organization partner persona
// (the matrix's Business-CRM surface, P3.2) — additive, so claiming a partner program
// unlocks it. The board's data read sits behind its own Suspense so the shell never
// blocks (ADR-233 §5).
export default async function CrmPage() {
  const caller = await getCallerProfile()
  const allowed = (!!caller && atLeastRole(caller.community_role, 'host')) || (await canUseSurface('businessCrm'))
  if (!allowed) redirect('/feed')

  return (
    <AdminTemplate
      eyebrow="CRM"
      title="Pipeline"
      description="Your sales pipeline over the unified contact book. Track opportunities from first touch to won, with tasks and analytics."
      width="wide"
      actions={
        // TODO(ADR-228): link-button — Button is a <button>; no styled-Link API yet.
        <Link
          href="/admin/crm/deals/new"
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover"
        >
          <Plus className="h-4 w-4" aria-hidden /> New deal
        </Link>
      }
    >
      <Suspense fallback={<PipelineSkeleton />}>
        <PipelineBody />
      </Suspense>
    </AdminTemplate>
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
