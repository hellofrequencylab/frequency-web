'use server'

import { revalidatePath } from 'next/cache'
import { getMyProfileId } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { openDispute, getLiveDisputeForOrder, setDisputeStatus } from '@/lib/commerce/disputes'
import { type ActionResult, ok, fail } from '@/lib/action-result'

// Trust & Safety (Phase 8): a buyer opens (or withdraws) a dispute / refund request on their own
// order. It records into commerce_disputes for the operator + seller queue. No money moves here;
// resolving a dispute to a refund is an operator action (refundCommerceOrder, gated by payoutsLive).

/** Confirm the order exists and belongs to the caller. Returns the order status, or null. */
async function assertBuyerOrder(orderId: string, profileId: string): Promise<{ status: string } | null> {
  const { data } = await createAdminClient()
    .from('commerce_orders')
    .select('id, buyer_profile_id, status')
    .eq('id', orderId)
    .maybeSingle()
  const order = data as { buyer_profile_id: string | null; status: string } | null
  if (!order || order.buyer_profile_id !== profileId) return null
  return { status: order.status }
}

export async function openDisputeAction(
  orderId: string,
  input: { reason: string; detail?: string },
): Promise<ActionResult> {
  const profileId = await getMyProfileId()
  if (!profileId) return fail('Sign in to open a dispute.')
  if (!input.reason?.trim()) return fail('Pick a reason.')

  const order = await assertBuyerOrder(orderId, profileId)
  if (!order) return fail('That order is not available.')
  // A pending checkout that was never completed is not a purchase to dispute.
  if (order.status === 'pending') return fail('This order is not complete yet.')

  const existing = await getLiveDisputeForOrder(orderId)
  if (existing) return fail('You already have an open dispute on this order.')

  const id = await openDispute({ orderId, openerProfileId: profileId, reason: input.reason, detail: input.detail })
  if (!id) return fail('Could not open the dispute. Try again.')

  revalidatePath('/orders')
  return ok()
}

/** Withdraw a dispute the buyer opened (only while it is still live). */
export async function cancelDisputeAction(disputeId: string): Promise<ActionResult> {
  const profileId = await getMyProfileId()
  if (!profileId) return fail('Sign in first.')

  // Ownership + liveness check through the admin client (the buyer owns this dispute).
  const { data } = await createAdminClient()
    .from('commerce_disputes')
    .select('id, opener_profile_id, status')
    .eq('id', disputeId)
    .maybeSingle()
  const dispute = data as { opener_profile_id: string | null; status: string } | null
  if (!dispute || dispute.opener_profile_id !== profileId) return fail('That dispute is not available.')
  if (dispute.status !== 'open' && dispute.status !== 'reviewing') return fail('This dispute is already resolved.')

  try {
    await setDisputeStatus(disputeId, 'cancelled', { resolvedBy: profileId, resolutionNote: 'Withdrawn by the buyer.' })
  } catch {
    return fail('Could not withdraw the dispute. Try again.')
  }
  revalidatePath('/orders')
  return ok()
}
