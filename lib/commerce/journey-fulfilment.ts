// GRANTING (AND REVOKING) JOURNEY ACCESS FROM AN ORDER (ADR-1397). Server-only.
//
// Required paid recovery callers propagate errors so the same verified session can retry.
// Ordinary claim callers remain fail-soft. The paid adoption RPC grants both the lesson
// permission and enrollment/provenance atomically under the refunded-order writer's lock.
//
// 🔴 SEATS ARE NOT ENFORCED HERE, ON PURPOSE. A seat check at fulfilment can only refuse a buyer who
// has already paid, which strands them: charged, no access, and a refund they have to ask for. The
// cap is enforced at checkout START (lib/journeys/checkout.ts), where refusing costs nothing. If a
// race puts one buyer over the cap anyway, they get their seat and the oversell is LOGGED — the same
// call the stock decrement already makes, for the same reason.

import { createAdminClient } from '@/lib/supabase/admin'
import { adoptPlan } from '@/lib/journey-plans'
import { journeySlugsByPlanId } from '@/lib/journeys/paid'

/** The untyped handle: `commerce_products.journey_plan_id` and `journey_enrollments.order_id` are not
 *  in the generated types until `lib/database.types.ts` regenerates (ADR-246). Scoped to this module. */
function db() {
  return createAdminClient() as unknown as {
    from: (table: string) => any // eslint-disable-line @typescript-eslint/no-explicit-any
    rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: boolean | null; error: { message: string } | null }>
  }
}

/** The Journeys an order bought, with the buyer. Empty for an order that bought no Journey. */
/** The distinct Journey plan ids an order's lines sell, through the product join. */
async function planIdsInOrder(orderId: string, strict = false): Promise<string[]> {
  const { data: items, error } = await db()
    .from('commerce_order_items')
    .select('product_id, product:commerce_products!product_id ( journey_plan_id )')
    .eq('order_id', orderId)
  if (error && strict) throw error
  return [
    ...new Set(
      ((items ?? []) as { product: { journey_plan_id: string | null } | null }[])
        .map((r) => r.product?.journey_plan_id ?? null)
        .filter((id): id is string => !!id),
    ),
  ]
}

async function journeysInOrder(orderId: string, strict = false): Promise<{ buyerId: string; planIds: string[] }> {
  const { data: order, error } = await db()
    .from('commerce_orders')
    .select('buyer_profile_id')
    .eq('id', orderId)
    .maybeSingle()
  if (error && strict) throw error
  if (!order && strict) throw new Error('Paid order not found')
  const buyerId = (order as { buyer_profile_id: string | null } | null)?.buyer_profile_id ?? null
  if (!buyerId) return { buyerId: '', planIds: [] }
  return { buyerId, planIds: await planIdsInOrder(orderId, strict) }
}

/**
 * The slugs of the Journeys an order bought, in line order, or [] for an order that bought none.
 *
 * The welcome (PROG-GD5) is keyed on the Journey, not the order: the receipt's button, the guest's
 * Stripe return and the sign-in landing all need "which Journey did this order buy" and nothing
 * else about it. Fail-soft to [] on every error, because every caller has a non-Journey fallback
 * and none of them may fail a receipt, a sign-in or a settle over a slug.
 */
export async function journeySlugsForOrder(orderId: string): Promise<string[]> {
  try {
    const planIds = await planIdsInOrder(orderId)
    if (planIds.length === 0) return []
    const slugs = await journeySlugsByPlanId(planIds)
    return planIds.map((id) => slugs.get(id)).filter((s): s is string => !!s)
  } catch (error) {
    console.error('[commerce] journey slugs for order failed', { orderId, error })
    return []
  }
}

/**
 * Enrol the buyer through canonical paid adoption. Access and immutable order provenance
 * commit atomically; existing unrelated access is preserved. No-op for a non-Journey order.
 */
export async function enrolByOrder(orderId: string, opts?: { strict?: boolean }): Promise<void> {
  try {
    const { buyerId, planIds } = await journeysInOrder(orderId, opts?.strict)
    if (!buyerId || planIds.length === 0) return
    for (const planId of planIds) {
      // The canonical paid option atomically grants BOTH the lesson adoption and
      // enrollment/provenance under the same order lock used by the full refund.
      await adoptPlan(buyerId, planId, { strict: true, paidOrderId: orderId })
    }
  } catch (error) {
    if (opts?.strict) throw error
    // The order is already paid and settled. Log and leave it: an operator can re-run fulfilment,
    // and a throw here would redeliver the webhook and re-charge nothing but attention.
    console.error('[commerce] journey enrolment failed', { orderId, error })
  }
}

/**
 * Revoke the access a now-refunded order granted. Deletes only enrolments this order paid for
 * (`order_id` match) and only ones still in progress — a FINISHED Journey is not un-finished by a
 * refund, because the completion, its trophy and its rewards already happened and clawing them back
 * would corrupt a member's record to settle a billing question.
 */
export async function revokeJourneyByOrder(orderId: string, opts?: { strict?: boolean }): Promise<void> {
  try {
    const { data, error } = await db().rpc('revoke_refunded_commerce_journeys', { _order: orderId })
    if (error && opts?.strict) throw error
    if (!error && data !== true && opts?.strict) throw new Error('Refunded Journey revoke was refused')
    if (error) {
      console.error('[commerce] journey revoke failed', { orderId, error: error.message })
    }
  } catch (error) {
    if (opts?.strict) throw error
    console.error('[commerce] journey revoke failed', { orderId, error })
  }
}
