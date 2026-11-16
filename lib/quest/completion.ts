// The Quest — Journey completion ELIGIBILITY (ADR-Quest completion model).
//
// A Journey is FINISHED when, inside its ~4-week window (journey_plans.window_*),
// the member logged one of that Journey's Practices on >= QUEST.DAYS_TO_FINISH_JOURNEY
// DISTINCT days AND completed its Expression Challenge under the original contract.
// Future official enrollments can carry a versioned contract with optional Expression;
// old/unenrolled participants retain the original qualification. This module reads
// the eligibility signals; lib/quest/complete.ts owns the reward transaction.
//
// The pure threshold math (does a count of distinct days + an expression flag mean
// "finished"?) is factored into `isJourneyFinished` so it unit-tests with no network.
// Server-only (admin client) for the reads.

import { createAdminClient } from '@/lib/supabase/admin'
import { QUEST } from '@/lib/gamification'
import { resolveMemberDay } from '@/lib/member-day'
import { parseCompletionPolicy, type CompletionPolicy } from './support-policy'
import { readEnrollmentPolicy, readRecordedSupportDays } from './support-policy-read'

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

/** The distinct Pillar ids (`journey_plan_items.domain_id`) a Journey covers. Completion
 *  counts any practice in these Pillars — the member builds their own daily practice and
 *  swaps freely within a Pillar (ADR-Quest "any practice in the Pillars"), so the bar is
 *  Pillar coverage, not a fixed practice list. */
export async function journeyPillarIds(journeyId: string): Promise<string[]> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('journey_plan_items')
    .select('domain_id')
    .eq('plan_id', journeyId)
    .not('domain_id', 'is', null)

  const ids = new Set(
    ((data ?? []) as { domain_id: string | null }[])
      .map((r) => r.domain_id)
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
 * Count the DISTINCT days a member logged any practice whose Pillar is in `pillarIds`,
 * inside the window. The "any practice in the Journey's Pillars" rule: a swap to any
 * same-Pillar practice counts. Joins practice_logs -> practices for the Pillar.
 */
export async function distinctPillarDaysInWindow(
  profileId: string,
  pillarIds: string[],
  windowStart: string | null,
  windowEnd: string | null,
): Promise<number> {
  if (pillarIds.length === 0) return 0

  const admin = createAdminClient()
  let query = admin
    .from('practice_logs')
    .select('logged_for, practice:practices!inner(domain_id)')
    .eq('profile_id', profileId)
    .in('practice.domain_id', pillarIds)

  if (windowStart) query = query.gte('logged_for', windowStart.slice(0, 10))
  if (windowEnd) query = query.lte('logged_for', windowEnd.slice(0, 10))

  const { data } = await query
  const days = new Set(((data ?? []) as { logged_for: string }[]).map((r) => r.logged_for))
  return days.size
}

/**
 * The Expression requirement for a Journey: `required` is whether the Journey HAS an
 * Expression Challenge at all (the official season Journeys do; member-built library
 * Journeys do not), and `done` is whether the member completed it. A Journey with no
 * Expression Challenge is never gated on one.
 */
export async function expressionRequirement(
  profileId: string,
  journeyId: string,
  season: number,
): Promise<{ required: boolean; done: boolean }> {
  const admin = createAdminClient()
  const { data: challenge } = await admin
    .from('season_challenges')
    .select('id')
    .eq('journey_id', journeyId)
    .eq('season', season)
    .maybeSingle()

  const challengeId = (challenge as { id: string } | null)?.id
  if (!challengeId) return { required: false, done: false }

  const { data: progress } = await admin
    .from('challenge_progress')
    .select('completed_at')
    .eq('profile_id', profileId)
    .eq('challenge_id', challengeId)
    .maybeSingle()

  return { required: true, done: !!(progress as { completed_at: string | null } | null)?.completed_at }
}

/** Three-argument callers keep legacy qualification. Only a validated stored policy can opt out of Expression. */
export function isJourneyFinished(
  distinctDays: number,
  expressionRequired: boolean,
  expressionDone: boolean,
  policy?: CompletionPolicy,
): boolean {
  const recorded = policy === undefined ? null : parseCompletionPolicy(policy)
  if (policy !== undefined && !recorded) return false
  return distinctDays >= (recorded?.daysRequired ?? QUEST.DAYS_TO_FINISH_JOURNEY) && (!(recorded?.expressionRequired ?? expressionRequired) || expressionDone)
}

interface JourneyEligibility {
  distinctDays: number
  daysRequired: number
  /** Whether this Journey counts toward rank at all (official, or a Vera-approved library Journey). */
  rankedEligible: boolean
  /** Whether the Journey has an Expression Challenge that gates completion. */
  expressionRequired: boolean
  expressionDone: boolean
  /** Actual linked challenge existence, separate from whether the enrollment requires it. */
  hasExpression?: boolean
  /** Whether a completion window was resolved (a plan window, or a member enrollment anchor). */
  windowOk: boolean
  finished: boolean
  /** Present only for an immutable prospective enrollment contract. */
  policyVersion?: 2
  /** Unavailable data is never a count of zero qualifying days. */
  evidenceAvailable?: boolean
  /** Some legacy records lack full support evidence; known days are a lower bound. */
  unknownSupportLogs?: number
  windowStartsAt?: string | null
  windowEndsAt?: string | null
}

/** Add `days` calendar days to an ISO timestamp, returning an ISO string. */
function addDays(iso: string, days: number): string {
  const d = new Date(iso)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString()
}

/**
 * Evaluate whether a member has finished a Journey this season. Two shapes share one
 * rule (>= QUEST.DAYS_TO_FINISH_JOURNEY distinct in-window practice days):
 *   • OFFICIAL season Journeys carry a fixed plan window and require their Expression
 *     Challenge.
 *   • Member-built LIBRARY Journeys (ranked_eligible, Vera-approved) use a MEMBER-ANCHORED
 *     window — the member's enrollment started_at + QUEST.JOURNEY_WINDOW_DAYS — and require
 *     no Expression (they have none).
 * Only `ranked_eligible` Journeys ever count toward rank; an un-enrolled library Journey
 * has no window and so can never complete.
 */
export async function evaluateJourneyCompletion(
  profileId: string,
  journeyId: string,
  season: number,
): Promise<JourneyEligibility> {
  const admin = createAdminClient()
  const { data: plan } = await admin
    .from('journey_plans')
    .select('ranked_eligible, official, window_starts_at, window_ends_at')
    .eq('id', journeyId)
    .maybeSingle()

  const p = plan as {
    ranked_eligible: boolean | null
    official?: boolean | null
    window_starts_at: string | null
    window_ends_at: string | null
  } | null
  const rankedEligible = !!p?.ranked_eligible

  // The stored contract wins even if the plan's official flag or window later changes.
  // Existing NULL enrollments, unenrolled participants and library contracts stay legacy.
  // Current rank eligibility still controls whether any completion can award recognition.
  if (p) {
    const recorded = await readEnrollmentPolicy(admin, profileId, journeyId)
    if (!recorded.available) return { distinctDays: 0, daysRequired: QUEST.DAYS_TO_FINISH_JOURNEY,
      rankedEligible, expressionRequired: true, expressionDone: false, windowOk: false,
      finished: false, evidenceAvailable: false }
    if (recorded.policy) {
      const policy = recorded.policy
      const today = await resolveMemberDay(profileId)
      const evidence = await readRecordedSupportDays(admin, profileId, policy, today)
      const { required: hasExpression, done: expressionDone } = await expressionRequirement(profileId, journeyId, season)
      return { distinctDays: evidence.distinctDays, daysRequired: policy.daysRequired,
        rankedEligible, expressionRequired: false, expressionDone, hasExpression, windowOk: true,
        finished: rankedEligible && evidence.available && isJourneyFinished(evidence.distinctDays, false, expressionDone, policy),
        policyVersion: 2, evidenceAvailable: evidence.available, unknownSupportLogs: evidence.unknownLogs,
        windowStartsAt: policy.windowStart, windowEndsAt: policy.windowEnd }
    }
  }

  // Window: a fixed plan window (official/seeded Journeys), else member-anchored from
  // the member's enrollment (member-built library Journeys).
  let windowStart = p?.window_starts_at ?? null
  let windowEnd = p?.window_ends_at ?? null
  if (!windowStart && !windowEnd) {
    const { data: enrollment } = await admin
      .from('journey_enrollments')
      .select('started_at')
      .eq('profile_id', profileId)
      .eq('plan_id', journeyId)
      .order('started_at', { ascending: true })
      .limit(1)
      .maybeSingle()
    const startedAt = (enrollment as { started_at: string | null } | null)?.started_at ?? null
    if (startedAt) {
      windowStart = startedAt
      windowEnd = addDays(startedAt, QUEST.JOURNEY_WINDOW_DAYS)
    }
  }

  // Count by PILLAR coverage, not a fixed practice list: any practice the member logs
  // whose Pillar this Journey covers counts (swap freely within a tag, ADR-Quest).
  const pillarIds = await journeyPillarIds(journeyId)
  const distinctDays = await distinctPillarDaysInWindow(profileId, pillarIds, windowStart, windowEnd)
  const { required: expressionRequired, done: expressionDone } = await expressionRequirement(profileId, journeyId, season)

  // A library Journey with no enrollment has no window → the day count would be
  // unconstrained, so require a resolved window in addition to ranked eligibility.
  const windowOk = windowStart != null || windowEnd != null
  const finished =
    rankedEligible && windowOk && isJourneyFinished(distinctDays, expressionRequired, expressionDone)

  return {
    distinctDays,
    daysRequired: QUEST.DAYS_TO_FINISH_JOURNEY,
    rankedEligible,
    expressionRequired,
    expressionDone,
    windowOk,
    finished,
  }
}
