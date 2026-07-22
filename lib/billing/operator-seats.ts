// OPERATOR SEAT MANAGEMENT (A4/A5, post-subscription). Change the LICENSED operator-seat count on a
// Space that ALREADY pays, by mutating the `operator_seat` line item on its live Stripe subscription
// (add / change quantity / remove), with proration. The webhook (customer.subscription.updated ->
// reconcileSpacePlanSubscription -> seatQuantityFromItems) reconciles spaces.seat_quantity, so this is
// the WRITE half of the same seat model the checkout picker (#1874) sets at purchase time.
//
// SAFETY: this ONLY ever touches the operator_seat item (found by its reconciled item key). The base
// plan item and every add-on are never read for mutation, so a seat change can never drop the plan. It
// is GATED on billingLive() AND operatorSeatsSellable() (the seat is activated + priced) AND the Space
// having a live subscription, so while billing is OFF / seats are inactive it is a clean no-op error and
// no Stripe call is made. Server-only. Owner authz is delegated to the caller (the owner-gated action).

import Stripe from 'stripe'
import { stripe } from './stripe'
import { createAdminClient } from '@/lib/supabase/admin'
import { billingLive } from '@/lib/pricing/settings'
import { resolveStripePriceId } from './pricing-prices'
import { catalogPriceKey, type BillingInterval } from './pricing-keys'
import { reconciledItemsFromSubscription } from './space-subscription-items'
import { operatorSeatsSellable } from './space-plan-checkout'

/** The largest licensed operator-seat count this editor will set in one change (mirrors the checkout
 *  picker's bound; a sane ceiling, not a plan limit). */
export const MAX_OPERATOR_SEATS = 25

/** The Stripe mutation needed to reach a target seat count given the CURRENT operator_seat item. PURE. */
export type SeatChange =
  | { kind: 'noop' }
  | { kind: 'add'; quantity: number }
  | { kind: 'update'; itemId: string; quantity: number }
  | { kind: 'remove'; itemId: string }

/** Decide the seat mutation. PURE + unit-tested — the single place the add/update/remove/noop logic lives:
 *   • no current item  -> `add` (target > 0) or `noop` (target 0).
 *   • current item, target 0 -> `remove` (Stripe has no quantity-0 item; the line is deleted).
 *   • current item, target == quantity -> `noop`.
 *   • otherwise -> `update` to the new quantity.
 *  `targetSeats` is floored to a non-negative int here so a garbage input can never mutate to a bad qty. */
export function resolveSeatChange(
  current: { itemId: string | null; quantity: number } | null,
  targetSeats: number,
): SeatChange {
  const target = Math.max(0, Math.floor(Number.isFinite(targetSeats) ? targetSeats : 0))
  if (!current || !current.itemId) {
    return target > 0 ? { kind: 'add', quantity: target } : { kind: 'noop' }
  }
  if (target === 0) return { kind: 'remove', itemId: current.itemId }
  if (target === Math.max(0, Math.floor(current.quantity))) return { kind: 'noop' }
  return { kind: 'update', itemId: current.itemId, quantity: target }
}

/** The result of a seat change: the target that was applied, or a clean error string. */
export type UpdateSeatsResult = { ok: true; seats: number } | { ok: false; error: string }

/**
 * Set a paying Space's licensed operator-seat count to `targetSeats` (clamped 0..MAX_OPERATOR_SEATS) by
 * mutating ONLY the operator_seat item on its live Stripe subscription, with proration. GATED, in order:
 *   • no Stripe / not billingLive() / seats not sellable -> clean error, NO Stripe call (ADR-362 invariant).
 *   • the Space has no stored subscription -> clean error (nothing to change).
 * The webhook reconciles spaces.seat_quantity from the updated subscription; this returns the applied
 * target optimistically. authz-delegated: the caller (the owner-gated action) authorizes the Space.
 */
export async function updateOperatorSeats(spaceId: string, targetSeats: number): Promise<UpdateSeatsResult> {
  if (!stripe) return { ok: false, error: 'Billing is not configured.' }
  if (!(await billingLive())) return { ok: false, error: 'Billing is not live yet.' }
  if (!(await operatorSeatsSellable())) return { ok: false, error: 'Operator seats are not available yet.' }

  const target = Math.max(0, Math.min(MAX_OPERATOR_SEATS, Math.floor(Number.isFinite(targetSeats) ? targetSeats : 0)))

  const { data: space } = (await createAdminClient()
    .from('spaces')
    .select('stripe_subscription_id')
    .eq('id', spaceId)
    .maybeSingle()) as { data: { stripe_subscription_id?: string | null } | null }
  const subId = space?.stripe_subscription_id
  if (!subId) return { ok: false, error: 'This space has no active subscription to change.' }

  let sub: Stripe.Subscription
  try {
    sub = await stripe.subscriptions.retrieve(subId)
  } catch {
    return { ok: false, error: 'We could not load your subscription. Please try again.' }
  }

  const items = reconciledItemsFromSubscription(sub)
  const seatItem = items.find((i) => i.itemKey === 'operator_seat') ?? null
  const change = resolveSeatChange(
    seatItem ? { itemId: seatItem.stripeSubscriptionItemId, quantity: seatItem.quantity } : null,
    target,
  )
  // A new seat item must bill on the SAME interval as the subscription (Stripe bills one interval per
  // subscription), so read it off any existing item; fall back to monthly.
  const interval: BillingInterval = seatItem?.interval ?? items[0]?.interval ?? 'month'

  try {
    switch (change.kind) {
      case 'noop':
        return { ok: true, seats: target }
      case 'update':
        await stripe.subscriptionItems.update(change.itemId, {
          quantity: change.quantity,
          proration_behavior: 'create_prorations',
        })
        break
      case 'remove':
        await stripe.subscriptionItems.del(change.itemId, { proration_behavior: 'create_prorations' })
        break
      case 'add': {
        const priceId = await resolveStripePriceId(catalogPriceKey('operator_seat', interval, false))
        if (!priceId) return { ok: false, error: 'Seat pricing is not synced yet.' }
        await stripe.subscriptionItems.create({
          subscription: subId,
          price: priceId,
          quantity: change.quantity,
          proration_behavior: 'create_prorations',
        })
        break
      }
    }
  } catch {
    return { ok: false, error: 'We could not update your seats. Please try again.' }
  }
  return { ok: true, seats: target }
}
