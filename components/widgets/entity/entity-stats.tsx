import { getActiveSpace } from '@/lib/spaces/active-space'
import { resolveProfileStats } from '@/lib/spaces/profile-stats'
import { StatCard } from '@/components/ui/stat-card'
import { SectionHeader } from '@/components/ui/section-header'

// ENTITY MODULE — Highlights / live stats (ENTITY-SPACES-BUILD §B.2, row `entity-highlights`). A
// self-fetching RSC: reads the active Space, computes its blueprint's live numbers from its OWN
// rows (resolveProfileStats — the same source the hero strip uses, so they never drift), and
// renders them as a `size="sm"` StatCard row (the numbers band, §A.4 / §B.3). NULL when there's no
// active Space, or when every stat is zero (a brand-new Space — the offerings/practices empties
// carry the page instead).
//
// Proof over claims (CONTENT-VOICE §6f): honest first-party counts, plain-noun labels.
export async function EntityStats() {
  const space = getActiveSpace()
  if (!space) return null

  // Template-driven stats (ADR-472): pass the full resolver input (type + Mode variant + plan +
  // preferences) so the Highlights row matches the hero strip's template-framed numbers exactly.
  const stats = await resolveProfileStats(space.id, {
    type: space.type,
    variant: space.modeVariant,
    plan: space.plan,
    preferences: space.preferences,
  })
  const shown = stats.filter((s) => s.value > 0)
  if (shown.length === 0) return null

  return (
    <div>
      <SectionHeader title="By the numbers" />
      <div className="grid grid-cols-2 gap-3 @lg:grid-cols-4">
        {shown.map((s) => (
          <StatCard key={s.metric} size="sm" label={s.label} value={s.value.toLocaleString()} />
        ))}
      </div>
    </div>
  )
}
