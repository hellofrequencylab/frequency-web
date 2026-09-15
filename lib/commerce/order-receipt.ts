// THE ORDER RECEIPT AND THE SALE NOTICE (LIVE-344). Both halves of a paid commerce order.
//
// Until this existed `recordCommerceOrderFromSession` flipped the order to `paid`, decremented
// stock, booked the ledger row and confirmed any held booking, and then stopped. The buyer got
// nothing: no record of what they bought, no total, no address to reply to. The seller got nothing
// either, so the only signal that an order needed fulfilling was somebody happening to open the Shop
// console. There are exactly two people in an order and neither was told.
//
// ── SAME QUARANTINE AS THE TICKET RECEIPTS ───────────────────────────────────────────────────────
// Composing these messages needs the order's line items, the seller's name and the buyer's account
// address, none of which the Stripe webhook otherwise reads. All of it lives here, the settle calls
// this fire-and-forget, and nothing read here is returned to any caller.
//
// IDEMPOTENCY IS THE CALLER'S: the settle only reaches here for a row THIS delivery flipped
// `pending` -> `paid`, so a redelivered webhook flips nothing and sends nothing.
//
// A PLATFORM order has no seller to notify. Frequency is the merchant on `owner_kind: 'platform'`
// (the Frequency Store), so only the buyer half runs; there is no operator waiting on a bell for a
// first-party sale.

import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { appUrl } from '@/lib/billing/stripe'
import {
  notifyEarner,
  receiptAmount,
  receiptDate,
  sendMoneyReceipt,
  spaceReceiptTarget,
  displayNameFor,
  type ReceiptLine,
} from '@/lib/billing/receipt-email'

const LOG = '[commerce receipt]'

/** The `notifications.type` a seller's sale notice carries. */
export const ORDER_SOLD_NOTIFICATION_TYPE = 'commerce_order_sold'

/** The settled order, as the webhook already holds it. Everything else is read here. */
export interface SettledOrder {
  id: string
  ownerKind: 'platform' | 'profile' | 'space'
  ownerProfileId: string | null
  ownerSpaceId: string | null
  buyerProfileId: string | null
  amountCents: number
  currency: string | null
  /** The address Stripe collected, used when the buyer has no account to resolve one from. */
  buyerEmail?: string | null
}

/** "Two mugs, One print", or null when the items cannot be read. Best-effort: a missing list costs a
 *  line in the receipt, never the receipt. */
async function orderItemSummary(orderId: string): Promise<{ summary: string | null; first: string | null }> {
  try {
    const { data, error } = await createAdminClient()
      .from('commerce_order_items')
      .select('title, qty')
      .eq('order_id', orderId)
    if (error) {
      console.warn(`${LOG} order items unreadable`, { orderId, error: error.message })
      return { summary: null, first: null }
    }
    const rows = (data ?? []) as { title: string | null; qty: number | null }[]
    const parts = rows
      .map((r) => {
        const title = (r.title ?? '').trim()
        if (!title) return null
        const qty = typeof r.qty === 'number' && r.qty > 1 ? ` x${r.qty}` : ''
        return `${title}${qty}`
      })
      .filter((p): p is string => !!p)
    return { summary: parts.length ? parts.join(', ') : null, first: (rows[0]?.title ?? '').trim() || null }
  } catch (err) {
    console.warn(`${LOG} order items threw`, { orderId, err })
    return { summary: null, first: null }
  }
}

/** Who the money went to, by name, and where that seller manages their orders. */
async function resolveSeller(order: SettledOrder): Promise<{
  profileId: string | null
  name: string
  /** The Space's slug when a Space sold it, else null: the bell row's address. */
  spaceSlug: string | null
  consoleUrl: string
} | null> {
  if (order.ownerKind === 'platform') return null
  if (order.ownerKind === 'space' && order.ownerSpaceId) {
    const space = await spaceReceiptTarget(order.ownerSpaceId)
    if (!space) return null
    return {
      profileId: space.ownerProfileId,
      name: space.name,
      spaceSlug: space.slug,
      consoleUrl: `${appUrl()}/spaces/${space.slug}/settings/shop`,
    }
  }
  if (order.ownerKind === 'profile' && order.ownerProfileId) {
    return {
      profileId: order.ownerProfileId,
      name: (await displayNameFor(order.ownerProfileId)) ?? 'the seller',
      spaceSlug: null,
      consoleUrl: `${appUrl()}/market/manage`,
    }
  }
  return null
}

/**
 * Tell the buyer what they bought, and tell the seller they sold it.
 *
 * BEST-EFFORT ON EVERY PATH: it runs from the Stripe webhook's settle, after the order is already
 * `paid`. Every failure is logged. Resolves void on every path.
 */
export async function sendOrderReceipts(order: SettledOrder): Promise<void> {
  try {
    const amount = receiptAmount(order.amountCents, order.currency)
    const { summary, first } = await orderItemSummary(order.id)
    const seller = await resolveSeller(order)
    const sellerName = seller?.name ?? 'Frequency'
    const when = receiptDate()

    // ── The buyer's receipt ──────────────────────────────────────────────────────────────────
    const buyerLines: ReceiptLine[] = [
      { label: 'Order', value: summary ?? '' },
      { label: 'Total', value: amount ?? '' },
      { label: 'Seller', value: sellerName },
      { label: 'Date', value: when },
    ]
    await sendMoneyReceipt({
      to: order.buyerEmail ?? null,
      profileId: order.buyerProfileId,
      subject: first ? `Your order: ${first}` : `Your order from ${sellerName}`,
      content: {
        greetingName: await displayNameFor(order.buyerProfileId),
        lead: amount
          ? `Your order from ${sellerName} is paid, ${amount} in total.`
          : `Your order from ${sellerName} is paid.`,
        lines: buyerLines,
        closing: [
          `${sellerName} can see the order now and will send it on.`,
          'My orders keeps every purchase you make on Frequency, with the seller and the total.',
        ],
        actionLabel: 'See my orders',
        actionUrl: `${appUrl()}/orders`,
      },
      logTag: LOG,
      context: { orderId: order.id, side: 'buyer' },
    })

    // ── The seller's notice ──────────────────────────────────────────────────────────────────
    // A first-party Frequency Store order has no operator waiting on it, so there is nobody here.
    if (!seller?.profileId) {
      if (order.ownerKind !== 'platform') {
        console.error(`${LOG} no seller to notify for a paid order`, {
          orderId: order.id,
          ownerKind: order.ownerKind,
        })
      }
      return
    }
    const buyerName = (await displayNameFor(order.buyerProfileId)) ?? 'Someone'
    const soldLabel = summary ?? 'an item'
    await notifyEarner({
      recipientProfileId: seller.profileId,
      actorProfileId: order.buyerProfileId,
      type: ORDER_SOLD_NOTIFICATION_TYPE,
      // A Space's shop notice addresses the Space by slug; a member seller's addresses the buyer,
      // which is the only profile a bell row on this path can route to.
      referenceType: seller.spaceSlug ? 'space' : 'profile',
      referenceId: seller.spaceSlug ?? order.buyerProfileId,
      bellBody: amount ? `bought ${soldLabel} for ${amount}` : `bought ${soldLabel}`,
      bellBodyNoActor: amount ? `Someone bought ${soldLabel} for ${amount}` : `Someone bought ${soldLabel}`,
      subject: `You sold ${soldLabel}`,
      content: {
        greetingName: await displayNameFor(seller.profileId),
        lead: amount
          ? `${buyerName} bought ${soldLabel} for ${amount}.`
          : `${buyerName} bought ${soldLabel}.`,
        lines: [
          { label: 'Order', value: summary ?? '' },
          { label: 'Total', value: amount ?? '' },
          { label: 'Buyer', value: buyerName },
          { label: 'Date', value: when },
        ],
        closing: [
          'The money goes to your payout account on your usual payout schedule.',
          'Open Orders to see the shipping details and mark it sent.',
        ],
        actionLabel: 'Open Orders',
        actionUrl: seller.consoleUrl,
      },
      logTag: LOG,
      context: { orderId: order.id, side: 'seller' },
    })
  } catch (err) {
    console.error(`${LOG} order receipts failed`, { orderId: order.id, err })
  }
}
