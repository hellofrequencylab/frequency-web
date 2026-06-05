import { redirect } from 'next/navigation'
import { Briefcase, DollarSign, Trophy, Percent, CheckSquare } from 'lucide-react'
import { getCallerProfile } from '@/lib/auth'
import { atLeastRole } from '@/lib/core/roles'
import { DashboardTemplate } from '@/components/templates'
import { StatCard } from '@/components/ui/stat-card'
import { getStages, getDeals, countOpenTasks, computeMetrics, formatMoney } from '@/lib/crm/pipeline'
import { CrmTabs } from './crm-tabs'
import { PipelineBoard } from './pipeline-board'

export const dynamic = 'force-dynamic'

// The unified CRM suite (ADR-102). Pipeline tab: KPI row + a stage board of deals.
// Gated to stewards (host+), same as the Contacts tab.
export default async function CrmPage() {
  const caller = await getCallerProfile()
  if (!caller || !atLeastRole(caller.community_role, 'host')) redirect('/feed')

  const [stages, deals, tasksDue] = await Promise.all([getStages(), getDeals(), countOpenTasks()])
  const metrics = computeMetrics(deals, tasksDue)

  return (
    <DashboardTemplate
      eyebrow="CRM"
      title="Pipeline"
      description="Your sales pipeline over the unified contact book — track opportunities from first touch to won, with tasks and analytics."
      width="wide"
    >
      <CrmTabs />

      {/* Analytics — pipeline KPIs */}
      <div className="-mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard label="Open deals" value={metrics.openCount.toLocaleString()} icon={Briefcase} />
        <StatCard label="Open pipeline" value={formatMoney(metrics.openValue)} icon={DollarSign} />
        <StatCard label="Won" value={formatMoney(metrics.wonValue)} icon={Trophy} />
        <StatCard label="Win rate" value={metrics.winRatePct === null ? '—' : `${metrics.winRatePct}%`} icon={Percent} />
        <StatCard label="Tasks due" value={metrics.tasksDue.toLocaleString()} icon={CheckSquare} />
      </div>

      <PipelineBoard stages={stages} deals={deals} />
    </DashboardTemplate>
  )
}
