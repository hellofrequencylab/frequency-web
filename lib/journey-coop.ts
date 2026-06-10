// Co-op — circle co-op completion (ADR-199; docs/JOURNEYS.md §9.1). When ≥3 active members
// of a circle share an active adoption of the SAME Journey, the circle forms a Co-op: a
// shared progress meter, a weekly bonus when the group keeps rhythm together, and a shared
// trophy when they finish as one. "Co-op" (playing together) — deliberately NOT
// "Resonance", which the Connection Layer already owns (ADR-186).
//
// Detection is fully DERIVED — no formation table is required (an optional circle_coops
// row is a Phase-2 display nicety). The grants ride reward_grants for exactly-once. This
// module is the pure logic; the DB queries that build its inputs are wired separately.

export const COOP_MIN_MEMBERS = 3

export interface CoopGroup {
  circleId: string
  planId: string
  /** The members who are BOTH active in the circle and active adopters (≥ COOP_MIN_MEMBERS). */
  memberIds: string[]
}

/**
 * Find every (circle, plan) pair where ≥ COOP_MIN_MEMBERS active circle members share an
 * active adoption — i.e. the circle's Co-ops. Pure: takes pre-fetched maps, no DB.
 */
export function detectCoops(
  membersByCircle: ReadonlyMap<string, readonly string[]>,
  adoptersByPlan: ReadonlyMap<string, ReadonlySet<string>>,
): CoopGroup[] {
  const out: CoopGroup[] = []
  for (const [circleId, memberIds] of membersByCircle) {
    for (const [planId, adopters] of adoptersByPlan) {
      const shared = memberIds.filter((id) => adopters.has(id))
      if (shared.length >= COOP_MIN_MEMBERS) {
        out.push({ circleId, planId, memberIds: shared })
      }
    }
  }
  return out
}

/** Idempotency key for the weekly Co-op bonus — once per circle/plan/season-week.
 *  The literal `journey.chorus:` prefix is a persisted reward_grants idempotency key
 *  (kept verbatim so in-flight season-week grants stay exactly-once across the rename). */
export function coopKey(
  circleId: string,
  planId: string,
  season: number | string,
  bucket: number,
): string {
  return `journey.chorus:${circleId}:${planId}:${season}:${bucket}`
}

/** The weekly Co-op bonus fires when ≥ COOP_MIN_MEMBERS of the Co-op hit rhythm that week. */
export function coopBonusQualifies(membersInRhythm: number): boolean {
  return membersInRhythm >= COOP_MIN_MEMBERS
}
