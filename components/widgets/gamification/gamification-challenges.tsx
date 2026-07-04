import { Target, Zap } from 'lucide-react'
import { AdminSection } from '@/components/templates'
import { EmptyState } from '@/components/ui/empty-state'
import { DataTable, type ColumnDef } from '@/components/admin/data-table'
import { StatusChip } from '@/components/admin/status'
import type { StatusTone } from '@/components/admin/status'
import { createAdminClient } from '@/lib/supabase/admin'
import { DIFFICULTY_CONFIG } from '@/lib/gamification'
import type { ChallengeDifficulty } from '@/lib/gamification'

// Gamification layout module (LP7): the active "Season challenges" table (is_active, sort_order).
// Self-fetching, fail-safe RSC; the page owns the host + community-staff gate, so this never re-gates.
// DIFFICULTY_CONFIG's .bg/.color are NOT applied to markup — we render its .label inside StatusChip
// with a neutral tone, so there is no bespoke hex (the shared lib constants stay unedited). The column
// render JSX is defined and consumed inside this server module, preserving the server boundary.

type ChallengeRow = { id: string; slug: string; name: string; difficulty: string; target: number; zaps_reward: number }

// Tone map for challenge difficulties
const DIFF_TONE: Record<ChallengeDifficulty, StatusTone> = {
  easy:      'success',
  normal:    'info',
  hard:      'warning',
  legendary: 'danger',
}

const challengeColumns: ColumnDef<ChallengeRow>[] = [
  {
    key: 'name',
    header: 'Challenge',
    render: (c) => <span className="text-sm font-medium text-text truncate">{c.name}</span>,
  },
  {
    key: 'difficulty',
    header: 'Difficulty',
    render: (c) => {
      const diff = DIFFICULTY_CONFIG[c.difficulty as ChallengeDifficulty]
      return <StatusChip tone={DIFF_TONE[c.difficulty as ChallengeDifficulty] ?? 'neutral'}>{diff?.label ?? c.difficulty}</StatusChip>
    },
  },
  {
    key: 'target',
    header: 'Target',
    align: 'right',
    type: 'number',
    render: (c) => <span className="tabular-nums text-muted">{c.target}</span>,
  },
  {
    key: 'zaps_reward',
    header: 'Zaps',
    align: 'right',
    type: 'number',
    render: (c) => (
      <span className="tabular-nums text-muted flex items-center justify-end gap-0.5">
        <Zap className="w-2.5 h-2.5 text-primary" aria-hidden />
        +{c.zaps_reward}
      </span>
    ),
  },
]

export async function GamificationChallenges() {
  const admin = createAdminClient()
  const { data } = await admin
    .from('season_challenges')
    .select('id, slug, name, difficulty, target, zaps_reward')
    .eq('is_active', true)
    .order('sort_order')
  const rows = (data ?? []) as ChallengeRow[]

  return (
    <AdminSection title={`Season challenges (${rows.length})`}>
      <DataTable
        caption="Active season challenges"
        columns={challengeColumns}
        rows={rows}
        getRowId={(c) => c.id}
        empty={
          <EmptyState
            variant="first-use"
            icon={Target}
            title="No active challenges"
            description="Active challenges for the current season will appear here."
          />
        }
      />
    </AdminSection>
  )
}
