// Journey reward firing (ADR-200; docs/JOURNEYS.md §6). Called best-effort right after a
// practice log: recompute the member's active-journey progress, decide which bonuses a fresh
// log unlocked (Full Day / Weekly Rhythm / Journey completion), and grant each ONCE via
// claim-then-pay — the same reward_grants idempotency the retro engine uses
// (lib/rewards/evaluate.ts). Currency per ADR-139: consistency bonuses → Zaps; the completion
// payoff → Gems. Server-only; never throws into the log hot path (the caller guards it too).

import { createAdminClient } from '@/lib/supabase/admin'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getActiveJourneyProgress } from '@/lib/journey-plans'
import { evaluateLogRewards, type RewardBonus } from '@/lib/journey-rewards'

function db(): SupabaseClient {
  return createAdminClient()
}

export interface JourneyRewardResult {
  bonuses: { label: string; kind: 'zaps' | 'gems'; amount: number }[]
  zaps: number
  gems: number
}

/** Claim-then-pay: insert the reward_grants idempotency row first; only a fresh claim writes
 *  the ledger. A concurrent log loses the unique race and never double-pays. */
async function grantOnce(admin: SupabaseClient, bonus: RewardBonus, profileId: string): Promise<boolean> {
  const { error } = await admin.from('reward_grants').insert({
    rule_key: bonus.key,
    profile_id: profileId,
    reward_kind: bonus.kind,
    amount: bonus.amount,
    detail: bonus.label,
  })
  if (error) return false // unique (rule_key, profile_id) violation = already granted / lost the race
  const ledger = bonus.kind === 'gems' ? 'gem_transactions' : 'zap_transactions'
  await admin.from(ledger).insert({
    profile_id: profileId,
    action_type: bonus.kind === 'gems' ? 'journey_reward' : 'journey_bonus',
    amount: bonus.amount,
    metadata: { rule: bonus.key, label: bonus.label },
  })
  return true
}

/**
 * Fire the journey bonuses a fresh log may have unlocked. Recomputes progress, evaluates each
 * active plan, and grants idempotently. Returns what was NEWLY granted (for the UI toast). Safe
 * to call on every successful log — already-granted bonuses are skipped by the unique guard.
 */
export async function fireJourneyRewardsForLog(profileId: string, day: string): Promise<JourneyRewardResult> {
  const admin = db()
  const result: JourneyRewardResult = { bonuses: [], zaps: 0, gems: 0 }

  let progress
  try {
    progress = await getActiveJourneyProgress(profileId)
  } catch {
    return result
  }
  if (progress.length === 0) return result

  // Full Day input — across all active plans, the distinct steps due vs. logged TODAY.
  const dueToday = new Set<string>()
  for (const p of progress) for (const it of p.items) dueToday.add(it.practice_id)
  const { data: todayRows } = await admin
    .from('practice_logs')
    .select('practice_id')
    .eq('profile_id', profileId)
    .eq('logged_for', day)
  const loggedTodaySet = new Set(
    ((todayRows ?? []) as { practice_id: string | null }[])
      .map((r) => r.practice_id)
      .filter((id): id is string => !!id),
  )
  const stepsDueToday = dueToday.size
  const distinctStepsLoggedToday = [...dueToday].filter((id) => loggedTodaySet.has(id)).length

  // Which keys are already granted to this member (so a bonus is proposed at most once).
  const { data: grantRows } = await admin.from('reward_grants').select('rule_key').eq('profile_id', profileId)
  const alreadyGranted = new Set(((grantRows ?? []) as { rule_key: string }[]).map((r) => r.rule_key))

  for (const p of progress) {
    const bonuses = evaluateLogRewards({
      date: day,
      stepsDueToday, // Full Day is global; its date-only key dedupes across plans via alreadyGranted
      distinctStepsLoggedToday,
      planId: p.plan.id,
      season: p.seasonToken,
      seasonWeekBucket: p.seasonWeek != null ? p.seasonWeek - 1 : null,
      allStepsOnTrack: p.items.length > 0 && p.items.every((it) => it.met),
      qualifyingWeeks: p.qualifyingWeeks,
      targetWeeks: p.targetWeeks,
      completionGems: p.plan.completion_gems ?? 30,
      alreadyGranted,
    })
    for (const b of bonuses) {
      if (alreadyGranted.has(b.key)) continue
      const granted = await grantOnce(admin, b, profileId)
      if (!granted) {
        alreadyGranted.add(b.key)
        continue
      }
      alreadyGranted.add(b.key)
      result.bonuses.push({ label: b.label, kind: b.kind, amount: b.amount })
      if (b.kind === 'gems') result.gems += b.amount
      else result.zaps += b.amount
    }
  }

  return result
}
