// The ONE place a member's spendable Gem balance is computed (Rewards Economy v3,
// ADR-305). Both the store (getStoreData / redeemItem) and the Gift Gems sink read
// this, so "how much can I spend" has exactly one answer and the two sinks can never
// disagree.
//
// Model (REWARDS-ECONOMY.md §1): `lifetime_gems` is MONOTONIC — it only ever rises
// (= total Gems ever earned), maintained by the after_gem_transaction trigger off the
// gem_transactions ledger. The SPENDABLE balance is what's left after the two sinks
// that draw it down:
//
//   spendable = lifetime_gems
//             − Σ store_redemptions.gems_spent   (the Vault Store sink)
//             − Σ gem_gifts.amount  where giver_id = member   (the Gift Gems sink)
//
// Gifting does NOT write a debit ledger row for the giver (Gems are not destroyed,
// they move to the recipient via awardGems — which raises the recipient's
// lifetime_gems). The giver's balance falls purely because this helper subtracts the
// gem_gifts they sent. That keeps lifetime_gems clean as "total ever earned" while the
// spendable number reflects every outflow.
//
// Server-only (admin client = service_role). The gem_gifts table is authored in a
// separate migration; if it doesn't exist yet the count read fails and is treated as
// 0 sent (best-effort), so the store keeps working until the migration lands.

import type { SupabaseClient } from '@supabase/supabase-js'

/** Sum of Gems a member has spent in the Vault Store. */
export function sumRedemptions(
  rows: Array<{ gems_spent: number | null }> | null | undefined,
): number {
  return (rows ?? []).reduce((s, r) => s + (r.gems_spent ?? 0), 0)
}

/** Sum of Gems a member has GIFTED away (the outflow of the Gift Gems sink). */
export function sumGiftsSent(
  rows: Array<{ amount: number | null }> | null | undefined,
): number {
  return (rows ?? []).reduce((s, r) => s + (r.amount ?? 0), 0)
}

/**
 * Compute spendable balance from already-fetched parts. Pure — no I/O — so callers
 * that already have the rows in hand (getStoreData / redeemItem fetch them anyway)
 * reuse their reads. Never returns negative.
 */
export function computeSpendableBalance(opts: {
  lifetimeGems: number | null | undefined
  redemptions: Array<{ gems_spent: number | null }> | null | undefined
  giftsSent: Array<{ amount: number | null }> | null | undefined
}): number {
  const earned = opts.lifetimeGems ?? 0
  const spent = sumRedemptions(opts.redemptions)
  const gifted = sumGiftsSent(opts.giftsSent)
  return Math.max(0, earned - spent - gifted)
}

/**
 * Fetch + compute a member's spendable Gem balance in one call. Use when you don't
 * already have the rows (e.g. the Gift Gems action). Reads lifetime_gems, the store
 * redemptions, and the gifts sent — the full outflow picture. The gem_gifts read is
 * best-effort: a missing table (migration not yet applied) counts as 0 gifted so the
 * balance never breaks, while the store's redemption sink still applies.
 */
export async function getSpendableBalance(
  admin: SupabaseClient,
  profileId: string,
): Promise<number> {
  const [{ data: profile }, { data: redemptions }, giftsSent] = await Promise.all([
    admin.from('profiles').select('lifetime_gems').eq('id', profileId).maybeSingle(),
    admin.from('store_redemptions').select('gems_spent').eq('profile_id', profileId),
    fetchGiftsSent(admin, profileId),
  ])

  return computeSpendableBalance({
    lifetimeGems: (profile as { lifetime_gems: number | null } | null)?.lifetime_gems,
    redemptions: redemptions as Array<{ gems_spent: number | null }> | null,
    giftsSent,
  })
}

/**
 * Read the rows of the Gift Gems sink for a member (the gifts they have SENT).
 * Best-effort: returns [] if the gem_gifts table doesn't exist yet (migration
 * pending) or the read fails, so spendable-balance math degrades to "store sink only"
 * rather than throwing.
 */
export async function fetchGiftsSent(
  admin: SupabaseClient,
  profileId: string,
): Promise<Array<{ amount: number | null }>> {
  try {
    const { data, error } = await admin
      .from('gem_gifts')
      .select('amount')
      .eq('giver_id', profileId)
    if (error) return []
    return (data ?? []) as Array<{ amount: number | null }>
  } catch {
    return []
  }
}
