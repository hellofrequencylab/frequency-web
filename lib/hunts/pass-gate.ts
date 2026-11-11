/**
 * The Experience Pass at ticket checkout (FH-036S): the gate createTicketCheckout calls for a bound tier,
 * and the sales kill switch.
 *
 * The ticket path already prices from the canonical tier and ignores a browser price for a fixed tier. This
 * adds the Hunt rules on top, only for a tier that has an active binding and only when
 * HUNTS_COMMERCE_ENABLED is on: the binding must still be active, the tier must be a fixed-price paid tier
 * of the bound Event and seller, and the kill switch must be open. A tier with no binding is untouched.
 * Closing the switch stops NEW sales only: payment, refund and reconciliation go on.
 */
import { activeBindingForTier, db } from './commerce-store'
import { huntSwitchOn } from './flags'
import { resolvePurchase, type CanonicalTier, type PassBinding, type PurchaseRefusal } from './pass-binding'

const MESSAGE: Record<PurchaseRefusal, string> = {
  commerce_paused: 'This pass is not on sale right now.',
  binding_retired: 'This pass is no longer available.',
  tier_mismatch: 'That ticket type isn’t available.',
  event_mismatch: 'That ticket type isn’t available.',
  seller_mismatch: 'That ticket type isn’t available.',
  tier_not_paid: 'That ticket type isn’t available.',
  bad_quantity: 'Choose between 1 and 10 tickets for this pass.',
  sales_closed: 'Sales for this ticket have closed.',
  sold_out: 'This ticket type is sold out.',
}

/** The buyer-facing line for a refusal. Never names a binding, a Hunt or a price rule. */
function passRefusalMessage(reason: PurchaseRefusal): string {
  return MESSAGE[reason] ?? 'That ticket type isn’t available.'
}

/**
 * Decide a purchase through a binding. Pure: the browser's price, tier and Event are never inputs, only the
 * ids it asked for, which must match the canonical binding.
 */
export function decidePassCheckout(
  binding: PassBinding | null,
  tier: CanonicalTier,
  request: Readonly<{ eventId: string; ticketTypeId: string; qty: number }>,
  commerceOpen: boolean,
): { ok: true } | { ok: false; error: string } {
  if (!binding) return { ok: true }
  const r = resolvePurchase(binding, tier, request, commerceOpen)
  return r.ok ? { ok: true } : { ok: false, error: passRefusalMessage(r.reason) }
}

type TierRow = {
  id: string
  event_id: string
  pricing_mode: CanonicalTier['pricingMode']
  price_cents: number | null
  quantity: number | null
  sold: number
}

/** Is this Hunt sales switch open? Reads the single state row; a missing row reads as open (the seeded default). */
export async function commerceSalesOpen(): Promise<boolean> {
  const { data } = await db().from('hunt_commerce_state').select('sales_open').eq('id', true).maybeSingle()
  return (data as { sales_open: boolean } | null)?.sales_open ?? true
}

/**
 * The checkout gate. Returns an error string only when the tier is a bound pass and the Hunt rules refuse
 * it. A failure to READ is not a refusal: an unbound or unreadable tier sells as the ticket path always did,
 * because the Hunt layer must never become a reason a normal ticket cannot be bought.
 */
export async function passCheckoutGate(input: Readonly<{ eventId: string; ticketTypeId: string | null; qty: number }>): Promise<string | null> {
  if (!huntSwitchOn('commerce') || !input.ticketTypeId) return null
  try {
    const binding = await activeBindingForTier(input.ticketTypeId)
    if (!binding) return null
    const { data: t } = await db()
      .from('event_ticket_types')
      .select('id, event_id, pricing_mode, price_cents, quantity, sold')
      .eq('id', input.ticketTypeId)
      .maybeSingle()
    const tier = t as TierRow | null
    if (!tier) return null
    const { data: ev } = await db().from('events').select('space_id, host_space_id').eq('id', tier.event_id).maybeSingle()
    const evRow = ev as { space_id: string | null; host_space_id: string | null } | null
    const sellerSpaceId = evRow?.host_space_id || evRow?.space_id || ''
    const canonical: CanonicalTier = {
      id: tier.id,
      eventId: tier.event_id,
      sellerSpaceId,
      pricingMode: tier.pricing_mode,
      priceCents: tier.price_cents,
      currency: 'usd', // tickets sell in USD today (createTicketCheckout)
      quantity: tier.quantity,
      sold: tier.sold,
      // The ticket path owns the sales window and the active flag and refuses first; the pass adds the rest.
      salesOpen: true,
    }
    const out = decidePassCheckout(binding, canonical, { eventId: input.eventId, ticketTypeId: input.ticketTypeId, qty: input.qty }, await commerceSalesOpen())
    return out.ok ? null : out.error
  } catch (err) {
    console.error('[hunts-commerce] pass gate could not read; selling as a normal ticket', err)
    return null
  }
}

/** Close or reopen new Hunt sales. Closing needs a reason (the SQL refuses without one) and is audited. */
export async function setHuntSales(open: boolean, actorProfileId: string, reason: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await db().rpc('hunt_commerce_set_sales', { p_open: open, p_actor: actorProfileId, p_reason: reason.trim().slice(0, 300) })
  return error ? { ok: false, error: error.message } : { ok: true }
}
