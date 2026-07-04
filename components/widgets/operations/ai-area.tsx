import { Bot } from 'lucide-react'
import { DashArea, TileGrid, Tile, GraphTile, MiniStat, MiniGrid } from '@/components/admin/dash'
import { WeekBars, weeklyBuckets } from '@/components/admin/spark-charts'
import { AttentionList, type AttentionItem } from '@/components/admin/attention-list'
import { FreshnessNote } from '@/components/admin/freshness-note'
import { createAdminClient } from '@/lib/supabase/admin'
import { aiEnabledFlag } from '@/lib/platform-flags'

// Operations layout module (LP7): "AI & assistant" — the AI master switch, the agent actions awaiting
// review, and the help gaps Vera couldn't answer. Self-fetching RSC; the page owns the janitor +
// platform-staff gate, so this never re-gates. Fail-safe: any read error degrades to a calm zero row
// rather than a crash. Assistant figures cover the last 7 days. Semantic tokens + DashArea grammar only.

const DAY = 24 * 60 * 60 * 1000
const WEEK = 7 * DAY
const VOLUME_WEEKS = 8

interface AiData {
  aiOn: boolean
  actionsPending: number
  total: number
  answered: number
  gaps: number
  qSeries: number[]
}

const EMPTY: AiData = { aiOn: false, actionsPending: 0, total: 0, answered: 0, gaps: 0, qSeries: [] }

async function load(): Promise<AiData> {
  try {
    const admin = createAdminClient()
    const nowMs = new Date().getTime()
    const weekAgo = new Date(nowMs - WEEK).toISOString()
    const volStart = new Date(nowMs - VOLUME_WEEKS * WEEK).toISOString()

    const [aiOn, pendingActions, queries7d, answered7d, deflected7d, qSeriesRes] = await Promise.all([
      aiEnabledFlag(),
      admin.from('agent_actions').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      admin.from('ai_help_queries').select('id', { count: 'exact', head: true }).gte('created_at', weekAgo),
      admin.from('ai_help_queries').select('id', { count: 'exact', head: true }).gte('created_at', weekAgo).eq('answered', true),
      admin.from('ai_help_queries').select('id', { count: 'exact', head: true }).gte('created_at', weekAgo).eq('deflected', true),
      admin.from('ai_help_queries').select('created_at').gte('created_at', volStart),
    ])

    return {
      aiOn,
      actionsPending: pendingActions.count ?? 0,
      total: queries7d.count ?? 0,
      answered: answered7d.count ?? 0,
      gaps: deflected7d.count ?? 0,
      qSeries: weeklyBuckets(
        ((qSeriesRes.data ?? []) as { created_at: string }[]).map((r) => new Date(r.created_at)),
        VOLUME_WEEKS,
      ),
    }
  } catch {
    return EMPTY
  }
}

export async function OperationsAi() {
  const { aiOn, actionsPending, total, answered, gaps, qSeries } = await load()
  const answeredRate = total > 0 ? Math.round((answered / total) * 100) : null
  const deflectedRate = total > 0 ? Math.round((gaps / total) * 100) : null

  // The domain attention spine — only actionable items, ranked by what's waiting.
  const attention: AttentionItem[] = []
  if (actionsPending > 0) {
    attention.push({
      id: 'studio-prompts',
      severity: actionsPending > 5 ? 'risk' : 'watch',
      title: `${actionsPending} AI ${actionsPending === 1 ? 'action' : 'actions'} awaiting review`,
      finding: 'The operator has proposals queued for your approval.',
      action: { label: 'Review', href: '/admin/vera-ai?tab=studio' },
    })
  }
  if (gaps > 0) {
    attention.push({
      id: 'help-gaps',
      severity: gaps > 10 ? 'risk' : 'watch',
      title: `${gaps} help ${gaps === 1 ? 'gap' : 'gaps'} this week`,
      finding: "Questions Vera couldn't confidently answer. The to-write list.",
      action: { label: 'See gaps', href: '/admin/vera-ai?tab=help-gaps' },
    })
  }

  return (
    <DashArea
      icon={Bot}
      label="AI & assistant"
      blurb="The AI master switch, the agent actions awaiting review, and the help gaps Vera couldn't answer. Assistant figures cover the last 7 days of Vera questions."
      href="/admin/vera-ai?tab=ai"
      hrefLabel="Open AI controls"
      footnote={<FreshnessNote at={new Date()} label="Computed" />}
    >
      <TileGrid>
        <Tile label="Assistant">
          <MiniGrid>
            <MiniStat value={aiOn ? 'On' : 'Off'} label="AI platform" tone={aiOn ? 'good' : 'bad'} />
            <MiniStat value={total.toLocaleString()} label="Questions · 7d" />
            <MiniStat value={answeredRate === null ? '—' : `${answeredRate}%`} label="Answered" />
            <MiniStat
              value={deflectedRate === null ? '—' : `${deflectedRate}%`}
              label="Deflected"
              tone={deflectedRate !== null && deflectedRate > 0 ? 'bad' : 'neutral'}
            />
            <MiniStat value={gaps.toLocaleString()} label="Help gaps · 7d" tone={gaps > 0 ? 'bad' : 'neutral'} />
            <MiniStat value={actionsPending.toLocaleString()} label="Studio prompts" tone={actionsPending > 0 ? 'bad' : 'neutral'} />
          </MiniGrid>
        </Tile>
        <GraphTile label="Vera questions / wk" value={total.toLocaleString()} caption={`${VOLUME_WEEKS} weeks · current highlighted`}>
          <WeekBars values={qSeries} height={64} />
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
