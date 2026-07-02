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
import { awardZapsForAction, type ZapAction } from '@/lib/zaps'
import { awardGems } from '@/lib/gems'
import { higherRank, rankForCompletion, type SeasonRank } from '@/lib/season-ranks'
import { journeysFinishedThisSeason } from '@/lib/quest/completion-read'
import { evaluateJourneyCompletion } from '@/lib/quest/completion'
import { grantJourneyBadgeOnCompletion, grantStoreItem } from '@/lib/awards/cosmetics'
import { QUEST } from '@/lib/gamification'
import { celebrateInCircleFeed } from '@/lib/circles/social-fuel'

export interface CompleteJourneyResult {
  completed: boolean
  alreadyDone?: boolean
  rank?: SeasonRank
  zaps?: number
  gems?: number
  /** The season capstone fired on this completion (3rd Journey → Master). */
  certificate?: boolean
}

/**
 * The season CAPSTONE (Rewards Economy v3, ADR-305 / REWARDS-ECONOMY.md §7): finishing the
 * THIRD Journey of a season (Master rank) grants, ONCE per member per season:
 *   · the 'certificate' achievement (a user_achievements row), and
 *   · the 'certificate-seal' cosmetic (grantStoreItem), and
 *   · 100 Gems (awardGems action_type 'certificate_bonus').
 * Idempotent via the reward_grants rule_key `certificate:{season}` (claim-then-pay): the
 * unique (rule_key, profile_id) insert is the lock; only a fresh claim grants. Best-effort:
 * the 'certificate' achievement row + 'certificate-seal' store item are seeded separately,
 * so a missing row here is a no-op (grantStoreItem returns false, the achievement insert is
 * skipped on a lookup miss) and NEVER throws. Returns true when the capstone newly fired.
 */
async function grantCertificate(
  admin: ReturnType<typeof createAdminClient>,
  profileId: string,
  season: number,
): Promise<boolean> {
  try {
    // Race-proof count + claim (BUG-8, migration 20260826000000): the SECURITY DEFINER RPC counts
    // the member's finished Journeys for the season AND inserts the certificate:{season} reward_grants
    // lock under one advisory lock, so two concurrent completions can't both observe a stale count.
    // Returns true ONLY for the call that wins the claim (>= 3 finished and not already granted), so
    // the one-time side effects below run exactly once. The RPC isn't in the generated types yet, so
    // it's called through the untyped surface (repo convention, see lib/traits/refresh.ts).
    const { data: won, error } = await (admin as unknown as {
      rpc: (
        fn: string,
        args: Record<string, unknown>,
      ) => Promise<{ data: boolean | null; error: { message: string } | null }>
    }).rpc('claim_season_certificate', { p_profile_id: profileId, p_season: season })
    if (error || !won) return false // below the bar, already granted, or lost the race

    // The 'certificate' achievement (seeded separately — skip cleanly if absent).
    const { data: ach } = await admin
      .from('achievements')
      .select('id')
      .eq('slug', 'certificate')
      .maybeSingle()
    const achId = (ach as { id: string } | null)?.id
    if (achId) {
      await admin
        .from('user_achievements')
        .upsert(
          { profile_id: profileId, achievement_id: achId },
          { onConflict: 'profile_id,achievement_id', ignoreDuplicates: true },
        )
    }

    // The unique 'certificate-seal' cosmetic (no-op if the store item isn't seeded yet).
    await grantStoreItem(profileId, 'certificate-seal')

    // 100 Gems — the capstone purse (no extra Zaps; §7).
    await awardGems(profileId, 'certificate_bonus', 100, { rule: `certificate:${season}`, season })

    return true
  } catch (err) {
    console.error('[grantCertificate]', err instanceof Error ? err.message : err)
    return false
  }
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
  // The claim is the lock, but the GEMS must actually land. If the ledger insert fails
  // (a transient DB error), swallowing it would leave the lock permanent and the Gems
  // never paid (claimed-but-unpaid). Release the claim so a retry can re-pay.
  const { error: txErr } = await admin.from('gem_transactions').insert({
    profile_id: profileId,
    action_type: actionType,
    amount,
    metadata: { rule: ruleKey, label },
  })
  if (txErr) {
    await admin.from('reward_grants').delete().eq('rule_key', ruleKey).eq('profile_id', profileId)
    return false
  }
  return true
}

/** Claim-then-pay Zap grant (mirrors grantGemsOnce / lib/rewards/creation.ts): the unique
 *  (rule_key, profile_id) reward_grants insert is the lock; only a fresh claim writes the zap
 *  ledger, so a redelivered/concurrent completion never double-pays. Because the claim is
 *  DECOUPLED from the journey_completions lock, a crash AFTER the completion row lands but
 *  BEFORE the award is recoverable — a later call re-claims and pays (C5). `amount` is the
 *  nominal purse recorded on the grant row; the authoritative value lands in zap_transactions
 *  via awardZapsForAction, which reads the live zap_config. */
async function grantZapsOnce(
  admin: ReturnType<typeof createAdminClient>,
  ruleKey: string,
  profileId: string,
  action: ZapAction,
  amount: number,
  label: string,
): Promise<boolean> {
  if (amount <= 0) return false
  const { error } = await admin
    .from('reward_grants')
    .insert({ rule_key: ruleKey, profile_id: profileId, reward_kind: 'zaps', amount, detail: label })
  if (error) return false // already granted / lost the race
  // The claim is the lock, but the ZAPS must actually land. If the award fails (a transient
  // ledger error, or an inactive zap_config row → awarded:false), release the claim so a retry
  // can re-pay — otherwise the lock is permanent and the purse is never credited (claimed-but-unpaid).
  const res = await awardZapsForAction(profileId, action)
  if (!res.awarded) {
    await admin.from('reward_grants').delete().eq('rule_key', ruleKey).eq('profile_id', profileId)
    return false
  }
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

    // The +75 Zap purse rides its OWN reward_grants claim (below), decoupled from the
    // journey_completions lock — a crash after the completion row but before the award is
    // recoverable on any later call. rule_key is per (member, journey, season) (C5).
    const zapPurseKey = `journey.finish.zaps:${profileId}:${journeyId}:${season}`

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
    // ignoreDuplicates → zero rows returned when the completion already existed. The Trophy +
    // lock are in place, but the ORIGINAL call may have crashed after the row landed and before
    // the +75 Zap purse was paid (C5). The purse carries its own reward_grants claim, so
    // re-attempt it here: it re-pays a claimed-but-unlanded purse and is a cheap unique-conflict
    // no-op once already paid. The OTHER finish rewards stay gated on the fresh insert below.
    if (!inserted || inserted.length === 0) {
      await grantZapsOnce(admin, zapPurseKey, profileId, 'journey_finished', QUEST.JOURNEY_FINISH_ZAPS, 'Journey finished')
      return { completed: false, alreadyDone: true }
    }

    // Rank = journeys finished this season (now includes this one). Advance the
    // member's current rank and bump the monotonic lifetime peak. Service-role
    // bypasses prevent_economy_self_edit, so a plain profiles update is allowed.
    const count = await journeysFinishedThisSeason(profileId)
    const newRank = rankForCompletion(count)

    const { data: profile } = await admin
      .from('profiles')
      .select('current_season_rank, lifetime_rank')
      .eq('id', profileId)
      .maybeSingle()
    const prof = profile as { current_season_rank: SeasonRank | null; lifetime_rank: SeasonRank | null } | null
    const currentSeason = prof?.current_season_rank ?? 'ghost'
    const currentLifetime = prof?.lifetime_rank ?? 'ghost'

    // NON-LOWERING write: the season-finished count is read non-atomically, so a
    // concurrent completion can momentarily observe a STALE (lower) count and compute a
    // lower rank than one already written. Only ever RAISE current_season_rank — never
    // overwrite a higher rank with a lower one. lifetime_rank is already the monotonic
    // peak via higherRank. Skip the write entirely when neither would change.
    const raisedSeason = higherRank(currentSeason, newRank)
    const raisedLifetime = higherRank(currentLifetime, newRank)
    if (raisedSeason !== currentSeason || raisedLifetime !== currentLifetime) {
      await admin
        .from('profiles')
        .update({ current_season_rank: raisedSeason, lifetime_rank: raisedLifetime })
        .eq('id', profileId)
    }

    // +75 Zaps (the finish purse). Claim-then-pay through reward_grants (C5) so the purse
    // survives a redelivery/crash between the completion row and the award. Reads the live
    // amount from zap_config; the grant row records the canonical purse for the Vault log.
    await grantZapsOnce(admin, zapPurseKey, profileId, 'journey_finished', QUEST.JOURNEY_FINISH_ZAPS, 'Journey finished')

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

    // The Trophy cosmetic: finishing a Journey mints its Pillar (Mind/Body/Spirit) badge
    // (REWARDS-ECONOMY.md §7), and the Full Spectrum banner once all four are held.
    // Idempotent + best-effort — granted directly here so the Trophy lands with the finish.
    await grantJourneyBadgeOnCompletion(profileId, journeyId).catch(() => false)

    // The Certificate (season capstone): finishing the THIRD Journey this season = Master. Granted
    // race-proof by the claim_season_certificate RPC (migration 20260826000000, BUG-8): it counts the
    // member's finished Journeys AND claims the certificate:{season} lock under one advisory lock, so
    // two concurrent completions can never both read a stale count < 3. Called on EVERY completion;
    // the RPC returns false below the 3-Journey bar, so no separate pre-count read is needed here.
    const certificate = await grantCertificate(admin, profileId, season)

    // Social fuel (Resonance Engine Phase 5 · ADR-386): fire the milestone into the member's
    // CIRCLE feeds as peer recognition (crowd-in), not a private modal. Best-effort + swallowed:
    // a missed shoutout never affects the completion. Master-rank gets its own line when this
    // finish newly raised them to Master; otherwise the Journey-finished celebration.
    void (async () => {
      try {
        const { data: who } = await admin.from('profiles').select('handle').eq('id', profileId).maybeSingle()
        const handle = (who as { handle: string | null } | null)?.handle
        if (!handle) return
        const { data: jr } = await admin.from('journey_plans').select('title').eq('id', journeyId).maybeSingle()
        const detail = (jr as { title: string | null } | null)?.title ?? null
        const becameMaster = newRank === 'master' && raisedSeason === 'master' && currentSeason !== 'master'
        await celebrateInCircleFeed(profileId, {
          handle,
          kind: becameMaster ? 'master_rank' : 'journey_finished',
          detail: becameMaster ? null : detail,
        })
      } catch {
        /* a missed celebration never breaks the completion */
      }
    })()

    return { completed: true, rank: newRank, zaps: QUEST.JOURNEY_FINISH_ZAPS, gems: bonus, certificate }
  } catch (err) {
    console.error('[tryCompleteJourney]', err instanceof Error ? err.message : err)
    return { completed: false }
  }
}
