// The Quest — Journey COMPLETION transaction (ADR-Quest completion model).
//
// When a member crosses the bar (14 distinct in-window practice days + the
// Expression Challenge), this writes the canonical completion record exactly once
// and grants the rewards: a Trophy (the journey_completions row itself), +75 Zaps,
// and an escalating Gem bonus by the NEW rank reached (initiate 25 / adept 50 /
// master 100). Rank advances here — the after_zap_transaction trigger no longer
// touches current_season_rank, so the completion path owns it.
//
// Everything is best-effort and idempotent: a redelivered or concurrent call never
// double-pays (the unique journey_completions row is the lock), and a failure never
// throws to the caller (a practice log / challenge completion must never break).
// Server-only (admin client = service_role, which bypasses prevent_economy_self_edit).

import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentSeason } from '@/lib/seasons'
import { awardZapsForAction } from '@/lib/zaps'
import { higherRank, rankForCompletion, type SeasonRank } from '@/lib/season-ranks'
import { journeysFinishedThisSeason } from '@/lib/quest/completion-read'
import { evaluateJourneyCompletion } from '@/lib/quest/completion'
import { QUEST } from '@/lib/gamification'

export interface CompleteJourneyResult {
  completed: boolean
  alreadyDone?: boolean
  rank?: SeasonRank
  zaps?: number
  gems?: number
}

/** Claim-then-pay Gem grant (mirrors lib/journeys/grants.ts grantGemsOnce): the
 *  unique (rule_key, profile_id) reward_grants insert is the lock; only a fresh
 *  claim writes the gem ledger, so the bonus never double-pays. */
async function grantGemsOnce(
  admin: ReturnType<typeof createAdminClient>,
  ruleKey: string,
  profileId: string,
  amount: number,
  label: string,
  actionType: string,
): Promise<boolean> {
  if (amount <= 0) return false
  const { error } = await admin
    .from('reward_grants')
    .insert({ rule_key: ruleKey, profile_id: profileId, reward_kind: 'gems', amount, detail: label })
  if (error) return false // already granted / lost the race
  await admin.from('gem_transactions').insert({
    profile_id: profileId,
    action_type: actionType,
    amount,
    metadata: { rule: ruleKey, label },
  })
  return true
}

/**
 * Try to complete a Journey for a member. Re-checks eligibility, writes the
 * journey_completions row exactly once, advances rank, and pays the Zap + Gem
 * rewards on a GENUINELY fresh completion only. Never throws.
 */
export async function tryCompleteJourney(
  profileId: string,
  journeyId: string,
): Promise<CompleteJourneyResult> {
  try {
    const season = (await getCurrentSeason())?.season_number
    if (season == null) return { completed: false }

    const eligibility = await evaluateJourneyCompletion(profileId, journeyId, season)
    if (!eligibility.finished) return { completed: false }

    const admin = createAdminClient()

    // The Trophy + the lock. Insert the canonical completion row; the unique
    // (profile_id, journey_id, season) constraint makes a redelivery a no-op. Only a
    // row we actually inserted (returned id) is a fresh completion worth paying.
    const { data: inserted, error: insertErr } = await admin
      .from('journey_completions')
      .upsert(
        { profile_id: profileId, journey_id: journeyId, season },
        { onConflict: 'profile_id,journey_id,season', ignoreDuplicates: true },
      )
      .select('id')

    if (insertErr) {
      console.error('[tryCompleteJourney] insert', insertErr.message)
      return { completed: false }
    }
    // ignoreDuplicates → zero rows returned when the completion already existed.
    if (!inserted || inserted.length === 0) {
      return { completed: false, alreadyDone: true }
    }

    // Rank = journeys finished this season (now includes this one). Advance the
    // member's current rank and bump the monotonic lifetime peak. Service-role
    // bypasses prevent_economy_self_edit, so a plain profiles update is allowed.
    const count = await journeysFinishedThisSeason(profileId)
    const newRank = rankForCompletion(count)

    const { data: profile } = await admin
      .from('profiles')
      .select('lifetime_rank')
      .eq('id', profileId)
      .maybeSingle()
    const currentLifetime = (profile as { lifetime_rank: SeasonRank | null } | null)?.lifetime_rank ?? 'ghost'

    await admin
      .from('profiles')
      .update({ current_season_rank: newRank, lifetime_rank: higherRank(currentLifetime, newRank) })
      .eq('id', profileId)

    // +75 Zaps (the finish purse). Reads zap_config, falls back to ZAP_AMOUNTS.
    await awardZapsForAction(profileId, 'journey_finished')

    // Escalating Gem bonus by the new rank reached, granted idempotently.
    const bonus = QUEST.JOURNEY_GEM_BONUS[newRank] ?? 0
    await grantGemsOnce(
      admin,
      `journey.finish.gems:${profileId}:${journeyId}:${season}`,
      profileId,
      bonus,
      'Journey finished',
      'journey_finish_bonus',
    )

    return { completed: true, rank: newRank, zaps: QUEST.JOURNEY_FINISH_ZAPS, gems: bonus }
  } catch (err) {
    console.error('[tryCompleteJourney]', err instanceof Error ? err.message : err)
    return { completed: false }
  }
}
