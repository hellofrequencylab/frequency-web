import { Trophy, Target, Flame, CheckCircle2 } from 'lucide-react'
import { requireAdmin } from '@/lib/admin/guard'
import { AdminTemplate, AdminSection } from '@/components/templates'
import { StatCard } from '@/components/ui/stat-card'
import { EmptyState } from '@/components/ui/empty-state'
import { DataTable, type ColumnDef } from '@/components/admin/data-table'
import { StatusChip } from '@/components/admin/status'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentSeason } from '@/lib/seasons'
import { challengeCompletionRates } from '@/lib/admin/content-signals'
import { activeSeasonJourneys } from '../actions'
import { ChallengeEditor, ChallengeCreateLauncher, type ChallengeRow } from './challenge-editor'

// Season challenges editor: tune the active season's challenges (name, story,
// difficulty, target, Zap reward) and add new ones. Completion numbers ride
// along so tuning is grounded in what members actually finish.
// Index / Table template (ADR-233 §3.3). Past seasons converted to DataTable.

type EnrichedChallenge = ChallengeRow & {
  started: number
  completed: number
  rate: number
}

const DIFFICULTY_TONE: Record<string, { tone: 'success' | 'info' | 'warning' | 'danger' | 'neutral'; label: string }> = {
  easy:      { tone: 'success', label: 'Easy' },
  normal:    { tone: 'info',    label: 'Normal' },
  hard:      { tone: 'warning', label: 'Hard' },
  legendary: { tone: 'danger',  label: 'Legendary' },
}

export default async function AdminContentChallengesPage() {
  await requireAdmin('host', { staff: 'community' })

  const ub = createAdminClient()
  const [season, completion, journeys, { data: challengeRows }] = await Promise.all([
    getCurrentSeason(),
    challengeCompletionRates(),
    activeSeasonJourneys(),
    ub
      .from('season_challenges')
      .select('id, season, slug, name, description, category, difficulty, target, zaps_reward, sort_order, journey_id, is_active')
      .order('season', { ascending: false })
      .order('sort_order', { ascending: true }),
  ])

  const all = ((challengeRows ?? []) as ChallengeRow[]).map((c) => ({
    ...c,
    started:   completion.get(c.id)?.started   ?? 0,
    completed: completion.get(c.id)?.completed ?? 0,
    rate:      completion.get(c.id)?.rate       ?? 0,
  })) as EnrichedChallenge[]

  const current = season ? all.filter((c) => c.season === season.season_number) : []
  const past    = season ? all.filter((c) => c.season !== season.season_number) : all

  const totalStarted   = current.reduce((s, c) => s + c.started,   0)
  const totalCompleted = current.reduce((s, c) => s + c.completed, 0)

  const pastColumns: ColumnDef<EnrichedChallenge>[] = [
    {
      key: 'season',
      header: 'Season',
      width: '72px',
      render: (c) => <span className="font-semibold tabular-nums text-subtle">S{c.season}</span>,
    },
    {
      key: 'name',
      header: 'Challenge name',
      render: (c) => <span className="truncate font-medium text-text">{c.name}</span>,
    },
    {
      key: 'type',
      header: 'Type',
      render: (c) =>
        c.journey_id ? (
          <StatusChip tone="info">Expression capstone</StatusChip>
        ) : (
          <span className="text-muted">Season-wide</span>
        ),
    },
    {
      key: 'difficulty',
      header: 'Difficulty',
      render: (c) => {
        const d = DIFFICULTY_TONE[c.difficulty] ?? DIFFICULTY_TONE.normal
        return <StatusChip tone={d.tone}>{d.label}</StatusChip>
      },
    },
    {
      key: 'completion',
      header: 'Completion',
      type: 'number',
      render: (c) => (
        <span className="tabular-nums text-muted">
          {c.completed}/{c.started}
          {c.started > 0 ? ` (${c.rate}%)` : ''}
        </span>
      ),
    },
  ]

  return (
    <AdminTemplate
      title="Challenges"
      eyebrow="Content"
      description="The season's challenge board. Edits go live immediately; completion numbers show what members actually finish."
      width="wide"
      actions={season ? <ChallengeCreateLauncher journeys={journeys} /> : undefined}
    >
      <AdminSection>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard
            label="Active season"
            value={season ? season.name : 'None'}
            icon={Trophy}
            size="sm"
            href="/admin/content/seasons"
          />
          <StatCard
            label="Challenges this season"
            value={current.length}
            icon={Target}
          />
          <StatCard
            label="Members in progress"
            value={totalStarted}
            icon={Flame}
          />
          <StatCard
            label="Completions"
            value={totalCompleted}
            icon={CheckCircle2}
          />
        </div>
      </AdminSection>

      {season ? (
        <>
          <AdminSection
            title={`${season.name} challenges (${current.length})`}
            description="Edit a row and save it. Target is the count to hit; the Zap reward pays on completion."
          >
            {current.length === 0 ? (
              <EmptyState
                variant="first-use"
                icon={Target}
                title="No challenges this season"
                description="Use Add challenge above. Members see it on the board right away."
              />
            ) : (
              <ChallengeEditor challenges={current} journeys={journeys} />
            )}
          </AdminSection>
        </>
      ) : (
        <AdminSection>
          <EmptyState
            variant="no-results"
            icon={Trophy}
            title="No active season"
            description="Challenges attach to the active season. Create or open a season first."
          />
        </AdminSection>
      )}

      {past.length > 0 && (
        <AdminSection
          title={`Past seasons (${past.length})`}
          description="Read-only history. Past boards stay as they ran."
        >
          <DataTable
            caption="Past season challenges"
            columns={pastColumns}
            rows={past}
            getRowId={(c) => c.id}
            density="compact"
            empty={
              <EmptyState
                variant="cleared"
                title="No past challenges"
                description="Past season challenges appear here once a season ends."
              />
            }
          />
        </AdminSection>
      )}
    </AdminTemplate>
  )
}
