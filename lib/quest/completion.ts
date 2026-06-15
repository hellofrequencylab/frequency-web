// The Quest — Journey completion ELIGIBILITY (ADR-Quest completion model).
//
// A Journey is FINISHED when, inside its ~4-week window (journey_plans.window_*),
// the member logged one of that Journey's Practices on >= QUEST.DAYS_TO_FINISH_JOURNEY
// DISTINCT days AND completed that Journey's Expression Challenge. This module reads
// the eligibility signals; lib/quest/complete.ts owns the reward transaction.
//
// The pure threshold math (does a count of distinct days + an expression flag mean
// "finished"?) is factored into `isJourneyFinished` so it unit-tests with no network.
// Server-only (admin client) for the reads.

import { createAdminClient } from '@/lib/supabase/admin'
import { QUEST } from '@/lib/gamification'

/** Distinct practice_ids that belong to a Journey (the plan's block tree). */
export async function journeyPracticeIds(journeyId: string): Promise<string[]> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('journey_plan_items')
    .select('practice_id')
    .eq('plan_id', journeyId)
    .not('practice_id', 'is', null)

  const ids = new Set(
    ((data ?? []) as { practice_id: string | null }[])
      .map((r) => r.practice_id)
      .filter((id): id is string => !!id),
  )
  return [...ids]
}

/**
 * Count the DISTINCT days a member logged any of `practiceIds` inside the window.
 * A null window bound leaves that side unconstrained (an open-ended window). Returns
 * 0 when there are no practices to look for.
 */
export async function distinctPracticeDaysInWindow(
  profileId: string,
  practiceIds: string[],
  windowStart: string | null,
  windowEnd: string | null,
): Promise<number> {
  if (practiceIds.length === 0) return 0

  const admin = createAdminClient()
  let query = admin
    .from('practice_logs')
    .select('logged_for')
    .eq('profile_id', profileId)
    .in('practice_id', practiceIds)

  if (windowStart) query = query.gte('logged_for', windowStart.slice(0, 10))
  if (windowEnd) query = query.lte('logged_for', windowEnd.slice(0, 10))

  const { data } = await query
  const days = new Set(((data ?? []) as { logged_for: string }[]).map((r) => r.logged_for))
  return days.size
}

/**
 * Whether the member completed this Journey's Expression Challenge — the
 * season_challenges row whose journey_id links it to the Journey, for the given
 * season. True iff a challenge_progress row for (profile, that challenge) has a
 * non-null completed_at.
 */
export async function expressionChallengeDone(
  profileId: string,
  journeyId: string,
  season: number,
): Promise<boolean> {
  const admin = createAdminClient()
  const { data: challenge } = await admin
    .from('season_challenges')
    .select('id')
    .eq('journey_id', journeyId)
    .eq('season', season)
    .maybeSingle()

  const challengeId = (challenge as { id: string } | null)?.id
  if (!challengeId) return false

  const { data: progress } = await admin
    .from('challenge_progress')
    .select('completed_at')
    .eq('profile_id', profileId)
    .eq('challenge_id', challengeId)
    .maybeSingle()

  return !!(progress as { completed_at: string | null } | null)?.completed_at
}

/** Pure threshold rule: enough distinct days AND the Expression Challenge done. */
export function isJourneyFinished(distinctDays: number, expressionDone: boolean): boolean {
  return distinctDays >= QUEST.DAYS_TO_FINISH_JOURNEY && expressionDone
}

export interface JourneyEligibility {
  distinctDays: number
  daysRequired: number
  /** Whether at least one window bound was set (informational; the bar is days+expression). */
  windowOk: boolean
  expressionDone: boolean
  finished: boolean
}

/**
 * Evaluate whether a member has finished a Journey this season. Reads the Journey
 * window + Practices, counts distinct logged days in-window, checks the Expression
 * Challenge, and applies the pure threshold rule.
 */
export async function evaluateJourneyCompletion(
  profileId: string,
  journeyId: string,
  season: number,
): Promise<JourneyEligibility> {
  const admin = createAdminClient()
  const { data: plan } = await admin
    .from('journey_plans')
    .select('window_starts_at, window_ends_at')
    .eq('id', journeyId)
    .maybeSingle()

  const windowStart = (plan as { window_starts_at: string | null } | null)?.window_starts_at ?? null
  const windowEnd = (plan as { window_ends_at: string | null } | null)?.window_ends_at ?? null

  const practiceIds = await journeyPracticeIds(journeyId)
  const distinctDays = await distinctPracticeDaysInWindow(profileId, practiceIds, windowStart, windowEnd)
  const expressionDone = await expressionChallengeDone(profileId, journeyId, season)

  return {
    distinctDays,
    daysRequired: QUEST.DAYS_TO_FINISH_JOURNEY,
    windowOk: !!(windowStart || windowEnd),
    expressionDone,
    finished: isJourneyFinished(distinctDays, expressionDone),
  }
}
