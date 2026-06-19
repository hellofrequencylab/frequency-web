// Profile STAT counts for the entity hero + the in-body Highlights module (ENTITY-SPACES-BUILD
// §A.4 / §B.3). One place computes a Space's live numbers from its OWN rows so the hero strip
// (ProfileHeroStats) and the `entity-stats` module never drift. Each read is space_id-filtered +
// fail-safe, so a brand-new Space resolves to zeros (the empties carry the page).
//
// Proof over claims (CONTENT-VOICE §6f): honest first-party counts, plain-noun labels (no "points").

import { blueprintForType, type HeroStat } from './blueprints'
import { listEventsForSpace } from '@/lib/events/store'
import { listPracticesForSpace } from '@/lib/practices'
import { listJourneyPlansForSpace } from '@/lib/journey-plans'
import { listCirclesForSpace } from '@/lib/circles/store'

/** One resolved hero stat: the blueprint's label + the live value from the Space's own rows. */
export interface ResolvedStat {
  metric: HeroStat['metric']
  label: string
  value: number
}

/** Compute the blueprint's hero stats (up to four) for a Space from its own rows. Returns [] when
 *  the type has no blueprint. FAIL-SAFE: every underlying read degrades to 0. */
export async function resolveProfileStats(spaceId: string, type: string): Promise<ResolvedStat[]> {
  const blueprint = blueprintForType(type)
  if (!blueprint) return []

  const [events, practices, journeys, circles] = await Promise.all([
    listEventsForSpace(spaceId, { limit: 200 }),
    listPracticesForSpace(spaceId, 200),
    listJourneyPlansForSpace(spaceId, 200),
    listCirclesForSpace(spaceId, 200),
  ])

  const liveEvents = events.filter((e) => !e.is_cancelled)
  const upcoming = liveEvents.filter((e) => new Date(e.starts_at).getTime() >= Date.now()).length
  const activeCircles = circles.filter((c) => c.status === 'active').length

  const valueFor = (metric: HeroStat['metric']): number => {
    switch (metric) {
      case 'sessions':
        return upcoming
      case 'offerings':
        return liveEvents.length
      case 'practices':
        return practices.length + journeys.length
      case 'circles':
        return activeCircles
      // Metrics other blueprints declare (clients/members/standing) aren't sourced yet in Phase 1;
      // they resolve to 0 and are dropped by the hero (which shows only non-zero stats).
      default:
        return 0
    }
  }

  return blueprint.heroStats.slice(0, 4).map((s) => ({ metric: s.metric, label: s.label, value: valueFor(s.metric) }))
}
