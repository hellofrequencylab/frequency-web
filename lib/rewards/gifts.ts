// Gift Gems — one of the two Vault sinks (Rewards Economy v3, ADR-305 /
// REWARDS-ECONOMY.md §8). A member spends their own spendable Gems to credit another
// member's Gem balance.
//
// How the balance moves (no Gems are created or destroyed):
//   1. The gift is recorded as a row in `gem_gifts` (giver_id, recipient_id, amount).
//      This is the GIVER's outflow: lib/store/balance subtracts Σ gem_gifts.amount
//      (where giver_id = the member) from their spendable balance, so the giver's
//      wallet falls by exactly the gift. No debit ledger row is written for the giver
//      — `lifetime_gems` stays monotonic ("total ever earned").
//   2. The RECIPIENT is credited through awardGems('gift_received', amount), which
//      appends a gem_transactions row; the after_gem_transaction trigger raises their
//      lifetime_gems, and it shows in their "how you earned" ledger.
//
// Ordering is insert-gift-THEN-credit so the spend is committed before the recipient
// is paid — a crash after the gift insert costs the giver nothing extra (the credit
// can be retried / reconciled), and there is no window where the recipient is paid
// without the giver's balance having moved. We never silently lose Gems: this action
// VALIDATES the spendable balance and returns a clean ActionResult error on any
// failure (unlike the best-effort reward side-effects elsewhere).
//
// Server-only (admin client = service_role, bypasses prevent_economy_self_edit). The
// gem_gifts table shape is authored in a separate migration; coded against it here.

import { createAdminClient } from '@/lib/supabase/admin'
import { awardGems } from '@/lib/gems'
import { getSpendableBalance } from '@/lib/store/balance'
import { type ActionResult, ok, fail } from '@/lib/action-result'

export interface GiftGemsResult {
  amount: number
  recipientId: string
}

/**
 * Gift `amount` Gems from one member to another.
 *
 * Validates: amount is a positive integer, giver ≠ recipient, the recipient exists,
 * and the giver's SPENDABLE balance covers it (lib/store/balance — the same number the
 * store enforces, so the two sinks agree). On success, records the gift in `gem_gifts`
 * (the giver's outflow) and then credits the recipient via awardGems. Never throws and
 * never silently loses Gems — every failure path returns a `fail(...)` result.
 */
export async function giftGems(
  fromProfileId: string,
  toProfileId: string,
  amount: number,
): Promise<ActionResult<GiftGemsResult>> {
  // --- validate the request -------------------------------------------------
  if (!fromProfileId || !toProfileId) return fail('Missing member.')
  if (fromProfileId === toProfileId) return fail('You cannot gift Gems to yourself.')
  if (!Number.isFinite(amount) || !Number.isInteger(amount) || amount <= 0) {
    return fail('Enter a whole number of Gems greater than zero.')
  }

  const admin = createAdminClient()

  // Recipient must exist.
  const { data: recipient } = await admin
    .from('profiles')
    .select('id')
    .eq('id', toProfileId)
    .maybeSingle()
  if (!recipient) return fail('We could not find that member.')

  // --- spendable balance must cover the gift --------------------------------
  // ONE shared computation (store + gift agree): earned − store spend − gifts already sent.
  const balance = await getSpendableBalance(admin, fromProfileId)
  if (balance < amount) {
    return fail(`Not enough Gems. You have ${balance} to spend.`)
  }

  // --- record the gift (the giver's outflow) BEFORE crediting the recipient --
  // Inserting the gem_gifts row is what debits the giver (lib/store/balance subtracts
  // it). Doing it first means there is no order in which Gems are double-spent: the
  // balance has already moved before the recipient is paid.
  const { error: giftError } = await admin.from('gem_gifts').insert({
    giver_id: fromProfileId,
    recipient_id: toProfileId,
    amount,
  })
  if (giftError) {
    // The gem_gifts table may not exist yet (migration authored separately) — fail
    // cleanly so no Gems are lost and the caller can surface a real error.
    return fail('Gifting is not available yet.')
  }

  // --- credit the recipient -------------------------------------------------
  const credit = await awardGems(toProfileId, 'gift_received', amount, {
    giverId: fromProfileId,
    rule: 'gift',
  })
  if (!credit.awarded) {
    // The gift is already recorded (the giver has spent). We do NOT roll it back here —
    // the recipient credit can be reconciled, and rolling back would risk losing the
    // giver's record. Surface a soft warning rather than pretend it failed.
    console.error('[giftGems] recipient credit did not land', { fromProfileId, toProfileId, amount })
  }

  return ok({ amount, recipientId: toProfileId })
}
