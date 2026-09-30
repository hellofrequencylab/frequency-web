// THE FUNDS-FLOW SEAM (LIVE-621, ADR-1576; PROG-D8 piece 1).
//
// One checkout used to mean one seller, because every commerce session was built as a Stripe
// DESTINATION CHARGE: one PaymentIntent, one `transfer_data.destination`, one connected account paid
// as the money lands. `createCommerceCheckout` refused a cart whose products belonged to two sellers
// with "Please check out items from one seller at a time." That refusal was the honest consequence
// of the funds flow, not an oversight. Two sellers need a different shape, not a bigger loop:
// SEPARATE CHARGES AND TRANSFERS, where the payment lands on the platform account with no
// `transfer_data` and one transfer per seller follows, tied to the charge by `transfer_group`.
//
// This module is the ONE place that decides which of the two a cart takes. It is pure: it reads the
// priced lines it is handed and returns a plan; it reads no database and calls no API, so the
// decision can be tested against every cart shape without a Stripe key. The checkout builder asks
// it once and branches once on `plan.mode`; the eight other Checkout Session creators never see it.
//
// WHAT IT DECIDES
//   destination  one seller (a Space, a person, or the Frequency Store). Today's session, exactly.
//   separate     two or more sellers. One charge on the platform carrying `transfer_group`, no
//                `transfer_data`, no `on_behalf_of`, no `application_fee_amount` (the platform keeps
//                its fee by transferring less). The transfers themselves are LIVE-622's ledger.
//   refused      a cart the money cannot honestly pay: two currencies (ADR-1500: an
//                `application_fee_amount` is an integer in ONE currency, and a gross summed across
//                two is a number in none), or the Frequency Store beside another seller (the
//                platform is not a transfer destination; its share would have to be "the remainder",
//                which is a fee with no rung behind it, so the Store checks out alone).
//
// WHAT IT DOES NOT DECIDE: the fee. Each seller's platform fee is priced by `resolveCharge` in the
// checkout builder, per seller, through the same rungs a single seller gets (a Space at its plan
// rung, a person at their tier rung), because those rungs are database reads and this module is
// not. `splitTotals` then adds the parts back up so the order row can carry the sum and a test can
// pin that the sum IS the sum.

import type { OwnerKind, FundsFlow } from './types'

/** Which Stripe funds flow an order took. Persisted on `commerce_orders.funds_flow`; declared in
 *  ./types so the types-only module keeps carrying every order shape. */
export type { FundsFlow }

/** The seller half of a product row, as `commerce_products` carries it. Any object with these three
 *  fields (a product row does) can be a seller here. */
export interface FundsFlowSeller {
  owner_kind: OwnerKind
  owner_profile_id: string | null
  owner_space_id: string | null
}

/** One priced cart line. `unitCents` is the effective unit price (variant override applied). */
export interface FundsFlowLine {
  seller: FundsFlowSeller
  currency: string
  qty: number
  unitCents: number
}

/** The lines of one seller, summed. `firstLine` is the index, in the lines the plan was handed, of
 *  this seller's first line, so the builder can find its own row for the seller (a product row, with
 *  the entity and currency the seam does not read) without a cast or a second lookup. */
export interface FundsFlowGroup {
  key: string
  seller: FundsFlowSeller
  grossCents: number
  firstLine: number
}

/** A plan names its groups in both modes (one group for a destination plan), so the builder walks
 *  the same list either way and branches on `mode` only where the money differs. */
export type FundsFlowPlan =
  | { mode: 'destination'; currency: string; grossCents: number; seller: FundsFlowSeller; groups: [FundsFlowGroup] }
  | { mode: 'separate'; currency: string; grossCents: number; groups: FundsFlowGroup[] }
  | { refused: FundsFlowRefusal }

/** One seller's share of a separate plan, once the builder has priced it. */
export interface SellerSplit {
  seller: FundsFlowSeller
  grossCents: number
  platformFeeCents: number
  stripeAccountId: string
}

/** Why the seam refused a cart, as a code. The seam decides; the checkout door owns the sentence a
 *  buyer reads, beside every other refusal it words (ADR-1500's currency sentence stays at the door). */
export type FundsFlowRefusal = 'empty' | 'mixed_currency' | 'store_with_others'

/** The identity of a seller, as the refusal at the old door keyed it: kind plus both owner ids. */
export function sellerKey(s: FundsFlowSeller): string {
  return `${s.owner_kind}:${s.owner_profile_id ?? ''}:${s.owner_space_id ?? ''}`
}

/**
 * Decide the funds flow for a priced cart. Pure.
 *
 * Groups the lines by seller (kind + owner ids), sums each seller's gross, and returns
 * `destination` for one seller, `separate` for more, or a refusal code for a cart the money cannot pay
 * as one charge. Group order is first-appearance order, so the builder's writes are deterministic.
 */
export function planFundsFlow(lines: readonly FundsFlowLine[]): FundsFlowPlan {
  if (!lines.length) return { refused: 'empty' }

  const currency = (lines[0].currency || 'usd').toLowerCase()
  if (lines.some((l) => (l.currency || 'usd').toLowerCase() !== currency)) {
    return { refused: 'mixed_currency' }
  }

  const groups: FundsFlowGroup[] = []
  const byKey = new Map<string, FundsFlowGroup>()
  lines.forEach((line, index) => {
    const key = sellerKey(line.seller)
    const cents = Math.max(0, Math.floor(line.unitCents)) * Math.max(1, Math.floor(line.qty))
    const group = byKey.get(key)
    if (group) {
      group.grossCents += cents
    } else {
      const g: FundsFlowGroup = { key, seller: line.seller, grossCents: cents, firstLine: index }
      byKey.set(key, g)
      groups.push(g)
    }
  })

  const grossCents = groups.reduce((sum, g) => sum + g.grossCents, 0)
  if (groups.length === 1) {
    return { mode: 'destination', currency, grossCents, seller: groups[0].seller, groups: [groups[0]] }
  }
  // The platform is the account the charge lands on, never a transfer destination, so it cannot be
  // one seller among several: its share would be whatever is left after the transfers, a fee no
  // rung prices. The Store sells on its own.
  if (groups.some((g) => g.seller.owner_kind === 'platform')) {
    return { refused: 'store_with_others' }
  }
  return { mode: 'separate', currency, grossCents, groups }
}

/** The order-row totals of a separate plan once every seller is priced: the gross the charge takes
 *  and the platform fee the row records, which is the SUM of the per-seller fees and nothing else. */
export function splitTotals(splits: readonly SellerSplit[]): { grossCents: number; platformFeeCents: number } {
  return splits.reduce(
    (acc, s) => ({
      grossCents: acc.grossCents + s.grossCents,
      platformFeeCents: acc.platformFeeCents + s.platformFeeCents,
    }),
    { grossCents: 0, platformFeeCents: 0 },
  )
}
