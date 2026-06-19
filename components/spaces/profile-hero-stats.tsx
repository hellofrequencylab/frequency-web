import { resolveProfileStats } from '@/lib/spaces/profile-stats'
import { StatCard } from '@/components/ui/stat-card'

// The live STAT strip in the entity-profile context band (ENTITY-SPACES-BUILD §A.4). A small row of
// `StatCard size="sm"` showing the blueprint's hero numbers from the Space's OWN rows. Streams
// behind its own <Suspense> in the layout so the hero identity paints instantly (D5); a brand-new
// Space with no numbers renders nothing (the body's offerings/practices empties carry it).
//
// This is the hero echo of the `entity-stats` module — both read resolveProfileStats, so the band
// and the About tab never disagree on the counts.
export async function ProfileHeroStats({ spaceId, type }: { spaceId: string; type: string }) {
  const stats = (await resolveProfileStats(spaceId, type)).filter((s) => s.value > 0)
  if (stats.length === 0) return null

  return (
    <div className="grid max-w-xl grid-cols-2 gap-3 sm:grid-cols-4">
      {stats.map((s) => (
        <StatCard key={s.metric} size="sm" label={s.label} value={s.value.toLocaleString()} />
      ))}
    </div>
  )
}
