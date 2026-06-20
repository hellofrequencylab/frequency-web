import { resolveProfileStats } from '@/lib/spaces/profile-stats'
import { StatCard } from '@/components/ui/stat-card'

// The live STAT row in the entity-profile hero card (ENTITY-SPACES-BUILD §A.4). A row of
// `StatCard size="sm"` showing the blueprint's hero numbers from the Space's OWN rows, PROMOTED to
// its own full-width row of the hero (§2) so the numbers band reads like the My Quest hero, not a
// cramped subtitle. Streams behind its own <Suspense> in the layout so the hero identity paints
// instantly (D5); a brand-new Space with no numbers renders nothing (the About empty carries it).
//
// This is the hero echo of the `entity-stats` module — both read resolveProfileStats, so the hero
// and the About tab never disagree on the counts. The tiles sit on `bg-surface-elevated/60` (the
// StatCard default) so they read on the hero card's tinted gradient.
export async function ProfileHeroStats({ spaceId, type }: { spaceId: string; type: string }) {
  const stats = (await resolveProfileStats(spaceId, type)).filter((s) => s.value > 0)
  if (stats.length === 0) return null

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {stats.map((s) => (
        <StatCard key={s.metric} size="sm" label={s.label} value={s.value.toLocaleString()} />
      ))}
    </div>
  )
}
