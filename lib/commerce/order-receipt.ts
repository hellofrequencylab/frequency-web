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

//
// A SPLIT order (owner_kind 'split', funds_flow 'separate', LIVE-621) names no single seller on the
// order row, and until LIVE-706 that sent the buyer a receipt naming Frequency as the seller who "will
// send it on" (false: each seller ships their own lines) and told no seller at all. Now it has its own
// half, `sendSplitOrderReceipts`: the buyer's receipt lists the lines grouped by seller, each under
// the seller's name, and every seller with a row in `commerce_order_transfers` (LIVE-622, planned by
// the same settle just before this runs) gets the sale notice for their share only: their lines,
// their gross, the network fee, and their net. The idempotency is unchanged: the same settle flip,
// so a second settle or a redelivered webhook sends nothing twice. A single-seller order never
// reaches the split half and behaves exactly as before.

import 'server-only'

import type { OrderOwnerKind } from './types'
import { sellerKey } from './funds-flow'
import { listOrderTransfers, type OrderTransfer } from './transfers'
import { createAdminClient } from '@/lib/supabase/admin'
import { appUrl } from '@/lib/billing/stripe'
import { journeyWelcomeDoor } from '@/lib/journeys/sales-path'
import { journeySlugsForOrder } from './journey-fulfilment'
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
  ownerKind: OrderOwnerKind
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
  // A split order has its own half (LIVE-706). Everything below this line is the single-seller path,
  // unchanged.
  if (order.ownerKind === 'split') return sendSplitOrderReceipts(order)
  try {
    const amount = receiptAmount(order.amountCents, order.currency)
    const { summary, first } = await orderItemSummary(order.id)
    const seller = await resolveSeller(order)
    const sellerName = seller?.name ?? 'Frequency'
    const when = receiptDate()
    // THE WELCOME (PROG-GD5). A Journey is not "sent on"; it opens. Its button is the Journey's
    // welcome through the sign-in door, which a signed-in member passes straight through and a
    // guest goes through once, with the address that paid prefilled: the magic-link tap is the
    // proof (ADR-854), and the same door the guest's Stripe return uses. Fail-soft to [] so an
    // unreadable slug costs the Journey framing, never the receipt.
    const [journeySlug] = await journeySlugsForOrder(order.id)

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
        closing: journeySlug
          ? [
              order.buyerProfileId
                ? 'The Journey is yours now. Every phase is open, on your own or with people you bring.'
                : 'One step left: sign in with this address and the Journey opens. Every phase is yours, on your own or with people you bring.',
              'My orders keeps every purchase you make on Frequency, with the seller and the total.',
            ]
          : [
              `${sellerName} can see the order now and will send it on.`,
              'My orders keeps every purchase you make on Frequency, with the seller and the total.',
            ],
        actionLabel: journeySlug ? 'Open your Journey' : 'See my orders',
        actionUrl: journeySlug
          ? `${appUrl()}${journeyWelcomeDoor(journeySlug, { email: order.buyerProfileId ? null : order.buyerEmail })}`
          : `${appUrl()}/orders`,
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

// ── THE SPLIT ORDER (LIVE-706) ───────────────────────────────────────────────────────────────────
//
// A cart from more than one seller is one charge on the platform account, and each seller is paid by
// a transfer that follows it (LIVE-621, LIVE-622). So the buyer is owed one receipt that says who is
// sending what, and each seller is owed a notice for their share and nothing else: a seller told the
// whole cart would ship lines that are not theirs and read a total that is not what they receive.
//
// WHO IS NOTIFIED is the transfer ledger's answer, not the items': `commerce_order_transfers` has one
// row per seller the order pays, written by `settleSplitOrderTransfers` in the same settle just
// before this runs. WHICH LINES are theirs is the items' answer: each line's product names its owner,
// keyed exactly as the ledger keys a seller (`sellerKey`). A share whose fee took its whole gross
// has no row (the ledger never plans a zero transfer), so its lines still appear on the buyer's
// receipt and no notice goes; no rung prices a fee that high today.

/** One seller's part of a split order, as the two receipts read it. */
interface SplitPart {
  /** `sellerKey`: kind plus both owner ids, the key the transfer ledger plans on. */
  key: string
  ownerKind: 'profile' | 'space'
  ownerProfileId: string | null
  ownerSpaceId: string | null
  /** "Two mugs x2" per line, in the order they were bought. */
  items: string[]
  /** What the buyer paid for these lines, from the items. Null when no line of theirs was read. */
  itemsCents: number | null
}

type ResolvedSeller = NonNullable<Awaited<ReturnType<typeof resolveSeller>>>

/** "Two mugs x2": the label a receipt line carries. */
function itemLabel(title: string | null, qty: number | null): string | null {
  const t = (title ?? '').trim()
  if (!t) return null
  return typeof qty === 'number' && qty > 1 ? `${t} x${qty}` : t
}

/** "Blue Door", "Blue Door and Grace", "Blue Door, Grace and Oak Hall". */
function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

/** The order's lines grouped by the seller of each product, in the order first bought. A line whose
 *  product can no longer be read lands in `unattributed`, so it is still on the receipt. Best-effort:
 *  unreadable items return no parts, and the ledger's sellers are listed without their lines. */
async function splitOrderParts(orderId: string): Promise<{
  parts: SplitPart[]
  unattributed: string[]
  first: string | null
}> {
  const empty = { parts: [], unattributed: [], first: null }
  try {
    const { data, error } = await createAdminClient()
      .from('commerce_order_items')
      .select('title, qty, subtotal_cents, commerce_products(owner_kind, owner_profile_id, owner_space_id)')
      .eq('order_id', orderId)
    if (error) {
      console.warn(`${LOG} split order items unreadable`, { orderId, error: error.message })
      return empty
    }
    type Owner = { owner_kind: string | null; owner_profile_id: string | null; owner_space_id: string | null }
    const rows = (data ?? []) as unknown as {
      title: string | null
      qty: number | null
      subtotal_cents: number | null
      commerce_products: Owner | Owner[] | null
    }[]
    const parts: SplitPart[] = []
    const unattributed: string[] = []
    for (const r of rows) {
      const label = itemLabel(r.title, r.qty)
      const owner = Array.isArray(r.commerce_products) ? r.commerce_products[0] : r.commerce_products
      const kind = owner?.owner_kind
      if (kind !== 'profile' && kind !== 'space') {
        if (label) unattributed.push(label)
        continue
      }
      const ownerProfileId = owner?.owner_profile_id ?? null
      const ownerSpaceId = owner?.owner_space_id ?? null
      const key = sellerKey({ owner_kind: kind, owner_profile_id: ownerProfileId, owner_space_id: ownerSpaceId })
      let part = parts.find((p) => p.key === key)
      if (!part) {
        part = { key, ownerKind: kind, ownerProfileId, ownerSpaceId, items: [], itemsCents: null }
        parts.push(part)
      }
      if (label) part.items.push(label)
      if (typeof r.subtotal_cents === 'number') part.itemsCents = (part.itemsCents ?? 0) + r.subtotal_cents
    }
    return { parts, unattributed, first: (rows[0]?.title ?? '').trim() || null }
  } catch (err) {
    console.warn(`${LOG} split order items threw`, { orderId, err })
    return empty
  }
}

function transferKey(t: OrderTransfer): string {
  return sellerKey({ owner_kind: t.ownerKind, owner_profile_id: t.ownerProfileId, owner_space_id: t.ownerSpaceId })
}

/**
 * The split order's two halves: one buyer receipt with the lines grouped by seller, then one sale
 * notice per seller the transfer ledger pays, for that seller's share only.
 *
 * Same contract as the single-seller half: best-effort on every path, logs every miss, never throws,
 * and sends only because the settle flipped this row (a replay flips nothing and reaches nothing).
 */
async function sendSplitOrderReceipts(order: SettledOrder): Promise<void> {
  try {
    const amount = receiptAmount(order.amountCents, order.currency)
    const when = receiptDate()
    const { parts, unattributed, first } = await splitOrderParts(order.id)
    const [journeySlug] = await journeySlugsForOrder(order.id)

    // THE LEDGER'S SELLERS. `listOrderTransfers` throws on a database error rather than answer
    // "nobody", and here that costs the seller notices (said loudly), never the buyer's receipt.
    let transfers: OrderTransfer[] | null = null
    try {
      transfers = await listOrderTransfers(order.id)
    } catch (err) {
      console.error(`${LOG} split order transfers unreadable; no seller was notified`, { orderId: order.id, err })
    }
    // A seller the ledger pays whose lines could not be read is still named on the receipt.
    for (const t of transfers ?? []) {
      const key = transferKey(t)
      if (!parts.some((p) => p.key === key)) {
        parts.push({
          key,
          ownerKind: t.ownerKind,
          ownerProfileId: t.ownerProfileId,
          ownerSpaceId: t.ownerSpaceId,
          items: [],
          itemsCents: null,
        })
      }
    }

    // One read per seller, shared by both halves.
    const resolved = new Map<string, Promise<ResolvedSeller | null>>()
    const sellerFor = (p: SplitPart): Promise<ResolvedSeller | null> => {
      let s = resolved.get(p.key)
      if (!s) {
        s = resolveSeller({ ...order, ownerKind: p.ownerKind, ownerProfileId: p.ownerProfileId, ownerSpaceId: p.ownerSpaceId })
        resolved.set(p.key, s)
      }
      return s
    }
    const named = await Promise.all(parts.map(async (part) => ({ part, seller: await sellerFor(part) })))
    const from = named.length ? joinNames(named.map(({ seller }) => seller?.name ?? 'a seller')) : 'more than one seller'

    // ── The buyer's receipt: the lines, grouped under each seller's name ────────────────────────
    const partValue = (part: SplitPart): string => {
      const t = (transfers ?? []).find((x) => transferKey(x) === part.key)
      const price = receiptAmount(part.itemsCents ?? (t ? t.amountCents + t.platformFeeCents : null), order.currency)
      const summary = part.items.join(', ')
      if (summary && price) return `${summary} (${price})`
      return summary || price || ''
    }
    const buyerLines: ReceiptLine[] = [
      ...named.map(({ part, seller }) => ({ label: seller?.name ?? 'Seller', value: partValue(part) })),
      { label: 'Also in this order', value: unattributed.join(', ') },
      { label: 'Total', value: amount ?? '' },
      { label: 'Date', value: when },
    ]
    await sendMoneyReceipt({
      to: order.buyerEmail ?? null,
      profileId: order.buyerProfileId,
      subject: first ? `Your order: ${first}` : `Your order from ${from}`,
      content: {
        greetingName: await displayNameFor(order.buyerProfileId),
        lead: amount ? `Your order from ${from} is paid, ${amount} in total.` : `Your order from ${from} is paid.`,
        lines: buyerLines,
        closing: journeySlug
          ? [
              order.buyerProfileId
                ? 'The Journey is yours now. Every phase is open, on your own or with people you bring.'
                : 'One step left: sign in with this address and the Journey opens. Every phase is yours, on your own or with people you bring.',
              'My orders keeps every purchase you make on Frequency, with the seller and the total.',
            ]
          : [
              'Each seller has their part of the order now and sends it on themselves, so it may arrive in more than one delivery.',
              'My orders keeps every purchase you make on Frequency, with the seller and the total.',
            ],
        actionLabel: journeySlug ? 'Open your Journey' : 'See my orders',
        actionUrl: journeySlug
          ? `${appUrl()}${journeyWelcomeDoor(journeySlug, { email: order.buyerProfileId ? null : order.buyerEmail })}`
          : `${appUrl()}/orders`,
      },
      logTag: LOG,
      context: { orderId: order.id, side: 'buyer', split: true },
    })

    // ── Each seller's notice, for their share only ──────────────────────────────────────────────
    if (!transfers) return
    if (!transfers.length) {
      // The settle plans the rows just before this runs; none means the plan was refused or could not
      // be written (both logged by the ledger). The reconciler plans and pays it later; nobody was told.
      console.error(`${LOG} split order has no transfer rows; no seller was notified`, { orderId: order.id })
      return
    }
    const buyerName = (await displayNameFor(order.buyerProfileId)) ?? 'Someone'
    for (const t of transfers) {
      const part = parts.find((p) => p.key === transferKey(t))
      const seller = part ? await sellerFor(part) : null
      if (!part || !seller?.profileId) {
        console.error(`${LOG} no seller to notify for a paid split share`, {
          orderId: order.id,
          transferId: t.id,
          ownerKind: t.ownerKind,
        })
        continue
      }
      const summary = part.items.length ? part.items.join(', ') : null
      const soldLabel = summary ?? 'an item'
      const gross = receiptAmount(t.amountCents + t.platformFeeCents, t.currency)
      await notifyEarner({
        recipientProfileId: seller.profileId,
        actorProfileId: order.buyerProfileId,
        type: ORDER_SOLD_NOTIFICATION_TYPE,
        referenceType: seller.spaceSlug ? 'space' : 'profile',
        referenceId: seller.spaceSlug ?? order.buyerProfileId,
        bellBody: gross ? `bought ${soldLabel} for ${gross}` : `bought ${soldLabel}`,
        bellBodyNoActor: gross ? `Someone bought ${soldLabel} for ${gross}` : `Someone bought ${soldLabel}`,
        subject: `You sold ${soldLabel}`,
        content: {
          greetingName: await displayNameFor(seller.profileId),
          lead: gross ? `${buyerName} bought ${soldLabel} for ${gross}.` : `${buyerName} bought ${soldLabel}.`,
          lines: [
            { label: 'Order', value: summary ?? '' },
            { label: 'Your sale', value: gross ?? '' },
            { label: 'Network fee', value: receiptAmount(t.platformFeeCents, t.currency) ?? '' },
            { label: 'You receive', value: receiptAmount(t.amountCents, t.currency) ?? '' },
            { label: 'Buyer', value: buyerName },
            { label: 'Date', value: when },
          ],
          closing: [
            'The same order had items from other sellers. Send only what is listed here; they send their own.',
            'The money goes to your payout account on your usual payout schedule.',
            'Open Orders to see the shipping details.',
          ],
          actionLabel: 'Open Orders',
          actionUrl: seller.consoleUrl,
        },
        logTag: LOG,
        context: { orderId: order.id, side: 'seller', transferId: t.id },
      })
    }
  } catch (err) {
    console.error(`${LOG} split order receipts failed`, { orderId: order.id, err })
  }
}
