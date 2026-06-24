import Link from 'next/link'
import { Plus, Briefcase, CircleDollarSign, Trophy, Percent } from 'lucide-react'
import { requireAdmin } from '@/lib/admin/guard'
import { AdminTemplate, AdminSection } from '@/components/templates'
import { StatCard } from '@/components/ui/stat-card'
import { Button } from '@/components/ui/button'
import { getStages, getDeals, countOpenTasks, computeMetrics, formatMoney } from '@/lib/crm/pipeline'
import { PipelineBoard } from '../pipeline-board'

// The Deals board, given its own home (ADMIN-BUILD-PLAN Phase 1). The board component already
// existed but was orphaned (only "New deal" was reachable from nav); this page surfaces it under
// CRM. Gated janitor to match the rest of the Resonance CRM domain (the cockpit gates the same way).
// The /admin/* group mounts its own info rail (page-chrome 'none'), so no rail registration here.
// Speed: the three reads run together up front, each fail-safe to empty, so the board degrades to a
// calm empty state and never crashes. Semantic tokens only; copy in voice (no em or en dashes).

export const dynamic = 'force-dynamic'

export default async function DealsPipelinePage() {
  await requireAdmin('janitor')

  const [stages, deals, tasksDue] = await Promise.all([getStages(), getDeals(), countOpenTasks()])
  const metrics = computeMetrics(deals, tasksDue)

  return (
    <AdminTemplate
      title="Deals"
      eyebrow="CRM"
      icon={Briefcase}
      description="Your pipeline, by stage. Drag a card forward as a deal moves, or quick add a new one."
      width="wide"
    >
      <AdminSection>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            label="Open value"
            value={formatMoney(metrics.openValue)}
            icon={CircleDollarSign}
            detail={`${metrics.openCount} open ${metrics.openCount === 1 ? 'deal' : 'deals'}`}
          />
          <StatCard label="Won value" value={formatMoney(metrics.wonValue)} icon={Trophy} detail="closed won" />
          <StatCard
            label="Win rate"
            value={metrics.winRatePct === null ? '–' : `${metrics.winRatePct}%`}
            icon={Percent}
            detail={metrics.winRatePct === null ? 'no decided deals yet' : 'of decided deals'}
          />
          <StatCard label="Tasks due" value={metrics.tasksDue} icon={Plus} detail="open follow-ups" />
        </div>
      </AdminSection>

      <AdminSection
        title="Pipeline"
        description="Move a deal between stages, or open one for the full record."
      >
        <div className="mb-3 flex justify-end">
          <Button asChild size="sm">
            <Link href="/admin/crm/deals/new">
              <Plus className="h-4 w-4" /> New deal
            </Link>
          </Button>
        </div>
        <PipelineBoard stages={stages} deals={deals} />
      </AdminSection>
    </AdminTemplate>
  )
}
