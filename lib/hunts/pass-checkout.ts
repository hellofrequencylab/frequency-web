/**
 * The Experience Pass purchase snapshot (FH-036S): what createTicketCheckout calls for a bound tier.
 *
 * Two steps, both inside the real ticket checkout (lib/billing/tickets.ts) and both dark until
 * HUNTS_COMMERCE_ENABLED is on:
 *
 *  1. `beginPassCheckout`, before any Stripe session exists. It resolves the purchase through the frozen
 *     binding (lib/hunts/pass-gate.ts, `resolvePurchase`): a wrong tier or Event, a retired binding, a sold
 *     out tier and a closed sales switch are refused here, and the price it returns is the tier's own. The
 *     browser's price is never an input.
 *  2. `storePassPurchase`, once the seat is reserved. It writes the snapshot onto the ticket's own row
 *     (`event_tickets.hunt_pass`), together with what the checkout really charged. A sale whose snapshot
 *     cannot be stored is not sold: the caller expires the session.
 *
 * Settlement reads the snapshot back and checks it against the settled ticket before a benefit is projected
 * (`verifySettledPurchase`, called from lib/hunts/commerce-store.ts `projectTicketBenefits`). A ticket with
 * no snapshot was not bought as a pass and projects nothing.
 */
import { db } from './commerce-store'
import { resolvePassCheckout } from './pass-gate'
import type { ResolvedPurchase, StoredPurchase } from './pass-binding'

type PassCheckoutRequest = Readonly<{ eventId: string; ticketTypeId: string | null; qty: number }>

/** A resolved pass purchase, carried from the gate to the moment the seat is reserved. */
type PassPurchase = Readonly<{ eventId: string; ticketTypeId: string; resolved: ResolvedPurchase }>

/**
 * Step 1. `refusal` is the buyer line for a bound pass the Hunt rules refuse. `purchase` is null for an
 * ordinary ticket, which sells exactly as before.
 */
export async function beginPassCheckout(input: PassCheckoutRequest): Promise<{ refusal: string } | { purchase: PassPurchase | null }> {
  const out = await resolvePassCheckout(input)
  if ('refusal' in out) return out
  if (!out.purchase || !input.ticketTypeId) return { purchase: null }
  return { purchase: { eventId: input.eventId, ticketTypeId: input.ticketTypeId, resolved: out.purchase } }
}

/** The record the ticket keeps. Pure, so the stored shape is the tested shape. */
export function passPurchaseRecord(purchase: PassPurchase, chargedCents: number): StoredPurchase {
  const r = purchase.resolved
  return {
    v: 1,
    snapshot: r.snapshot,
    eventId: purchase.eventId,
    ticketTypeId: purchase.ticketTypeId,
    qty: r.qty,
    unitCents: r.unitCents,
    totalCents: r.totalCents,
    chargedCents,
    currency: r.currency,
  }
}

/**
 * Step 2. Write the snapshot onto the pending ticket this checkout session reserved. False when it could not
 * be stored (or the charge is not one a pass allows), and the caller then refuses the sale: a pass sold
 * without its snapshot could never be told apart from an ordinary ticket at settlement.
 */
export async function storePassPurchase(sessionId: string, purchase: PassPurchase, chargedCents: number): Promise<boolean> {
  if (!Number.isInteger(chargedCents) || chargedCents <= 0 || chargedCents > purchase.resolved.totalCents) return false
  try {
    const { data, error } = await db()
      .from('event_tickets')
      .update({ hunt_pass: passPurchaseRecord(purchase, chargedCents) })
      .eq('stripe_checkout_session_id', sessionId)
      .eq('status', 'pending')
      .select('id')
    if (error) {
      console.error('[hunts-commerce] purchase snapshot was not stored', error.message)
      return false
    }
    return Array.isArray(data) && data.length === 1
  } catch (err) {
    console.error('[hunts-commerce] purchase snapshot was not stored', err)
    return false
  }
}
