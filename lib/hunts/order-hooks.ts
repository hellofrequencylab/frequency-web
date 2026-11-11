/**
 * Store-order call sites for Hunt benefits (FH-038S): the order settlement and refund paths reach the money
 * store only through here. Same two rules as lib/hunts/commerce-hooks.ts: best effort (a failure never fails
 * settlement) and never silent (a failure is logged under a stable prefix the log drain alerts on).
 *
 * The store owns the sale. A line qualifies only when it matches an approved offer on the exact product and
 * variant sold by the offer's seller, so an ordinary line on a mixed order creates nothing, and a
 * quantity-two bound line gives two benefits under two unit keys (`<line id>:<n>`), replay-safe.
 */
import type Stripe from 'stripe'
import { db, huntRpc } from './commerce-store'
import { guarded, reversalForCharge, reversalForDispute } from './commerce-hooks'
import { projectPlan } from './entitlements'
import { applyReversal } from './refunds'
import { huntSwitchOn } from './flags'
import { planOrderProjection, type OrderSource, type StoreOffer } from './merch'

type OrderRow = { id: string; status: OrderSource['status']; owner_space_id: string | null; buyer_profile_id: string | null }
type ItemRow = { id: string; product_id: string | null; variant_id: string | null; qty: number }
type OfferRow = {
  id: string
  hunt_id: string
  seller_space_id: string
  product_id: string
  variant_id: string | null
  benefit_code: string | null
  requires_state: StoreOffer['requiresState']
  status: StoreOffer['status']
}

/** Map the canonical rows to the pure planner's input. Exported for the replay tests. */
function toOrderSource(order: OrderRow, items: readonly ItemRow[]): OrderSource {
  return {
    kind: 'store-order',
    id: order.id,
    status: order.status,
    ownerSpaceId: order.owner_space_id,
    buyerProfileId: order.buyer_profile_id,
    lines: items.map((i) => ({ id: i.id, productId: i.product_id, variantId: i.variant_id, qty: i.qty })),
  }
}

function toStoreOffer(r: OfferRow): StoreOffer {
  return {
    id: r.id,
    huntId: r.hunt_id,
    sellerSpaceId: r.seller_space_id,
    productId: r.product_id,
    variantId: r.variant_id,
    benefitCode: r.benefit_code,
    requiresState: r.requires_state,
    status: r.status,
  }
}

async function orderBy(column: 'stripe_checkout_session_id' | 'stripe_payment_intent_id', value: string): Promise<OrderRow | null> {
  const { data } = await db().from('commerce_orders').select('id, status, owner_space_id, buyer_profile_id').eq(column, value).maybeSingle()
  return (data as OrderRow | null) ?? null
}

/** Project the benefits of one settled order. Safe to repeat from the webhook, the return and a repair. */
async function projectOrderBenefits(orderId: string): Promise<{ created: number; units: number } | null> {
  const { data: o } = await db().from('commerce_orders').select('id, status, owner_space_id, buyer_profile_id').eq('id', orderId).maybeSingle()
  const order = o as OrderRow | null
  if (!order) return null
  const { data: it } = await db().from('commerce_order_items').select('id, product_id, variant_id, qty').eq('order_id', orderId)
  const items = (it as ItemRow[] | null) ?? []
  const productIds = [...new Set(items.map((i) => i.product_id).filter((p): p is string => !!p))]
  if (productIds.length === 0) return { created: 0, units: 0 }
  const { data: of } = await db()
    .from('hunt_store_offers')
    .select('id, hunt_id, seller_space_id, product_id, variant_id, benefit_code, requires_state, status')
    .eq('status', 'approved')
    .in('product_id', productIds)
  const offers = ((of as OfferRow[] | null) ?? []).map(toStoreOffer)
  if (offers.length === 0) return { created: 0, units: 0 }
  const plan = planOrderProjection(toOrderSource(order, items), offers)
  if (!plan.ok) return { created: 0, units: 0 }
  const { summary } = await projectPlan(huntRpc, plan)
  return { created: summary.created, units: plan.units.length }
}

const note = (orderId: string) => async (message: string) => {
  console.error(`[hunts-commerce] order ${orderId} hook failed: ${message}`)
}

/** After a paid session settled a commerce order. Best effort, dark until HUNTS_COMMERCE_ENABLED. */
export async function huntsAfterOrderSession(sessionId: string): Promise<void> {
  if (!huntSwitchOn('commerce')) return
  const order = await orderBy('stripe_checkout_session_id', sessionId).catch(() => null)
  if (!order) return
  await guarded('order-projection', async () => { await projectOrderBenefits(order.id) }, note(order.id))
}

/** A refunded charge on an order: revoke the whole order's unused benefits, or open a review case. */
export async function huntsAfterOrderRefund(charge: Stripe.Charge): Promise<void> {
  if (!huntSwitchOn('commerce')) return
  const pi = typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id
  if (!pi) return
  const order = await orderBy('stripe_payment_intent_id', pi).catch(() => null)
  if (!order) return
  await guarded('order-refund', async () => {
    const decision = reversalForCharge(charge)
    if (!decision) return
    await applyOrderReversal(order.id, decision)
  }, note(order.id))
}

/** A lost dispute on an order's charge revokes; a won one restores only while the order is still paid. */
export async function huntsAfterOrderDispute(dispute: Stripe.Dispute): Promise<void> {
  if (!huntSwitchOn('commerce')) return
  const pi = typeof dispute.payment_intent === 'string' ? dispute.payment_intent : dispute.payment_intent?.id
  if (!pi) return
  const order = await orderBy('stripe_payment_intent_id', pi).catch(() => null)
  if (!order) return
  await guarded('order-dispute', async () => {
    const decision = reversalForDispute(dispute, order.status === 'paid' || order.status === 'fulfilled')
    if (decision) await applyOrderReversal(order.id, decision)
  }, note(order.id))
}

async function applyOrderReversal(orderId: string, decision: NonNullable<ReturnType<typeof reversalForCharge>>): Promise<void> {
  await applyReversal(huntRpc, { type: 'store-order', id: orderId }, decision)
}
