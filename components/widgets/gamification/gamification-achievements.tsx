import { Award, Zap } from 'lucide-react'
import { AdminSection } from '@/components/templates'
import { EmptyState } from '@/components/ui/empty-state'
import { DataTable, type ColumnDef } from '@/components/admin/data-table'
import { StatusChip } from '@/components/admin/status'
import type { StatusTone } from '@/components/admin/status'
import { createAdminClient } from '@/lib/supabase/admin'
import { TIER_CONFIG } from '@/lib/gamification'
import type { AchievementTier } from '@/lib/gamification'

// Gamification layout module (LP7): the "All achievements" table. Self-fetching, fail-safe RSC; the
// page owns the host + community-staff gate, so this never re-gates. TIER_CONFIG's .bg/.color are NOT
// applied to markup — instead we render its .label inside StatusChip with a neutral tone, so there is
// no bespoke hex (the lib/gamification constants are the shared lib and stay unedited). The column
// render JSX is defined and consumed inside this server module, preserving the server boundary.

type AchievementRow = { id: string; slug: string; name: string; tier: string; category: string; zaps_reward: number }

// Tone map for achievement tiers (label-only; raw .bg/.color from TIER_CONFIG are not used)
const TIER_TONE: Record<AchievementTier, StatusTone> = {
  bronze:   'warning',
  silver:   'neutral',
  gold:     'warning',
  platinum: 'info',
}

const achievementColumns: ColumnDef<AchievementRow>[] = [
  {
    key: 'name',
    header: 'Achievement',
    render: (a) => <span className="text-sm font-medium text-text truncate">{a.name}</span>,
  },
  {
    key: 'tier',
    header: 'Tier',
    render: (a) => {
      const tier = TIER_CONFIG[a.tier as AchievementTier]
      return <StatusChip tone={TIER_TONE[a.tier as AchievementTier] ?? 'neutral'}>{tier?.label ?? a.tier}</StatusChip>
    },
  },
  {
    key: 'category',
    header: 'Category',
    render: (a) => <span className="text-xs text-muted capitalize">{a.category}</span>,
  },
  {
    key: 'zaps_reward',
    header: 'Zaps',
    align: 'right',
    type: 'number',
    render: (a) => (
      <span className="tabular-nums text-muted flex items-center justify-end gap-0.5">
        <Zap className="w-2.5 h-2.5 text-primary" aria-hidden />
        +{a.zaps_reward}
      </span>
    ),
  },
]

export async function GamificationAchievements() {
  const admin = createAdminClient()
  const { data } = await admin.from('achievements').select('id, slug, name, tier, category, zaps_reward').order('sort_order')
  const rows = (data ?? []) as AchievementRow[]

  return (
    <AdminSection title={`All achievements (${rows.length})`}>
      <DataTable
        caption="All achievements"
        columns={achievementColumns}
        rows={rows}
        getRowId={(a) => a.id}
        empty={
          <EmptyState
            variant="first-use"
            icon={Award}
            title="No achievements yet"
            description="Achievements you configure will appear here."
          />
        }
      />
    </AdminSection>
  )
}
