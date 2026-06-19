import { Compass } from 'lucide-react'
import { getCrewContext } from '@/lib/quest/crew-context'
import { readSeasonMap, readPillarProgress, weeksLeft, seasonStartState } from '@/lib/quest/season-map-data'
import { SeasonMap } from '@/components/quest/season-map'
import { EmptyState } from '@/components/ui/empty-state'

// My Quest layout module (ADR-270/294): the hero's glanceable season standing — the
// four-Pillar Season Map (gauges, rank, countdown). The time-aware next step and the
// log-a-practice action are now their own detachable modules (quest-today, quest-cta), so
// each can be reordered or hidden from Settings → Layout independently. Self-fetching RSC
// keyed to the signed-in member via getCrewContext; renders nothing when there is no viewer.
export async function QuestSeasonMap() {
  const ctx = await getCrewContext()
  if (!ctx) return null
  const { profileId, season, finishedCount, rank } = ctx

  const [map, pillars] = await Promise.all([
    readSeasonMap(profileId, season),
    readPillarProgress(profileId, season),
  ])

  // A live season can be dated to start later; until then the Pillar gauges count nothing
  // (days are counted inside the season window), so the map names the start instead of
  // reading as broken. Resolved in a plain helper so the view stays pure.
  const { notStarted: seasonNotStarted, startMs: seasonStartMs, startLabel: seasonStartLabel } = seasonStartState(season)

  if (map.journeys.length === 0) {
    // No active Quest Journeys yet — keep the season frame, drop the arcs.
    return (
      <EmptyState
        icon={Compass}
        title={season ? `The Quest is open: ${season.name}` : 'The Quest opens soon'}
        description="This Quest's three Journeys appear here once the season's curriculum is live. Each covers all four Pillars: Mind, Body, Spirit, and Expression. Your daily practice still counts."
      />
    )
  }

  return (
    <SeasonMap
      seasonName={season?.name ?? null}
      weeksLeft={weeksLeft(season)}
      rank={rank}
      journeysFinished={finishedCount}
      pillars={pillars}
      notStarted={seasonNotStarted}
      startMs={seasonStartMs}
      startLabel={seasonStartLabel}
    />
  )
}
