// The Quest — Expression Challenge completion (ADR-Quest completion model).
//
// Each Journey is capped by one Expression Challenge: a season_challenges row whose
// journey_id links it to the Journey. Completing it is REQUIRED to finish the Journey
// and pays on its own — done in person at a Circle earns Zaps (EXPRESSION_CIRCLE_ZAPS),
// posted solo online earns Gems (EXPRESSION_ONLINE_GEMS). Finishing it can immediately
// finish the Journey, so this calls tryCompleteJourney at the end.
//
// The existing challenge engine (lib/achievements.ts advanceChallenges) is COUNTER
// driven — it ticks criteria toward a target. An Expression Challenge is a single
// deliberate act, not a counter, so this marks it done directly (upserting
// challenge_progress to completed) rather than re-using the counter path. The reward
// + the journey-finish hook live here so the act is paid and the Journey can complete.
// Server-only (admin client); best-effort, never throws.

import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentSeason } from '@/lib/seasons'
import { awardZaps } from '@/lib/zaps'
import { QUEST } from '@/lib/gamification'
import { tryCompleteJourney, type CompleteJourneyResult } from '@/lib/quest/complete'

export interface CompleteExpressionOpts {
  /** In person at a Circle ('circle') pays Zaps; posted solo online ('online') pays Gems. */
  mode: 'circle' | 'online'
  /** The Circle the Expression happened at (mode === 'circle'); recorded on the grant. */
  circleId?: string
}

export interface CompleteExpressionResult {
  ok: boolean
  /** false when there is no active season or no Expression Challenge for the Journey. */
  found: boolean
  zaps: number
  gems: number
  /** The journey-finish outcome this Expression may have unlocked. */
  journey?: CompleteJourneyResult
}

/** Claim-then-pay Gem grant (mirrors lib/journeys/grants.ts grantGemsOnce). */
async function grantGemsOnce(
  admin: ReturnType<typeof createAdminClient>,
  ruleKey: string,
  profileId: string,
  amount: number,
  label: string,
  metadata: Record<string, unknown>,
): Promise<boolean> {
  if (amount <= 0) return false
  const { error } = await admin
    .from('reward_grants')
    .insert({ rule_key: ruleKey, profile_id: profileId, reward_kind: 'gems', amount, detail: label })
  if (error) return false // already granted / lost the race
  await admin.from('gem_transactions').insert({
    profile_id: profileId,
    action_type: 'expression_challenge',
    amount,
    metadata: { rule: ruleKey, label, ...metadata },
  })
  return true
}

/**
 * Complete a Journey's Expression Challenge for a member, pay the by-mode reward, and
 * try to finish the Journey. Idempotent: re-completing only re-runs the journey-finish
 * check (already paid grants are not re-paid; an already-finished Journey is a no-op).
 */
export async function completeExpressionChallenge(
  profileId: string,
  journeyId: string,
  opts: CompleteExpressionOpts,
): Promise<CompleteExpressionResult> {
  try {
    const season = (await getCurrentSeason())?.season_number
    if (season == null) return { ok: false, found: false, zaps: 0, gems: 0 }

    const admin = createAdminClient()

    // Locate the Expression Challenge: the season_challenges row linked to this Journey.
    const { data: challenge } = await admin
      .from('season_challenges')
      .select('id')
      .eq('journey_id', journeyId)
      .eq('season', season)
      .maybeSingle()

    const challengeId = (challenge as { id: string } | null)?.id
    if (!challengeId) return { ok: false, found: false, zaps: 0, gems: 0 }

    // Mark the challenge done. Upsert on the (profile_id, challenge_id) unique key so a
    // re-run is a no-op on an already-completed row.
    const { data: existing } = await admin
      .from('challenge_progress')
      .select('id, completed_at')
      .eq('profile_id', profileId)
      .eq('challenge_id', challengeId)
      .maybeSingle()
    const wasDone = !!(existing as { completed_at: string | null } | null)?.completed_at

    if (existing) {
      if (!wasDone) {
        await admin
          .from('challenge_progress')
          .update({ completed_at: new Date().toISOString() })
          .eq('id', (existing as { id: string }).id)
      }
    } else {
      await admin.from('challenge_progress').insert({
        profile_id: profileId,
        challenge_id: challengeId,
        completed_at: new Date().toISOString(),
      })
    }

    // Pay the act by mode — only on a FRESH completion, so re-runs never double-pay.
    // The Zap path is idempotent via this fresh-completion guard; the Gem path is also
    // guarded by its own reward_grants claim.
    let zaps = 0
    let gems = 0
    if (!wasDone) {
      if (opts.mode === 'circle') {
        const res = await awardZaps(profileId, QUEST.EXPRESSION_CIRCLE_ZAPS, {
          actionType: 'expression_challenge',
          metadata: { journeyId, season, circleId: opts.circleId ?? null },
        })
        zaps = res.amount
      } else {
        const granted = await grantGemsOnce(
          admin,
          `expression.online:${profileId}:${journeyId}:${season}`,
          profileId,
          QUEST.EXPRESSION_ONLINE_GEMS,
          'Expression Challenge',
          { journeyId, season },
        )
        gems = granted ? QUEST.EXPRESSION_ONLINE_GEMS : 0
      }
    }

    // Finishing the Expression can immediately finish the Journey (if the 14 distinct
    // practice days are also met). Always re-check.
    const journey = await tryCompleteJourney(profileId, journeyId)

    return { ok: true, found: true, zaps, gems, journey }
  } catch (err) {
    console.error('[completeExpressionChallenge]', err instanceof Error ? err.message : err)
    return { ok: false, found: false, zaps: 0, gems: 0 }
  }
}
