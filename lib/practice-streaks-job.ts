// Nightly per-practice consistency job (Rewards Economy v2).
//
// Maintains practice_streaks.consecutive_on_track_weeks / best_on_track_weeks for
// every (member, practice) pair that is live — derived entirely from
// practice_logs (the cache never becomes truth). A practice-week is "on track"
// when its distinct log days in a Mon–Sun week >= the practice's weekly target
// (weeklyTargetFromCadence — the canonical rhythm clock, never duplicated). A
// missed COMPLETED week resets the run to 0; the current partial week counts as
// soon as it is on track but never counts against.
//
// Full Cycle (13 consecutive on-track weeks) pays a one-time +50⚡ per practice
// (claim-then-pay via reward_grants; full_cycle_paid mirrors it on the cache row).
// Every other tier is badge-only — with a large practice library, paid tiers
// would inflate the economy.

import { createAdminClient } from '@/lib/supabase/admin'
import type { SupabaseClient } from '@supabase/supabase-js'
import { weeklyTargetFromCadence } from '@/lib/journey-plans'
import { awardZapsForAction } from '@/lib/zaps'
import { PRACTICE_STREAK_WEEKS } from '@/lib/practice-shelf'

function db(): SupabaseClient {
  return createAdminClient() as unknown as SupabaseClient
}

// How far back logs feed the walk. 20 weeks comfortably covers a 13-week Full
// Cycle plus slack; longer history only matters via best_on_track_weeks.
const LOOKBACK_WEEKS = 20

function mondayOf(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  const dow = date.getUTCDay()
  const back = dow === 0 ? 6 : dow - 1
  date.setUTCDate(date.getUTCDate() - back)
  return date.toISOString().slice(0, 10)
}

function shiftDays(ymd: string, delta: number): string {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + delta)).toISOString().slice(0, 10)
}

/** Consecutive on-track weeks ending now: the current week counts when already
 *  on track; only completed weeks can break the run. Pure + unit-tested. */
export function consecutiveOnTrackWeeks(
  daysByWeek: Map<string, number>,
  target: number,
  currentWeekStart: string,
): number {
  let run = 0
  if ((daysByWeek.get(currentWeekStart) ?? 0) >= target) run++
  let cursor = shiftDays(currentWeekStart, -7)
  let guard = 0
  while (guard < 520 && (daysByWeek.get(cursor) ?? 0) >= target) {
    run++
    cursor = shiftDays(cursor, -7)
    guard++
  }
  return run
}

export interface PracticeStreaksRun {
  pairs: number
  fullCyclesPaid: number
}

/** Run the nightly sweep. Pairs in scope: any with a log in the lookback window
 *  (covers both advancing runs and resetting stale ones — a pair with no recent
 *  logs has already missed a completed week, and its row decays on next touch). */
export async function runPracticeStreaksJob(): Promise<PracticeStreaksRun> {
  const admin = db()
  const today = new Date().toISOString().slice(0, 10)
  const currentWeekStart = mondayOf(today)
  const since = shiftDays(currentWeekStart, -7 * LOOKBACK_WEEKS)
  const result: PracticeStreaksRun = { pairs: 0, fullCyclesPaid: 0 }

  const { data: logRows } = await admin
    .from('practice_logs')
    .select('profile_id, practice_id, logged_for')
    .gte('logged_for', since)
    .not('practice_id', 'is', null)
  const logs = (logRows ?? []) as { profile_id: string; practice_id: string; logged_for: string }[]
  if (logs.length === 0) return result

  // Distinct days per (pair, week).
  const seen = new Set<string>()
  const weeksByPair = new Map<string, Map<string, number>>()
  for (const l of logs) {
    const dayKey = `${l.profile_id}|${l.practice_id}|${l.logged_for}`
    if (seen.has(dayKey)) continue
    seen.add(dayKey)
    const pair = `${l.profile_id}|${l.practice_id}`
    const week = mondayOf(l.logged_for)
    const weeks = weeksByPair.get(pair) ?? new Map<string, number>()
    weeks.set(week, (weeks.get(week) ?? 0) + 1)
    weeksByPair.set(pair, weeks)
  }

  // Cadence per practice (one read).
  const practiceIds = [...new Set(logs.map((l) => l.practice_id))]
  const { data: practiceRows } = await admin
    .from('practices')
    .select('id, cadence')
    .in('id', practiceIds)
  const cadenceById = new Map(
    ((practiceRows ?? []) as { id: string; cadence: string | null }[]).map((p) => [p.id, p.cadence]),
  )

  for (const [pair, weeks] of weeksByPair) {
    const [profileId, practiceId] = pair.split('|')
    const target = weeklyTargetFromCadence(cadenceById.get(practiceId) ?? null)
    const run = consecutiveOnTrackWeeks(weeks, target, currentWeekStart)

    const { data: existing } = await admin
      .from('practice_streaks')
      .select('best_on_track_weeks, full_cycle_paid, lifetime_logs')
      .eq('profile_id', profileId)
      .eq('practice_id', practiceId)
      .maybeSingle()
    const row = existing as
      | { best_on_track_weeks: number; full_cycle_paid: boolean; lifetime_logs: number }
      | null
    const best = Math.max(row?.best_on_track_weeks ?? 0, run)

    if (row) {
      // Touch only the streak columns — lifetime_logs belongs to the log path
      // (bumpPracticeDepth) and must not be clobbered by a racing nightly write.
      await admin
        .from('practice_streaks')
        .update({
          consecutive_on_track_weeks: run,
          best_on_track_weeks: best,
          updated_at: new Date().toISOString(),
        })
        .eq('profile_id', profileId)
        .eq('practice_id', practiceId)
    } else {
      // First sight of the pair: seed lifetime_logs from the durable log history.
      const { count } = await admin
        .from('practice_logs')
        .select('id', { count: 'exact', head: true })
        .eq('profile_id', profileId)
        .eq('practice_id', practiceId)
      await admin.from('practice_streaks').upsert(
        {
          profile_id: profileId,
          practice_id: practiceId,
          consecutive_on_track_weeks: run,
          best_on_track_weeks: best,
          lifetime_logs: count ?? 0,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'profile_id,practice_id', ignoreDuplicates: false },
      )
    }
    result.pairs++

    // Full Cycle — one-time +50⚡ per practice, claim-then-pay.
    if (run >= PRACTICE_STREAK_WEEKS.full_cycle && !row?.full_cycle_paid) {
      const { error } = await admin.from('reward_grants').insert({
        rule_key: `practice.fullcycle:${practiceId}`,
        profile_id: profileId,
        reward_kind: 'zaps',
        amount: 0, // ledger row below carries the live amount
        detail: 'Full Cycle',
      })
      if (!error) {
        await awardZapsForAction(profileId, 'practice_full_cycle')
        await admin
          .from('practice_streaks')
          .update({ full_cycle_paid: true })
          .eq('profile_id', profileId)
          .eq('practice_id', practiceId)
        result.fullCyclesPaid++
      }
    }
  }

  return result
}
