// Profile STAT counts for the entity hero + the in-body Highlights module (ENTITY-SPACES-BUILD
// §A.4). One place computes a Space's live numbers from its OWN rows so the hero strip
// (ProfileHeroStats) and the `entity-stats` module never drift. Each read is space_id-filtered +
// fail-safe, so a brand-new Space resolves to zeros (the empties carry the page).
//
// The stat SET is universal now (the type-driven template system is retired): every Space reads the
// same default hero stat order (lib/spaces/profile-config.ts DEFAULT_HERO_STATS), and any metric that
// resolves to 0 is dropped at render. No per-type / per-template stat framing.
//
// Proof over claims (CONTENT-VOICE §6f): honest first-party counts, plain-noun labels (no "points").

import { defaultHeroStats } from './profile-config'
import { listEventsForSpace } from '@/lib/events/store'
import { listPracticesForSpace } from '@/lib/practices'
import { listJourneyPlansForSpace } from '@/lib/journey-plans'
import { listCirclesForSpace } from '@/lib/circles/store'
import { listSpaceMembers } from './membership'

/** The stat metrics resolveProfileStats can compute a live value for. */
export type StatMetric = 'offerings' | 'sessions' | 'practices' | 'circles' | 'members' | 'clients' | 'standing'

/** One resolved hero stat: a plain-noun label + the live value from the Space's own rows. */
export interface ResolvedStat {
  metric: StatMetric
  label: string
  value: number
}

/** The plain-noun label for each stat metric (sentence case, no "points", no em dashes). */
const STAT_LABEL: Record<StatMetric, string> = {
  offerings: 'Offerings',
  sessions: 'Sessions',
  practices: 'Practices',
  circles: 'Circles',
  members: 'Members',
  clients: 'Clients',
  standing: 'Standing',
}

/** Is `metric` a known stat metric we can compute + label? (Guards the default stat set, which is a
 *  plain `string[]`, before it reaches valueFor.) */
function isStatMetric(metric: string): metric is StatMetric {
  return metric in STAT_LABEL
}

/** Compute the profile's hero stats (up to four) for a Space from its own rows. The stat SET is the
 *  universal default order (profile-config.DEFAULT_HERO_STATS); every metric is computed from the
 *  Space's first-party rows, and the hero/Highlights drop any that resolve to 0. FAIL-SAFE: every
 *  underlying read degrades to 0. PURE per Space (the caller passes just the space id now that stats
 *  no longer depend on type/variant/plan). */
export async function resolveProfileStats(spaceId: string): Promise<ResolvedStat[]> {
  const [events, practices, journeys, circles, members] = await Promise.all([
    listEventsForSpace(spaceId, { limit: 200 }),
    listPracticesForSpace(spaceId, 200),
    listJourneyPlansForSpace(spaceId, 200),
    listCirclesForSpace(spaceId, 200),
    listSpaceMembers(spaceId),
  ])

  const liveEvents = events.filter((e) => !e.is_cancelled)
  const upcoming = liveEvents.filter((e) => new Date(e.starts_at).getTime() >= Date.now()).length
  const activeCircles = circles.filter((c) => c.status === 'active').length
  const activeMembers = members.filter((m) => m.status === 'active').length

  const valueFor = (metric: StatMetric): number => {
    switch (metric) {
      case 'sessions':
        return upcoming
      case 'offerings':
        return liveEvents.length
      case 'practices':
        return practices.length + journeys.length
      case 'circles':
        return activeCircles
      case 'members':
        // The lead "people" stat: active space_members.
        return activeMembers
      case 'clients':
        // The same active members, a client-facing label (proof over claims: one honest first-party
        // count, no separate source).
        return activeMembers
      // `standing` has no honest live source yet, so it resolves to 0 and is dropped by the hero
      // (which shows only non-zero stats). Never an invented number (CONTENT-VOICE §6f).
      default:
        return 0
    }
  }

  return defaultHeroStats()
    .filter(isStatMetric)
    .slice(0, 4)
    .map((metric) => ({ metric, label: STAT_LABEL[metric], value: valueFor(metric) }))
}
