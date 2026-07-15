import Link from 'next/link'
import { Plus, GitBranch, Users, ArrowUpCircle, HeartHandshake, CircleDollarSign } from 'lucide-react'
import { requireAdmin } from '@/lib/admin/guard'
import { AdminTemplate, AdminSection } from '@/components/templates'
import { StatCard } from '@/components/ui/stat-card'
import { Button } from '@/components/ui/button'
import { getStages, getDeals, countOpenTasks, computeMetrics, formatMoney, ensurePlatformPipeline } from '@/lib/crm/pipeline'
import { loadRootSpaceId } from '@/lib/spaces/store'
import { PipelineBoard } from '../pipeline-board'

// The platform Pipeline (renamed from Deals). ONE operator pipeline for the platform team's own growth
// motion: upselling members onto a Business Space, and turning members into donors. The board keeps the
// stage-column kanban; a deal's lane rides `crm_deals.source` so the board can filter by lane. Gated
// janitor to match the rest of the Resonance CRM domain. The /admin/* group mounts its own info rail
// (page-chrome 'none'), so no rail registration here. Reads run together up front, each fail-safe to
// empty, so the board degrades to a calm empty state and never crashes. Semantic tokens only; copy in
// voice (no em or en dashes).

export const dynamic = 'force-dynamic'

export default async function PipelinePage() {
  await requireAdmin('janitor')

  // Scope the platform board to the platform's own (root) Space, and seed its funnel once. Fail-safe: a
  // missing root id degrades to the unscoped read (exactly the pre-rescope behavior), never a crash.
  const rootId = (await loadRootSpaceId()) ?? undefined
  if (rootId) await ensurePlatformPipeline(rootId)

  const [stages, deals, tasksDue] = await Promise.all([getStages(rootId), getDeals(rootId), countOpenTasks(rootId)])
  const metrics = computeMetrics(deals, tasksDue)

  return (
    <AdminTemplate
      title="Pipeline"
      eyebrow="CRM"
      icon={GitBranch}
      description="Members worth an upsell onto a Business Space, and members you are asking to give. Move a card forward as it advances, or start a new one."
      width="wide"
    >
      <AdminSection>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            label="Members in pipeline"
            value={metrics.openCount}
            icon={Users}
            detail={`${metrics.businessOpen} business · ${metrics.donationOpen} giving`}
          />
          <StatCard
            label="Upgrades this month"
            value={metrics.upgradesThisMonth}
            icon={ArrowUpCircle}
            detail="members went Business"
          />
          <StatCard
            label="Recurring donors"
            value={metrics.recurringDonors}
            icon={HeartHandshake}
            detail="giving on a rhythm"
          />
          <StatCard
            label="Open value"
            value={formatMoney(metrics.openValue)}
            icon={CircleDollarSign}
            detail={`${metrics.openCount} open ${metrics.openCount === 1 ? 'card' : 'cards'}`}
          />
        </div>
      </AdminSection>

      <AdminSection
        title="Board"
        description="Filter by lane, move a card between stages, or open one for the full record."
      >
        <div className="mb-3 flex justify-end">
          <Button asChild size="sm">
            <Link href="/admin/crm/pipeline/new">
              <Plus className="h-4 w-4" /> New card
            </Link>
          </Button>
        </div>
        <PipelineBoard stages={stages} deals={deals} />
      </AdminSection>
    </AdminTemplate>
  )
}
