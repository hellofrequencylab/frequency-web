/**
 * Count rules for ANY and N-of-M (FH-030): buckets, equivalent placements and regional chapters.
 * Pure, like the rest of lib/hunts/graph: no database, no Next, no network.
 *
 * What counts once:
 * - A mission holds one credit. Every placement bound to it is equivalent (a second code in the
 *   same shop, or a substitute venue standing in for a closed one), so whichever one a player scans,
 *   the mission is credited once. The database holds that line too: hunt_progress has one row per
 *   run and mission.
 * - A mission's bucket is fixed by the published version, never by which placement was scanned:
 *   its explicit `bucket`, else the venue of its placements, else its own key. Two missions in one
 *   shop share a bucket and count once toward ANY and N-of-M.
 * - So that a substitute cannot make one shop count twice, a count group may not hold two missions
 *   with different buckets that share a venue (VENUE_COUNTS_TWICE).
 *
 * What can still be played:
 * - A mission with placements can take a new credit only while one of them is open. `closed` is live
 *   state the caller supplies (a publish guard, a route-health check); a published version never
 *   stores it.
 * - A mission in a disabled chapter takes no new credit. Earned credits are kept either way.
 *
 * Chapters at publish: a player who stays inside one enabled chapter (its missions plus the shared
 * ones) must be able to reach the finish, and reach it without a purchase. validate.ts runs that
 * check with `chapterScopes`.
 */
import { blocker, distinctMembers } from './rules'
import type { Blocker, Chapter, HuntGraph, Mission, MissionPlacement, RuleGroup } from './types'

const placementsOf = (m: Mission): MissionPlacement[] =>
  Array.isArray(m.placements) ? m.placements.filter((p) => p !== null && typeof p === 'object') : []

const chaptersOf = (graph: HuntGraph): Chapter[] =>
  Array.isArray(graph.chapters) ? graph.chapters.filter((c) => c !== null && typeof c === 'object' && Array.isArray(c.members)) : []

/** Distinct venues a mission can be proven at, sorted. */
function missionVenues(m: Mission): string[] {
  const venues = new Set<string>()
  for (const p of placementsOf(m)) if (typeof p.venue === 'string' && p.venue) venues.add(p.venue)
  return [...venues].sort()
}

/** The one bucket a mission's credit counts under. Fixed by the version: the placement scanned never changes it. */
export function missionBucket(m: Mission): string {
  if (m.bucket) return m.bucket
  return missionVenues(m)[0] ?? m.mission_key
}

/** Keys of the missions that can still take a new credit: an open placement (or none needed) and an enabled chapter. */
export function playableKeys(graph: HuntGraph): Set<string> {
  const off = new Set<string>()
  for (const c of chaptersOf(graph)) if (c.enabled !== true) for (const k of c.members) off.add(k)
  const keys = new Set<string>()
  for (const m of graph.missions) {
    const placements = placementsOf(m)
    const open = placements.length === 0 || placements.some((p) => p.closed !== true)
    if (open && !off.has(m.mission_key)) keys.add(m.mission_key)
  }
  return keys
}

/**
 * One scope per enabled chapter: the playable missions of a player who stays inside it (its members
 * plus every mission that belongs to no chapter). Sorted by chapter key.
 */
export function chapterScopes(graph: HuntGraph): { chapter_key: string; members: string[]; keys: Set<string> }[] {
  const chapters = chaptersOf(graph)
  const inSome = new Set(chapters.flatMap((c) => c.members))
  const playable = playableKeys(graph)
  return chapters
    .filter((c) => c.enabled === true)
    .map((c) => {
      const own = new Set(c.members)
      const keys = new Set([...playable].filter((k) => own.has(k) || !inSome.has(k)))
      return { chapter_key: c.chapter_key, members: [...own].sort(), keys }
    })
    .sort((a, b) => (a.chapter_key < b.chapter_key ? -1 : a.chapter_key > b.chapter_key ? 1 : 0))
}

/** The same graph with every placement at `venue` closed. For closure drills: validate the result. */
export function closeVenue(graph: HuntGraph, venue: string): HuntGraph {
  return {
    ...graph,
    missions: graph.missions.map((m) =>
      placementsOf(m).some((p) => p.venue === venue)
        ? { ...m, placements: placementsOf(m).map((p) => (p.venue === venue ? { ...p, closed: true } : p)) }
        : m,
    ),
  }
}

/** Publish-time blockers for buckets, venues and chapter config. Expects a well-formed graph. */
export function countRuleBlockers(graph: HuntGraph): Blocker[] {
  const blockers: Blocker[] = []
  const byKey = new Map(graph.missions.map((m) => [m.mission_key, m]))

  const checkGroup = (g: RuleGroup, where: string): void => {
    if (g.logic !== 'count') return
    const members = distinctMembers(g).map((k) => byKey.get(k)).filter((m): m is Mission => m !== undefined)
    const venueOwner = new Map<string, Mission>()
    for (const m of [...members].sort((a, b) => (a.mission_key < b.mission_key ? -1 : 1))) {
      for (const v of missionVenues(m)) {
        const first = venueOwner.get(v)
        if (!first) venueOwner.set(v, m)
        else if (missionBucket(first) !== missionBucket(m)) {
          blockers.push(
            blocker(
              'VENUE_COUNTS_TWICE',
              `${where} counts "${first.mission_key}" and "${m.mission_key}" separately, but both can be proven at the same venue, so one visit could count twice. Give them the same bucket or move one placement.`,
              [first.mission_key, m.mission_key],
            ),
          )
        }
      }
    }
  }
  for (const m of graph.missions) for (const g of m.rule_groups) checkGroup(g, `Mission "${m.mission_key}"`)
  for (const g of graph.finish.rule_groups) checkGroup(g, 'The finish rule')

  const seenChapter = new Set<string>()
  const chapterOf = new Map<string, string>()
  for (const c of chaptersOf(graph)) {
    if (seenChapter.has(c.chapter_key)) {
      blockers.push(blocker('CHAPTER_INVALID', `Chapter "${c.chapter_key}" is listed more than once. Give each chapter its own key.`))
    }
    seenChapter.add(c.chapter_key)
    const missing = c.members.filter((k) => !byKey.has(k))
    if (missing.length) {
      blockers.push(
        blocker('CHAPTER_INVALID', `Chapter "${c.chapter_key}" lists ${missing.map((k) => `"${k}"`).join(', ')}, which ${missing.length === 1 ? 'is' : 'are'} not in this Hunt.`, missing),
      )
    }
    if (c.members.length === 0) {
      blockers.push(blocker('CHAPTER_INVALID', `Chapter "${c.chapter_key}" has no missions. Add one or remove the chapter.`))
    }
    for (const k of new Set(c.members)) {
      const other = chapterOf.get(k)
      if (other !== undefined && other !== c.chapter_key) {
        blockers.push(blocker('CHAPTER_INVALID', `Mission "${k}" is in chapters "${other}" and "${c.chapter_key}". A mission belongs to one chapter, or to none so every chapter shares it.`, [k]))
      }
      chapterOf.set(k, c.chapter_key)
    }
  }
  return blockers
}
