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
import type { SupabaseClient } from '@supabase/supabase-js'
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

  // --- spendable balance must cover the gift (fast-fail UX pre-check) -------
  // ONE shared computation (store + gift agree): earned − store spend − gifts already sent.
  // This is a friendly pre-check only; the RPC below is the AUTHORITATIVE guard (it
  // rechecks the balance under an advisory lock, so two concurrent spends can't overspend).
  const balance = await getSpendableBalance(admin, fromProfileId)
  if (balance < amount) {
    return fail(`Not enough Gems. You have ${balance} to spend.`)
  }

  // --- record the gift ATOMICALLY (the giver's outflow) ---------------------
  // gift_gems_atomic (migration 20260726000000) takes pg_advisory_xact_lock on the giver,
  // recomputes the spendable balance inside the transaction, and inserts the gem_gift only
  // if it still covers the gift — closing the check-then-insert overspend race the app
  // cannot close on its own. Inserting the gem_gifts row is what debits the giver
  // (lib/store/balance subtracts it), and we do it BEFORE crediting the recipient so the
  // balance has already moved before the recipient is paid.
  // authz-delegated: the caller (crew/store action) establishes + authorizes the giver
  // before calling; this helper trusts that gate, same as the rest of lib/rewards.
  // Untyped handle (same pattern as lib/blocking.ts): gift_gems_atomic is new (migration
  // 20260726000000) and not yet in the generated Database types, so we widen to the
  // un-parametrised SupabaseClient. Drop after `supabase gen types` is re-run.
  const rpc: SupabaseClient = createAdminClient()
  const { data: giftIdRaw, error: giftError } = await rpc.rpc('gift_gems_atomic', {
    _giver: fromProfileId,
    _recipient: toProfileId,
    _amount: amount,
  })
  const giftId = typeof giftIdRaw === 'string' ? giftIdRaw : null
  if (giftError) {
    // The RPC raises a typed P0001 message on a real overspend / invalid request; map it
    // to a clean failure. A missing function (migration not yet applied) or any other DB
    // error also fails CLOSED here — never a silent overspend.
    if (giftError.message?.includes('insufficient_balance')) {
      return fail(`Not enough Gems. You have ${balance} to spend.`)
    }
    console.error('[giftGems] gift_gems_atomic failed', giftError.message)
    return fail('Gifting is not available right now.')
  }

  // --- credit the recipient -------------------------------------------------
  const credit = await awardGems(toProfileId, 'gift_received', amount, {
    giverId: fromProfileId,
    rule: 'gift',
  })
  if (!credit.awarded) {
    // The recipient credit didn't land — so the gift did NOT complete. The gem_gifts row (the
    // giver's debit) is now claimed-but-undelivered: leaving it would silently cost the giver
    // Gems the recipient never received. gift_gems_atomic returns the row id, so we can reverse
    // exactly that gift (no race, no orphan) and report a clean failure the caller can retry.
    console.error('[giftGems] recipient credit did not land — reversing the gift', {
      fromProfileId,
      toProfileId,
      amount,
    })
    if (giftId) await rpc.from('gem_gifts').delete().eq('id', giftId)
    return fail('We could not complete that gift. Your Gems were not spent.')
  }

  // Tell the recipient — a gift is a visible act of generosity, not a silent balance bump.
  // Best-effort: a notification failure must never fail (or reverse) a gift that already landed.
  // The bell prefixes the giver's name, so `body` is just the predicate.
  try {
    await admin.from('notifications').insert({
      recipient_id: toProfileId,
      actor_id: fromProfileId,
      type: 'gift_received',
      reference_type: 'profile',
      reference_id: fromProfileId,
      body: `sent you ${amount} ${amount === 1 ? 'Gem' : 'Gems'} 🎁`,
    })
  } catch {
    /* best-effort: the gift is complete regardless of the nudge */
  }

  return ok({ amount, recipientId: toProfileId })
}
