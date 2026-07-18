// Spark — the variable layer (Rewards Economy v3, ADR-305 / REWARDS-ECONOMY.md §9).
//
// A light, low-frequency, CAPPED surprise bonus layered ON TOP of the deterministic
// base payouts — never replacing them. The base (a practice log's Zaps, etc.) stays
// fully fixed and predictable; Spark is only ever extra. A variable-ratio bonus is the
// most engaging reward schedule, but here it is deliberately small and rare so it can't
// distort the economy or crowd out intrinsic motivation (ADR-305 §11).
//
// Guarantees that make it safe on a hot path:
//   • CAPPED: at most ONE Spark per member per UTC day. The cap is enforced by a
//     claim-then-pay reward_grants row keyed `spark:{profileId}:{YYYY-MM-DD}` — the
//     UNIQUE (rule_key, profile_id) insert is the lock, so a second call the same day
//     (or a lost race) can never double-pay.
//   • LOW-FREQUENCY: even on a day a member is eligible, Spark only fires with a small
//     probability, so most days carry nothing.
//   • BEST-EFFORT: every path is wrapped; maybeSpark never throws to the caller. A Spark
//     failure must never affect the base award or the action that triggered it.
//
// Naming: "Spark" is the v3 variable-bonus layer (NAMING.md — distinct from the day-3
// streak milestone and the "Sparked" badge, which share the word benignly).
//
// Server-only (admin client = service_role).

import { createAdminClient } from '@/lib/supabase/admin'
import { awardGems } from '@/lib/gems'
import { awardZaps } from '@/lib/zaps'

/** Probability that an eligible member's call fires a Spark. Low by design — the whole
 *  point is that it's rare and unpredictable. Tunable (ADR-305 open follow-up). */
export const SPARK_RATE = 0.04

/** Spark is Gems by default (continuous + spendable, so a lucky roll never touches
 *  season rank). The small bonus size. */
export const SPARK_GEMS = 5

export type SparkCurrency = 'gems' | 'zaps'

export interface SparkContext {
  /** Where the Spark fired (e.g. 'practice_log') — stored for analysis. */
  source?: string
  /** Which currency to grant. Defaults to Gems (rank-safe). */
  currency?: SparkCurrency
  /** UTC day (YYYY-MM-DD) — defaults to today. Lets callers reuse a computed day. */
  day?: string
}

export interface SparkResult {
  /** A Spark fired and was paid. */
  sparked: boolean
  currency: SparkCurrency
  amount: number
}

function utcDay(): string {
  return new Date().toISOString().slice(0, 10)
}

/**
 * Maybe grant a Spark — the capped, low-frequency surprise bonus on top of the base
 * payout. Rolls the low probability; on a hit, claims the one-per-member-per-day
 * reward_grants row (`spark:{profileId}:{YYYY-MM-DD}`) and, only on a fresh claim, pays
 * the small bonus through the canonical award path (awardGems / awardZaps) so it lands
 * in the member's ledger and the totals triggers fire.
 *
 * The base payout is NOT computed here and is never touched — call this AFTER the normal
 * award, best-effort. Returns what it granted (or `sparked: false`) so a UI can surface
 * it later.
 */
export async function maybeSpark(
  profileId: string,
  context: SparkContext = {},
): Promise<SparkResult> {
  const currency: SparkCurrency = context.currency ?? 'gems'
  const none: SparkResult = { sparked: false, currency, amount: 0 }
  try {
    if (!profileId) return none

    // Low-frequency roll: most calls do nothing.
    if (Math.random() >= SPARK_RATE) return none

    const day = context.day ?? utcDay()
    const amount = SPARK_GEMS
    const ruleKey = `spark:${profileId}:${day}`
    const admin = createAdminClient()

    // Claim-then-pay: the UNIQUE (rule_key, profile_id) row is the once-per-day cap.
    // Only a fresh claim writes the ledger, so a second roll the same day can't double-pay.
    const { error } = await admin.from('reward_grants').insert({
      rule_key: ruleKey,
      profile_id: profileId,
      reward_kind: currency,
      amount,
      detail: 'Spark',
    })
    if (error) return none // already sparked today / lost the race

    // Claim-then-pay self-heal: if the award does NOT land (a disabled/absent config row, a transient
    // failure), RELEASE the claim so the member is not left with a claimed-but-unpaid tombstone that
    // silently eats their one Spark for the rest of the day. This mirrors the release-on-unpaid pattern
    // the other reward engines (creation/connector/quest) use, and it is the ONLY place the claim is
    // cleared — a SUCCESSFUL claim is never released (that is what makes the once-per-day cap hold even
    // across a log -> unlog -> re-log loop; unlog no longer re-opens it).
    const release = async () => {
      await admin.from('reward_grants').delete().eq('profile_id', profileId).eq('rule_key', ruleKey)
    }

    if (currency === 'zaps') {
      const r = await awardZaps(profileId, amount, {
        actionType: 'spark_bonus',
        metadata: { rule: ruleKey, source: context.source ?? null },
      })
      if (!r.awarded) await release()
      return r.awarded ? { sparked: true, currency, amount: r.amount } : { ...none, currency }
    }

    const r = await awardGems(profileId, 'spark_bonus', amount, {
      rule: ruleKey,
      source: context.source ?? null,
    })
    if (!r.awarded) await release()
    return r.awarded ? { sparked: true, currency, amount: r.amount } : { ...none, currency }
  } catch (err) {
    console.error('[maybeSpark]', err instanceof Error ? err.message : err)
    return none
  }
}
