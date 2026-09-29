// PHYSICAL MERCH FULFILMENT (LIVE-606, ADR-1575). The one writer of `commerce_orders.fulfillment_status`.
//
// Until this existed the column had readers (lib/commerce/orders.ts) and no writer, so a paid
// physical order stayed "Paid" for ever: the seller had no door to say it left, the buyer never saw a
// tracking number, and nothing in the product could move an order past the settle. The schema had
// the whole ladder since 20260815000000 (none, pending, shipped, delivered, completed) and a
// `shipping` jsonb that held the Stripe-validated address (LIVE-346); this module walks the ladder
// and stamps the carrier and tracking beside that address.
//
// THREE RULES.
//   1. FORWARD ONLY. A move to the same step or an earlier one is refused with a sentence. There is
//      no "unship" here; a mistake is a note, not a rewind, because the buyer has already been told.
//   2. THE WRITE IS BOUND TO THE SELLER. Every read and write carries the owner column of the seller
//      the calling action verified (owner_space_id, owner_profile_id, or owner_kind = platform), so a
//      Space action can never touch another Space's order and a maker cannot touch a Space's. The
//      admin client bypasses RLS; the scope filter is the authorization (docs/ARCHITECTURE.md).
//   3. THE ORDER'S OWN STATUS FOLLOWS. `delivered` or `completed` flips a `paid` order to `fulfilled`,
//      the state the schema already allows and every earnings read already counts. A refunded,
//      cancelled, failed or unpaid order cannot be fulfilled at all.
//
// The buyer hears about `shipped` once, through the notification registry (`order.shipped`,
// category lifecycle), so a member who switched lifecycle mail off is not emailed. A guest buyer has
// no switch to read, so their address goes to the outbox directly, as the guest receipt does.

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { appUrl } from '@/lib/billing/stripe'
import { enqueueEmail } from '@/lib/email'
import { profileAccountEmail } from '@/lib/profiles/account-email'
import { routeNotification } from '@/lib/notifications/router'
import {
  displayNameFor,
  receiptDate,
  receiptHtml,
  receiptText,
  spaceReceiptTarget,
  type ReceiptContent,
} from '@/lib/billing/receipt-email'
import type { FulfillmentStatus, OwnerKind } from './types'
import {
  FULFILLMENT_LADDER,
  fulfillmentTransition,
  fulfilmentFromShipping,
  trackingUrlFor,
  trimmedText,
  type OrderFulfilment,
} from './fulfilment-state'

// The pure half is re-exported so a caller that already holds the writer has one import.
export * from './fulfilment-state'

const LOG = '[commerce fulfilment]'

// ── The writer ─────────────────────────────────────────────────────────────────────────────────

/** Who is acting, as the calling action VERIFIED it. The write is scoped to this and nothing else. */
export type FulfilmentSeller =
  | { kind: 'space'; spaceId: string }
  | { kind: 'profile'; profileId: string }
  | { kind: 'platform' }

export interface FulfilmentInput {
  status: FulfillmentStatus
  carrier?: string | null
  tracking?: string | null
  note?: string | null
}

export interface FulfilledOrder {
  id: string
  fulfillmentStatus: FulfillmentStatus
  /** The order's own status after the move ('fulfilled' once delivered or completed). */
  status: string
  fulfilment: OrderFulfilment
}

export type SetOrderFulfillmentResult = { ok: true; order: FulfilledOrder } | { ok: false; error: string }

/** Injected seams so the decision is testable without a database or an outbox. */
export interface FulfilmentDeps {
  client?: SupabaseClient
  notifyShipped?: typeof notifyOrderShipped
  now?: () => Date
}

interface OrderRow {
  id: string
  status: string
  fulfillment_status: string
  shipping: unknown
  buyer_profile_id: string | null
  guest_email: string | null
  owner_kind: OwnerKind
  owner_profile_id: string | null
  owner_space_id: string | null
}

const ORDER_COLS =
  'id, status, fulfillment_status, shipping, buyer_profile_id, guest_email, owner_kind, owner_profile_id, owner_space_id'

/** The scope filter, applied to the read AND the write: the owner column of the verified seller and
 *  the value it must hold. PURE. */
export function sellerScope(seller: FulfilmentSeller): [column: string, value: string] {
  if (seller.kind === 'space') return ['owner_space_id', seller.spaceId]
  if (seller.kind === 'profile') return ['owner_profile_id', seller.profileId]
  return ['owner_kind', 'platform']
}

/**
 * Move one order along the fulfilment ladder, as `seller`.
 *
 * Returns `{ ok: false, error }` with a sentence for every refusal (not the seller's order, not
 * paid, refunded, a step back, a race) and never throws for one. The shipped notice to the buyer is
 * best-effort and runs after the write has landed.
 */
export async function setOrderFulfillment(
  orderId: string,
  input: FulfilmentInput,
  seller: FulfilmentSeller,
  deps: FulfilmentDeps = {},
): Promise<SetOrderFulfillmentResult> {
  const db = deps.client ?? createAdminClient()
  const now = (deps.now ?? (() => new Date()))().toISOString()
  if (!orderId) return { ok: false, error: 'No order was named.' }
  if (seller.kind === 'space' && !seller.spaceId) return { ok: false, error: 'That order is not one of yours.' }
  if (seller.kind === 'profile' && !seller.profileId) return { ok: false, error: 'That order is not one of yours.' }

  const [scopeColumn, scopeValue] = sellerScope(seller)
  const { data, error } = await db
    .from('commerce_orders')
    .select(ORDER_COLS)
    .eq('id', orderId)
    .eq(scopeColumn, scopeValue)
    .maybeSingle()
  if (error) {
    console.error(`${LOG} order read failed`, { orderId, error: error.message })
    return { ok: false, error: 'Could not read that order. Try again in a moment.' }
  }
  const order = (data as unknown as OrderRow | null) ?? null
  if (!order) return { ok: false, error: 'That order is not one of yours.' }

  if (order.status === 'pending') return { ok: false, error: 'This order has not been paid yet.' }
  if (order.status === 'refunded') return { ok: false, error: 'This order was refunded, so there is nothing to send.' }
  if (order.status === 'cancelled' || order.status === 'failed') {
    return { ok: false, error: 'This order never completed, so there is nothing to send.' }
  }

  const from = (FULFILLMENT_LADDER.includes(order.fulfillment_status as FulfillmentStatus)
    ? order.fulfillment_status
    : 'none') as FulfillmentStatus
  const move = fulfillmentTransition(from, input.status)
  if (!move.ok) return move

  const prev = fulfilmentFromShipping(order.shipping)
  const carrier = trimmedText(input.carrier, 60) ?? prev.carrier
  const tracking = trimmedText(input.tracking, 120) ?? prev.tracking
  const next: OrderFulfilment = {
    carrier,
    tracking,
    trackingUrl: trackingUrlFor(carrier, tracking),
    note: trimmedText(input.note, 500) ?? prev.note,
    shippedAt: input.status === 'shipped' ? now : prev.shippedAt,
    deliveredAt: input.status === 'delivered' ? now : prev.deliveredAt,
    completedAt: input.status === 'completed' ? now : prev.completedAt,
  }
  const baseShipping =
    order.shipping && typeof order.shipping === 'object' && !Array.isArray(order.shipping)
      ? (order.shipping as Record<string, unknown>)
      : {}
  const shipping = { ...baseShipping, fulfilment: { ...next, status: input.status, updatedAt: now } }

  // Delivered or completed means the sale is done on the seller's side: the order's own status
  // says so, in the state the schema allows and spaceEarningsSummary already counts as settled.
  const closesOrder = (input.status === 'delivered' || input.status === 'completed') && order.status === 'paid'

  const { data: updated, error: writeError } = await db
    .from('commerce_orders')
    .update({ fulfillment_status: input.status, shipping, ...(closesOrder ? { status: 'fulfilled' } : {}) })
    .eq('id', orderId)
    .eq(scopeColumn, scopeValue)
    // The step the seller saw is the step they are moving from. Two people on the same order
    // cannot both win; the second reloads and sees where it stands.
    .eq('fulfillment_status', order.fulfillment_status)
    .select('id')
  if (writeError) {
    console.error(`${LOG} order write failed`, { orderId, status: input.status, error: writeError.message })
    return { ok: false, error: 'Could not save that. Try again in a moment.' }
  }
  if (!updated || (updated as unknown[]).length === 0) {
    return { ok: false, error: 'Someone else updated this order first. Reload to see where it stands.' }
  }

  if (input.status === 'shipped') {
    const notify = deps.notifyShipped ?? notifyOrderShipped
    await notify({
      orderId,
      ownerKind: order.owner_kind,
      ownerProfileId: order.owner_profile_id,
      ownerSpaceId: order.owner_space_id,
      buyerProfileId: order.buyer_profile_id,
      guestEmail: order.guest_email,
      fulfilment: next,
    }, { client: db })
  }

  return {
    ok: true,
    order: {
      id: orderId,
      fulfillmentStatus: input.status,
      status: closesOrder ? 'fulfilled' : order.status,
      fulfilment: next,
    },
  }
}

// ── The shipped notice ─────────────────────────────────────────────────────────────────────────

export interface ShippedNoticeInput {
  orderId: string
  ownerKind: OwnerKind
  ownerProfileId: string | null
  ownerSpaceId: string | null
  buyerProfileId: string | null
  guestEmail: string | null
  fulfilment: OrderFulfilment
}

/** "Two mugs, One print", or null. Best-effort. */
async function itemSummary(db: SupabaseClient, orderId: string): Promise<{ summary: string | null; first: string | null }> {
  try {
    const { data, error } = await db.from('commerce_order_items').select('title, qty').eq('order_id', orderId)
    if (error) return { summary: null, first: null }
    const rows = (data ?? []) as { title: string | null; qty: number | null }[]
    const parts = rows
      .map((r) => {
        const title = (r.title ?? '').trim()
        if (!title) return null
        return typeof r.qty === 'number' && r.qty > 1 ? `${title} x${r.qty}` : title
      })
      .filter((p): p is string => !!p)
    return { summary: parts.length ? parts.join(', ') : null, first: parts[0] ?? null }
  } catch {
    return { summary: null, first: null }
  }
}

async function sellerName(input: ShippedNoticeInput): Promise<string> {
  if (input.ownerKind === 'space' && input.ownerSpaceId) return (await spaceReceiptTarget(input.ownerSpaceId))?.name ?? 'the seller'
  if (input.ownerKind === 'profile' && input.ownerProfileId) return (await displayNameFor(input.ownerProfileId)) ?? 'the seller'
  return 'Frequency'
}

/**
 * Tell the buyer their order left. A member is routed through the registry (`order.shipped`,
 * lifecycle: their email_lifecycle and push_lifecycle switches decide, suppression always does). A
 * guest has no switches, so the address they paid under goes to the outbox directly, where
 * suppression is still checked at drain time. BEST-EFFORT: resolves on every path and says why it
 * did not send.
 */
export async function notifyOrderShipped(input: ShippedNoticeInput, deps: { client?: SupabaseClient } = {}): Promise<void> {
  try {
    const db = deps.client ?? createAdminClient()
    const [{ summary, first }, seller] = await Promise.all([itemSummary(db, input.orderId), sellerName(input)])
    const what = first ?? 'Your order'
    const f = input.fulfilment
    const content: ReceiptContent = {
      greetingName: await displayNameFor(input.buyerProfileId),
      lead: summary ? `Your order from ${seller} is on its way: ${summary}.` : `Your order from ${seller} is on its way.`,
      lines: [
        { label: 'Carrier', value: f.carrier ?? '' },
        { label: 'Tracking', value: f.tracking ?? '' },
        { label: 'Shipped', value: receiptDate(f.shippedAt ? new Date(f.shippedAt) : new Date()) },
      ],
      closing: [
        f.trackingUrl
          ? 'Follow the tracking link to see where it is.'
          : f.tracking
            ? 'Look up the tracking number with the carrier to see where it is.'
            : `${seller} will have the tracking details if you need them.`,
        'My orders keeps every purchase you make on Frequency, with the seller and the total.',
      ],
      actionLabel: f.trackingUrl ? 'Track it' : 'See my orders',
      actionUrl: f.trackingUrl ?? `${appUrl()}/orders`,
    }
    const subject = `${what} is on its way`

    if (input.buyerProfileId) {
      const to = await profileAccountEmail(input.buyerProfileId)
      const result = await routeNotification(
        'order.shipped',
        { profileId: input.buyerProfileId, email: to },
        {
          title: 'Your order shipped',
          body: `${what} is on its way from ${seller}.`,
          url: '/orders',
          ...(to ? { email: { to, subject, html: receiptHtml(content), text: receiptText(content) } } : {}),
        },
      )
      if (result.enqueuedCount === 0) {
        console.warn(`${LOG} shipped notice reached no channel`, { orderId: input.orderId, outcomes: result.outcomes })
      }
      return
    }

    const guest = (input.guestEmail ?? '').trim()
    if (!guest) {
      console.error(`${LOG} no buyer to tell that the order shipped`, { orderId: input.orderId })
      return
    }
    await enqueueEmail({ to: guest, subject, html: receiptHtml(content), text: receiptText(content) })
  } catch (err) {
    console.error(`${LOG} shipped notice failed`, { orderId: input.orderId, err })
  }
}
