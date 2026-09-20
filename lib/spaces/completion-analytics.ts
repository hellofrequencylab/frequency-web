// Space Journey completion readout (LIVE-422 / ADR-1470).
//
// FOCUS-MODEL Q5 said Space analytics was QR-scan-shaped, with no completion or
// revenue surface. Premise re-tested 2026-09-20: Space Home already shows
// spaceEarningsSummary (revenue, last 30 days) and profile views. What was still
// missing is who started and finished the Journeys that belong to this Space.
//
// One reader. Existing rows only: journey_plans.space_id → journey_enrollments.
// tryCompleteJourney already stamps completed_at. People, not seats: a re-take
// does not mint a second "started". Fail-safe: zeros, never a throw. The
// console's manage gate is the door, same as every other Home band.
//
// No migration. Do not add a completion table. Do not count QR scans here.

import { createAdminClient } from '@/lib/supabase/admin'

export interface SpaceCompletionStats {
  journeyCount: number
  enrolled: number
  completed: number
  inProgress: number
  paidEnrolled: number
  /** Rounded 0-100. Null when no one has started, so Home does not print 0%. */
  completionPct: number | null
}

export type SpaceCompletionRow = {
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
        in: (col: string, vals: string[]) => Promise<{ data: unknown; error: { message: string } | null }>
      }
    }
  }
}

/**
 * Who started and finished the Journeys this Space owns. All-time. Server-only
 * (admin client). Fail-safe: empty stats, never a throw into Home.
 */
export async function getSpaceCompletionAnalytics(spaceId: string): Promise<SpaceCompletionStats> {
  if (!spaceId) return { ...EMPTY }
  try {
    const { data: planData, error: planError } = await db()
      .from('journey_plans')
      .select('id')
      .eq('space_id', spaceId)
      .limit(PLAN_CAP)
    if (planError) {
      console.error('[spaces/completion-analytics] plans failed:', planError.message)
      return { ...EMPTY }
    }
    const planIds = ((planData ?? []) as { id: string }[]).map((p) => p.id).filter(Boolean)
    if (planIds.length === 0) return { ...EMPTY }

    const { data: rowData, error: rowError } = await db()
      .from('journey_enrollments')
      .select('plan_id, profile_id, completed_at, order_id')
      .in('plan_id', planIds)
    if (rowError) {
      console.error('[spaces/completion-analytics] enrollments failed:', rowError.message)
      return { ...EMPTY, journeyCount: planIds.length }
    }
    return foldSpaceCompletions(planIds, (rowData ?? []) as SpaceCompletionRow[])
  } catch (err) {
    console.error('[spaces/completion-analytics] getSpaceCompletionAnalytics failed:', err)
    return { ...EMPTY }
  }
}
