import 'server-only'

// Space Journey completion readout (LIVE-422 / ADR-1470).
//
// FOCUS-MODEL Q5 said Space analytics was QR-scan-shaped, with no completion or
// revenue surface. Premise re-tested 2026-09-20: Space Home already shows
// spaceEarningsSummary (revenue, last 30 days) and profile views. What was still
// missing is who started and finished the Journeys that belong to this Space.
//
// One reader. Existing rows only: journey_plans.space_id → journey_enrollments.
// tryCompleteJourney already stamps completed_at. People, not seats: a re-take
// does not mint a second "started". Frequency reads distinguish unavailable from measured zero. The
// console's manage gate is the door, same as every other Home band.
//
// No migration. Do not add a completion table. Do not count QR scans here.

import { createAdminClient } from '@/lib/supabase/admin'

interface SpaceCompletionStats {
  journeyCount: number
  enrolled: number
  completed: number
  inProgress: number
  paidEnrolled: number
  /** Rounded 0-100. Null when no one has started, so Home does not print 0%. */
  completionPct: number | null
}

type SpaceCompletionRow = {
  plan_id: string
  profile_id: string
  completed_at: string | null
  order_id: string | null
}

const EMPTY: SpaceCompletionStats = {
  journeyCount: 0,
  enrolled: 0,
  completed: 0,
  inProgress: 0,
  paidEnrolled: 0,
  completionPct: null,
}

const PLAN_CAP = 200
const ENROLLMENT_PAGE = 500
const ENROLLMENT_PAGE_CAP = 20

/** Fold enrollments for the plans this Space owns. Pure. Unique people. */
export function foldSpaceCompletions(
  planIds: readonly string[],
  rows: readonly SpaceCompletionRow[],
): SpaceCompletionStats {
  const plans = new Set(planIds)
  const people = new Map<string, { completed: boolean; paid: boolean }>()
  for (const row of rows) {
    if (!plans.has(row.plan_id)) continue
    const prev = people.get(row.profile_id) ?? { completed: false, paid: false }
    people.set(row.profile_id, {
      completed: prev.completed || Boolean(row.completed_at),
      paid: prev.paid || Boolean(row.order_id),
    })
  }
  let completed = 0
  let paidEnrolled = 0
  for (const person of people.values()) {
    if (person.completed) completed += 1
    if (person.paid) paidEnrolled += 1
  }
  const enrolled = people.size
  return {
    journeyCount: plans.size,
    enrolled,
    completed,
    inProgress: enrolled - completed,
    paidEnrolled,
    completionPct: enrolled === 0 ? null : Math.round((completed / enrolled) * 100),
  }
}

function db() {
  return createAdminClient() as unknown as {
    from: (table: string) => {
      select: (cols: string) => {
        eq: (col: string, val: string) => {
          limit: (n: number) => Promise<{ data: unknown; error: { message: string } | null }>
        }
        in: (col: string, vals: string[]) => {
          order: (col: string) => { range: (from: number, to: number) => Promise<{ data: unknown; error: { message: string } | null }> }
        }
      }
    }
  }
}

/**
 * Who started and finished the Journeys this Space owns. All-time. Server-only
 * (admin client). Fail-safe: empty stats, never a throw into Home.
 */
async function loadSpaceCompletionAnalytics(spaceId: string): Promise<{ stats: SpaceCompletionStats; available: boolean }> {
  if (!spaceId) return { stats: { ...EMPTY }, available: false }
  try {
    const { data: planData, error: planError } = await db()
      .from('journey_plans')
      .select('id')
      .eq('space_id', spaceId)
      .limit(PLAN_CAP + 1)
    if (planError) {
      console.error('[spaces/completion-analytics] plans failed:', planError.message)
      return { stats: { ...EMPTY }, available: false }
    }
    const planIds = ((planData ?? []) as { id: string }[]).map((p) => p.id).filter(Boolean)
    if (planIds.length === 0) return { stats: { ...EMPTY }, available: true }
    if (planIds.length > PLAN_CAP) return { stats: { ...EMPTY }, available: false }

    const rows: SpaceCompletionRow[] = []
    // Explicit stable pages avoid silently treating the API's row cap as all-time totals.
    for (let page = 0; page < ENROLLMENT_PAGE_CAP; page++) {
      const { data: rowData, error: rowError } = await db()
        .from('journey_enrollments')
        .select('plan_id, profile_id, completed_at, order_id')
        .in('plan_id', planIds)
        .order('id')
        .range(page * ENROLLMENT_PAGE, (page + 1) * ENROLLMENT_PAGE - 1)
      if (rowError) {
        console.error('[spaces/completion-analytics] enrollments failed:', rowError.message)
        return { stats: { ...EMPTY, journeyCount: planIds.length }, available: false }
      }
      const batch = (rowData ?? []) as SpaceCompletionRow[]
      rows.push(...batch)
      if (batch.length < ENROLLMENT_PAGE) return { stats: foldSpaceCompletions(planIds, rows), available: true }
    }
    // A bounded reader must report incomplete, never publish a partial population as a total.
    return { stats: { ...EMPTY, journeyCount: planIds.length }, available: false }
  } catch (err) {
    console.error('[spaces/completion-analytics] getSpaceCompletionAnalytics failed:', err)
    return { stats: { ...EMPTY }, available: false }
  }
}

/** Legacy dashboard compatibility; new surfaces must distinguish unavailable data from measured zero. */
export async function getSpaceCompletionAnalytics(spaceId: string): Promise<SpaceCompletionStats> {
  return (await loadSpaceCompletionAnalytics(spaceId)).stats
}

/** Scoped all-time totals, or null when any read fails or a bounded population is incomplete. */
export async function readSpaceCompletionAnalytics(spaceId: string): Promise<SpaceCompletionStats | null> {
  const result = await loadSpaceCompletionAnalytics(spaceId)
  return result.available ? result.stats : null
}
