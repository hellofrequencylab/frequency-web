// Saving a card, and the two things that make it dangerous (LIVE-362).
//
// A card can only be saved against a Stripe CUSTOMER. No one-time (`mode: 'payment'`) creator in
// this repo attached one before this, so this module is where that starts -- and it starts with
// the two rules the repo already learned the hard way.
//
// 🔴 RULE 1 -- FAIL CLOSED ON THE READ (SCAN-539). A PostgREST failure arrives in `error`, not as
// a throw. Treating an unreadable row as "this member has no customer yet" mints a SECOND Stripe
// customer for someone who already had one, and that split is PERMANENT: subscriptions, invoices,
// saved cards and the billing portal land on two customers and nothing afterwards can say which
// is theirs. So an unreadable row refuses the checkout rather than guessing. Refusing costs one
// retryable purchase; guessing costs an identity. lib/billing/checkout-customer-id.test.ts pins
// this same direction for the subscription creators.
//
// 🔴 RULE 2 -- A GUEST HAS NOWHERE TO SAVE ANYTHING. A signed-out buyer has no profile row to
// hold a customer id, and `customer_email` (which a guest session does set) cannot coexist with
// `customer`. So a guest gets no saved-card parameters at all, which is also the honest product
// answer: there is no account for the card to belong to.
import type { SupabaseClient } from '@supabase/supabase-js'

/** What a session must carry for a card to be savable against it. Empty = do not offer saving. */
export type SavedCardParams = Record<string, string>

/**
 * The saved-card parameters for a member, or `{}` when saving cannot be offered.
 *
 * Returns `{ error }` ONLY for the unreadable-row case, which the caller must surface rather than
 * swallow -- see RULE 1. A member who genuinely has no customer yet is not an error: they get
 * `customer_creation: 'always'` so Stripe mints one this purchase can be saved against, and the
 * settle path writes it back.
 */
export async function savedCardParamsFor(
  db: SupabaseClient,
  buyerProfileId: string | null,
  label: string,
): Promise<{ params: SavedCardParams } | { error: true }> {
  // A guest, or a caller that does not know who is buying: nothing to save against (RULE 2).
  if (!buyerProfileId) return { params: {} }

  const { data, error } = await db
    .from('profiles')
    .select('stripe_customer_id')
    .eq('id', buyerProfileId)
    .maybeSingle()

  if (error) {
    console.error(`[${label}] stripe_customer_id unreadable, refusing checkout:`, error.message)
    return { error: true }
  }

  const existing = (data as { stripe_customer_id: string | null } | null)?.stripe_customer_id ?? null
  // Reuse the member's one customer, or ask Stripe to mint exactly one. Never both: Stripe
  // rejects `customer` together with `customer_creation`.
  return { params: existing ? { customer: existing } : { customer_creation: 'always' } }
}

/**
 * Create the session WITH the saved-card parameters, and fall back to creating it without them.
 *
 * ⚠️ WHY A RETRY AND NOT A PLAIN CALL. The `stripe` package ships no type declarations, so nothing
 * in this repo's build can tell us whether `customer_creation` is accepted alongside the other
 * parameters a ticket session carries (`ui_mode: 'elements'`, a destination charge, a narrowed
 * payment-method set). A rejected parameter would otherwise THROW out of an un-caught
 * `sessions.create` and take the whole purchase with it -- to add a convenience.
 *
 * So the convenience is the thing that gets dropped. On any failure this retries once with the
 * session exactly as it was before saved cards existed, which is a shape proven in production.
 *
 * The degrade is LOUD (AGENTS.md: "every fail-safe needs a gate that notices it fired"). A silent
 * one would read as "saving cards is live" while every buyer silently got the old session.
 */
export async function createAllowingSavedCard<T>(
  create: (extra: SavedCardParams) => Promise<T>,
  params: SavedCardParams,
  label: string,
): Promise<T> {
  if (Object.keys(params).length === 0) return create({})
  try {
    return await create(params)
  } catch (err) {
    console.error(
      `[${label}] Stripe refused the saved-card parameters; retrying without them. Saving a card is OFF for this purchase.`,
      { params: Object.keys(params), error: err instanceof Error ? err.message : String(err) },
    )
    return create({})
  }
}
