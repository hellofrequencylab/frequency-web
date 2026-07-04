import { TrendingUp } from 'lucide-react'
import { DashArea, TileGrid, Tile, GraphTile, MiniStat, MiniGrid } from '@/components/admin/dash'
import { WeekBars, weeklyBuckets } from '@/components/admin/spark-charts'
import { AttentionList, type AttentionItem } from '@/components/admin/attention-list'
import { getDeals, computeMetrics, countOpenTasks, formatMoney } from '@/lib/crm/pipeline'

// Growth layout module (LP7): "Pipeline" — open deals, their value, and the follow-ups due so nothing
// stalls. Self-fetching RSC; the page owns the marketing-staff gate, so this never re-gates. Fail-safe:
// any read error degrades to a calm zero row rather than a crash. Semantic tokens + DashArea grammar only.

interface PipelineData {
  metrics: ReturnType<typeof computeMetrics>
  dealSeries: number[]
}

// Empty metrics computed off no deals, so the shape can never drift from computeMetrics.
const EMPTY: PipelineData = { metrics: computeMetrics([], 0), dealSeries: [] }

async function load(): Promise<PipelineData> {
  try {
    const [deals, tasksDue] = await Promise.all([getDeals(), countOpenTasks()])
    return {
      metrics: computeMetrics(deals, tasksDue),
      dealSeries: weeklyBuckets(
        deals.map((d) => new Date(d.created_at)),
        8,
        new Date(),
      ),
    }
  } catch {
    return EMPTY
  }
}

export async function GrowthPipeline() {
  const { metrics, dealSeries } = await load()

  // The domain attention spine — only actionable items, ranked by what's waiting.
  const attention: AttentionItem[] = []
  if (metrics.tasksDue > 0) {
    attention.push({
      id: 'followups',
      severity: metrics.tasksDue > 5 ? 'risk' : 'watch',
      title: `${metrics.tasksDue} follow-up${metrics.tasksDue === 1 ? '' : 's'} due`,
      finding: 'Open CRM tasks waiting so deals do not stall.',
      action: { label: 'Open CRM', href: '/admin/crm/contacts' },
    })
  }

  return (
    <DashArea
      icon={TrendingUp}
      label="Pipeline"
      blurb="Open deals, their value, and the follow-ups due so nothing stalls."
      href="/admin/crm/contacts"
      hrefLabel="Open CRM"
    >
      <TileGrid>
        <Tile label="Pipeline">
          <MiniGrid>
            <MiniStat value={metrics.openCount.toLocaleString()} label="Open deals" />
            <MiniStat value={formatMoney(metrics.openValue)} label="Open value" />
            <MiniStat value={metrics.winRatePct === null ? '—' : `${metrics.winRatePct}%`} label="Win rate" />
            <MiniStat
              value={metrics.tasksDue.toLocaleString()}
              label="Follow-ups due"
              tone={metrics.tasksDue > 0 ? 'bad' : 'neutral'}
            />
          </MiniGrid>
        </Tile>
        <GraphTile
          label="New deals / wk"
          value={dealSeries.reduce((a, b) => a + b, 0).toLocaleString()}
          caption="8 weeks · current highlighted"
        >
          <WeekBars values={dealSeries} height={64} />
        </GraphTile>
        {attention.length > 0 && (
          <Tile label="Needs attention">
            <AttentionList items={attention} />
          </Tile>
        )}
      </TileGrid>
    </DashArea>
  )
}
