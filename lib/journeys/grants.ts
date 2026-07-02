// Journeys v2 — milestone reward grants (ADR-252, J3, JOURNEYS.md §4). Given the reward events
// the engine produced (rewards.ts) on a lesson completion, grant the Gems for each phase/journey
// milestone EXACTLY ONCE via the same claim-then-pay reward_grants idempotency the rest of the
// journey system uses. Gems are the on-platform reward; the celebration
// (the player) is the trophy moment. Server-only; best-effort (never blocks the check-off).

import { createAdminClient } from '@/lib/supabase/admin'
import type { SupabaseClient } from '@supabase/supabase-js'
import { awardZaps } from '@/lib/zaps'
import type { JourneyRewardEvent } from './rewards'

function db(): SupabaseClient {
  return createAdminClient()
}

/** Default bonus Zaps for an extra-credit Challenge, when the author hasn't set an amount. */
export const DEFAULT_EXTRA_CREDIT_ZAPS = 25

/** Gems for finishing a phase (a slice of the journey). */
const PHASE_COMPLETE_GEMS = 10

export interface GrantedJourneyReward {
  kind: 'phase' | 'journey'
  gems: number
  label: string
}

/** Claim-then-pay: the unique (rule_key, profile_id) insert is the lock; only a fresh claim
 *  writes the gem ledger, so a redelivered/concurrent completion never double-pays. */
async function grantGemsOnce(
  admin: SupabaseClient,
  ruleKey: string,
  profileId: string,
  amount: number,
  label: string,
): Promise<boolean> {
  if (amount <= 0) return false
  const { error } = await admin
    .from('reward_grants')
    .insert({ rule_key: ruleKey, profile_id: profileId, reward_kind: 'gems', amount, detail: label })
  if (error) return false // already granted / lost the race
  // The claim is the lock, but the GEMS must actually land. If the ledger insert fails,
  // release the claim so a retry can re-pay (else: claimed-but-unpaid permanently).
  const { error: txErr } = await admin.from('gem_transactions').insert({
    profile_id: profileId,
    action_type: 'journey_reward',
    amount,
    metadata: { rule: ruleKey, label },
  })
  if (txErr) {
    await admin.from('reward_grants').delete().eq('rule_key', ruleKey).eq('profile_id', profileId)
    return false
  }
  return true
}

/** Grant the Gems for the PHASE milestones in `events` (idempotent). Returns what was
 *  NEWLY granted (for the celebration toast).
 *
 *  `completionGems` is retained on the signature for caller compatibility but is no
 *  longer paid: per the Quest COMPLETION model (ADR-Quest), finishing a Journey is no
 *  longer "checked off every lesson" — it is logging the Journey's Practices on 14
 *  distinct days + completing its Expression Challenge, and the completion engine
 *  (lib/quest/complete.ts) owns the finish rewards (+75 Zaps, an escalating Gem
 *  rank-bonus, and the Trophy). The old flat-30 journey-complete grant is retired here
 *  so a Journey is never double-rewarded. */
export async function grantJourneyRewards(opts: {
  profileId: string
  /** @deprecated retired by ADR-Quest — no longer paid (see fn doc). Kept for callers. */
  completionGems?: number
  events: readonly JourneyRewardEvent[]
}): Promise<GrantedJourneyReward[]> {
  void opts.completionGems // intentionally unused — journey-complete Gems retired (ADR-Quest)
  const admin = db()
  const granted: GrantedJourneyReward[] = []
  for (const ev of opts.events) {
    if (ev.kind === 'phase_complete') {
      const label = `Phase complete${ev.phaseTitle ? `: ${ev.phaseTitle}` : ''}`
      if (await grantGemsOnce(admin, ev.idempotencyKey, opts.profileId, PHASE_COMPLETE_GEMS, label)) {
        granted.push({ kind: 'phase', gems: PHASE_COMPLETE_GEMS, label: ev.phaseTitle ?? 'Phase complete' })
      }
    }
    // journey_complete (lesson-tree "finished every lesson") NO LONGER grants Gems
    // (ADR-Quest). Phase-complete celebrations (sub-milestones inside a Run) are
    // unaffected and still pay above.
  }
  return granted
}

// ── Extra-credit Challenges (ADR-300 Part 2) ────────────────────────────────────────────
//
// An "extra credit" block is an above-and-beyond bonus task on a Journey (block_type 'exercise',
// required=false, settings.extra_credit=true). Completing it pays bonus ZAPS once, via the same
// claim-then-pay reward_grants idempotency — so a redelivered/repeated check-off never double-pays.
// It is NOT one of the four Pillar practices and does not feed the Signature; it just rewards
// regular points for going further.

/** Pay the bonus Zaps for completing one extra-credit block, EXACTLY ONCE (keyed by item id).
 *  Returns the Zaps newly awarded, or 0 if already granted / invalid. */
export async function grantExtraCreditZaps(
  profileId: string,
  itemId: string,
  amount: number,
  label: string,
): Promise<number> {
  const amt = Number.isFinite(amount) && amount > 0 ? Math.floor(amount) : 0
  if (amt <= 0) return 0
  const admin = db()
  const ruleKey = `journey_extra_credit:${itemId}`
  // The unique (rule_key, profile_id) insert is the lock; only a fresh claim pays.
  const { error } = await admin
    .from('reward_grants')
    .insert({ rule_key: ruleKey, profile_id: profileId, reward_kind: 'zaps', amount: amt, detail: label.slice(0, 200) })
  if (error) return 0 // already granted / lost the race
  const res = await awardZaps(profileId, amt, { actionType: 'journey_extra_credit', metadata: { rule: ruleKey, label } })
  if (!res.awarded) {
    // Release the claim so a retry can pay. Without this the reward_grants row blocks every
    // future attempt while nothing was ever awarded — the bonus is stranded (mirrors the
    // claim-then-pay recovery used by the quest-finish purse, C5).
    await admin.from('reward_grants').delete().eq('rule_key', ruleKey).eq('profile_id', profileId)
    return 0
  }
  return res.amount
}

/** If `itemId` is an extra-credit block on this plan, pay its bonus Zaps (idempotent). Loads the
 *  block's own `settings.bonus_zaps` (falls back to the default). Returns Zaps newly awarded. */
export async function grantExtraCreditIfAny(profileId: string, planId: string, itemId: string): Promise<number> {
  const admin = db()
  const { data } = await admin
    .from('journey_plan_items')
    .select('title, settings')
    .eq('id', itemId)
    .eq('plan_id', planId)
    .maybeSingle()
  const row = data as { title: string | null; settings: Record<string, unknown> | null } | null
  const s = row?.settings
  if (!s || s.extra_credit !== true) return 0
  const amount = typeof s.bonus_zaps === 'number' && s.bonus_zaps > 0 ? Math.floor(s.bonus_zaps) : DEFAULT_EXTRA_CREDIT_ZAPS
  return grantExtraCreditZaps(profileId, itemId, amount, `Extra credit: ${row?.title ?? 'Journey'}`)
}
