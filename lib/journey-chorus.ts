// Chorus — circle co-op completion (ADR-199; docs/JOURNEYS.md §9.1). When ≥3 active members
// of a circle share an active adoption of the SAME Journey, the circle forms a Chorus: a
// shared progress meter, a weekly bonus when the group keeps rhythm together, and a shared
// trophy when they finish as one. "Chorus" (many voices, one frequency) — deliberately NOT
// "Resonance", which the Connection Layer already owns (ADR-186).
//
// Detection is fully DERIVED — no formation table is required (an optional circle_choruses
// row is a Phase-2 display nicety). The grants ride reward_grants for exactly-once. This
// module is the pure logic; the DB queries that build its inputs are wired separately.

export const CHORUS_MIN_MEMBERS = 3

export interface ChorusGroup {
  circleId: string
  planId: string
  /** The members who are BOTH active in the circle and active adopters (≥ CHORUS_MIN_MEMBERS). */
  memberIds: string[]
}

/**
 * Find every (circle, plan) pair where ≥ CHORUS_MIN_MEMBERS active circle members share an
 * active adoption — i.e. the circle's Choruses. Pure: takes pre-fetched maps, no DB.
 */
export function detectChoruses(
  membersByCircle: ReadonlyMap<string, readonly string[]>,
  adoptersByPlan: ReadonlyMap<string, ReadonlySet<string>>,
): ChorusGroup[] {
  const out: ChorusGroup[] = []
  for (const [circleId, memberIds] of membersByCircle) {
    for (const [planId, adopters] of adoptersByPlan) {
      const shared = memberIds.filter((id) => adopters.has(id))
      if (shared.length >= CHORUS_MIN_MEMBERS) {
        out.push({ circleId, planId, memberIds: shared })
      }
    }
  }
  return out
}

/** Idempotency key for the weekly Chorus bonus — once per circle/plan/season-week. */
export function chorusKey(
  circleId: string,
  planId: string,
  season: number | string,
  bucket: number,
): string {
  return `journey.chorus:${circleId}:${planId}:${season}:${bucket}`
}

/** The weekly Chorus bonus fires when ≥ CHORUS_MIN_MEMBERS of the Chorus hit rhythm that week. */
export function chorusBonusQualifies(membersInRhythm: number): boolean {
  return membersInRhythm >= CHORUS_MIN_MEMBERS
}
