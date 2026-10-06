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
//
// A SPLIT ORDER (LIVE-705, ADR-1652). An order that pays several sellers (owner_kind 'split',
// funds_flow 'separate') names no owner, so rule 2's scope finds nothing. Each seller's claim on it
// is their row in commerce_order_transfers, and each seller ships their own lines, so a split order
// is fulfilled SHARE BY SHARE: the seller's step and record live on their transfer row (rule 1 per
// row, compare-and-set on the step read), a Space or a maker can only ever reach their own row, and
// an operator names the row. The order's own fulfillment_status is then rolled up to the least
// advanced share with something to send, only ever forward, and rule 3 fires once every such share
// is delivered or complete. The buyer's shipped notice names the seller that shipped and their lines.
// A single-seller order never reaches this path: it is found by rule 2 first, exactly as before.

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
// Relative, not '@/': the LIVE-705 probe loads this module with every '@/' import stubbed.
import { emitDealCompleted } from '../trust/emitters'
import {
  FULFILLMENT_LADDER,
  fulfillmentTransition,
  fulfilmentFromRecord,
  fulfilmentFromShipping,
  orderNeedsFulfilment,
  rollupShareFulfilment,
  trackingUrlFor,
  trimmedText,
  type OrderFulfilment,
} from './fulfilment-state'

// The pure half is re-exported so a caller that already holds the writer has one import.
export * from './fulfilment-state'

const LOG = '[commerce fulfilment]'

// ── The writer ─────────────────────────────────────────────────────────────────────────────────

/** Who is acting, as the calling action VERIFIED it. The write is scoped to this and nothing else. */
type FulfilmentSeller =
  | { kind: 'space'; spaceId: string }
  | { kind: 'profile'; profileId: string }
  | { kind: 'platform' }
  /** An operator acting for ONE seller's share of a split order, named by its transfer row
   *  (LIVE-705). Reaches split orders only; a single-seller order is its seller's to move. */
  | { kind: 'operator'; shareId: string }

/** A seller as the owner-column scope can name one: every kind but the operator's share door. */
type OwnerSeller = Exclude<FulfilmentSeller, { kind: 'operator' }>

interface FulfilmentInput {
  status: FulfillmentStatus
  carrier?: string | null
  tracking?: string | null
  note?: string | null
}

interface FulfilledOrder {
  id: string
  /** The step just written: the order's, or on a split order the share's. */
  fulfillmentStatus: FulfillmentStatus
  /** The order's own status after the move ('fulfilled' once delivered or completed). */
  status: string
  fulfilment: OrderFulfilment
  /** Split orders only (LIVE-705): the transfer row moved, and where the whole order now stands. */
  shareId?: string
  orderFulfillmentStatus?: FulfillmentStatus
}

type SetOrderFulfillmentResult = { ok: true; order: FulfilledOrder } | { ok: false; error: string }

/** Injected seams so the decision is testable without a database or an outbox. */
interface FulfilmentDeps {
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
function sellerScope(seller: OwnerSeller): [column: string, value: string] {
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
  if (seller.kind === 'operator') {
    if (!seller.shareId) return { ok: false, error: 'Name the seller whose share you are marking.' }
    return setShareFulfillment(db, orderId, input, seller, now, deps)
  }
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
  if (!order) {
    // Not an order this seller owns. It may be a split order that pays them: their claim on it is
    // their transfer row, and they move their own share of it (LIVE-705). The platform is never a
    // share of a split order, so the Store door stops here.
    if (seller.kind === 'platform') return { ok: false, error: 'That order is not one of yours.' }
    return setShareFulfillment(db, orderId, input, seller, now, deps)
  }

  const unsendable = unsendableReason(order.status)
  if (unsendable) return { ok: false, error: unsendable }

  const from = (FULFILLMENT_LADDER.includes(order.fulfillment_status as FulfillmentStatus)
    ? order.fulfillment_status
    : 'none') as FulfillmentStatus
  const move = fulfillmentTransition(from, input.status)
  if (!move.ok) return move

  const next = nextFulfilment(fulfilmentFromShipping(order.shipping), input, now)
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
  // A closed sale is a trust credit for the member who sold it (LIVE-679). Best-effort, once.
  if (closesOrder) await emitDealCompleted(orderId, [order.owner_profile_id])

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

/** Why an order in this state has nothing to send, or null when it can be sent. PURE. */
function unsendableReason(status: string): string | null {
  if (status === 'pending') return 'This order has not been paid yet.'
  if (status === 'refunded') return 'This order was refunded, so there is nothing to send.'
  if (status === 'cancelled' || status === 'failed') return 'This order never completed, so there is nothing to send.'
  return null
}

/** The record after a move: the new step's time stamped, a blank field keeping what was said. PURE. */
function nextFulfilment(prev: OrderFulfilment, input: FulfilmentInput, now: string): OrderFulfilment {
  const carrier = trimmedText(input.carrier, 60) ?? prev.carrier
  const tracking = trimmedText(input.tracking, 120) ?? prev.tracking
  return {
    carrier,
    tracking,
    trackingUrl: trackingUrlFor(carrier, tracking),
    note: trimmedText(input.note, 500) ?? prev.note,
    shippedAt: input.status === 'shipped' ? now : prev.shippedAt,
    deliveredAt: input.status === 'delivered' ? now : prev.deliveredAt,
    completedAt: input.status === 'completed' ? now : prev.completedAt,
  }
}

// ── A split order, share by share (LIVE-705, ADR-1652) ─────────────────────────────────────────

/** Who may move a share: the seller it pays (by their own owner column) or an operator (by row). */
type ShareActor = Exclude<FulfilmentSeller, { kind: 'platform' }>

interface ShareRow {
  id: string
  owner_kind: 'profile' | 'space'
  owner_profile_id: string | null
  owner_space_id: string | null
  status: string
  fulfillment_status: string
  fulfilment: unknown
}

const SHARE_COLS = 'id, owner_kind, owner_profile_id, owner_space_id, status, fulfillment_status, fulfilment'

/** One line of an order, with the seller it came from (its product's owner) and what it is. */
interface OrderLine {
  title: string | null
  qty: number | null
  kind: string | null
  seller: { kind: string; profileId: string | null; spaceId: string | null } | null
}

async function orderLines(db: SupabaseClient, orderId: string): Promise<OrderLine[] | null> {
  const { data, error } = await db
    .from('commerce_order_items')
    .select('title, qty, commerce_products(product_kind, owner_kind, owner_profile_id, owner_space_id)')
    .eq('order_id', orderId)
  if (error) return null
  return ((data ?? []) as Record<string, unknown>[]).map((r) => {
    const p = r.commerce_products as {
      product_kind?: string | null
      owner_kind?: string | null
      owner_profile_id?: string | null
      owner_space_id?: string | null
    } | null
    return {
      title: (r.title as string | null) ?? null,
      qty: (r.qty as number | null) ?? null,
      kind: p?.product_kind ?? null,
      seller: p?.owner_kind
        ? { kind: p.owner_kind, profileId: p.owner_profile_id ?? null, spaceId: p.owner_space_id ?? null }
        : null,
    }
  })
}

/** True when a line was sold by the seller this share pays (kind AND that kind's owner id, so a
 *  Space's line never counts toward the profile that owns the Space). PURE. */
export function lineIsShares(
  line: { seller: { kind: string; profileId: string | null; spaceId: string | null } | null },
  share: { owner_kind: string; owner_profile_id: string | null; owner_space_id: string | null },
): boolean {
  const s = line.seller
  if (!s || s.kind !== share.owner_kind) return false
  return share.owner_kind === 'space' ? !!s.spaceId && s.spaceId === share.owner_space_id : !!s.profileId && s.profileId === share.owner_profile_id
}

/** A share that was paid back in full (reversed) or never paid (cancelled) has nothing to send. */
const CLOSED_SHARE = new Set(['reversed', 'cancelled'])

async function setShareFulfillment(
  db: SupabaseClient,
  orderId: string,
  input: FulfilmentInput,
  actor: ShareActor,
  now: string,
  deps: FulfilmentDeps,
): Promise<SetOrderFulfillmentResult> {
  // The share is found by the verified seller's OWN owner column and kind, or, for an operator, by
  // the row they named; either way only on this order. No seller can reach another seller's row.
  let q = db.from('commerce_order_transfers').select(SHARE_COLS).eq('order_id', orderId)
  if (actor.kind === 'operator') q = q.eq('id', actor.shareId)
  else if (actor.kind === 'space') q = q.eq('owner_kind', 'space').eq('owner_space_id', actor.spaceId)
  else q = q.eq('owner_kind', 'profile').eq('owner_profile_id', actor.profileId)
  const { data: shareData, error: shareError } = await q.maybeSingle()
  if (shareError) {
    console.error(`${LOG} share read failed`, { orderId, error: shareError.message })
    return { ok: false, error: 'Could not read that order. Try again in a moment.' }
  }
  const share = (shareData as unknown as ShareRow | null) ?? null
  if (!share) return { ok: false, error: 'That order is not one of yours.' }

  const { data: orderData, error: orderError } = await db
    .from('commerce_orders')
    .select(ORDER_COLS)
    .eq('id', orderId)
    .eq('funds_flow', 'separate')
    .maybeSingle()
  if (orderError) {
    console.error(`${LOG} order read failed`, { orderId, error: orderError.message })
    return { ok: false, error: 'Could not read that order. Try again in a moment.' }
  }
  const order = (orderData as unknown as OrderRow | null) ?? null
  if (!order) return { ok: false, error: 'That order is not one of yours.' }
  const unsendable = unsendableReason(order.status)
  if (unsendable) return { ok: false, error: unsendable }
  if (CLOSED_SHARE.has(share.status)) return { ok: false, error: 'This share was paid back, so there is nothing to send.' }

  const lines = await orderLines(db, orderId)
  if (!lines) return { ok: false, error: 'Could not read that order. Try again in a moment.' }
  const mine = lines.filter((l) => lineIsShares(l, share))
  if (!orderNeedsFulfilment(mine.map((l) => l.kind))) {
    return { ok: false, error: 'Nothing in this share needs sending.' }
  }

  const from = (FULFILLMENT_LADDER.includes(share.fulfillment_status as FulfillmentStatus)
    ? share.fulfillment_status
    : 'none') as FulfillmentStatus
  const move = fulfillmentTransition(from, input.status)
  if (!move.ok) return move

  const next = nextFulfilment(fulfilmentFromRecord(share.fulfilment), input, now)
  // updated_at is left alone: it is the reconciler's clock for a transfer that has not landed.
  const { data: updated, error: writeError } = await db
    .from('commerce_order_transfers')
    .update({ fulfillment_status: input.status, fulfilment: { ...next, status: input.status, updatedAt: now } })
    .eq('id', share.id)
    .eq('fulfillment_status', share.fulfillment_status)
    .select('id')
  if (writeError) {
    console.error(`${LOG} share write failed`, { orderId, shareId: share.id, status: input.status, error: writeError.message })
    return { ok: false, error: 'Could not save that. Try again in a moment.' }
  }
  if (!updated || (updated as unknown[]).length === 0) {
    return { ok: false, error: 'Someone else updated this order first. Reload to see where it stands.' }
  }

  const rolled = await rollUpSplitOrder(db, order, lines)

  if (input.status === 'shipped') {
    const notify = deps.notifyShipped ?? notifyOrderShipped
    await notify({
      orderId,
      ownerKind: share.owner_kind,
      ownerProfileId: share.owner_profile_id,
      ownerSpaceId: share.owner_space_id,
      buyerProfileId: order.buyer_profile_id,
      guestEmail: order.guest_email,
      fulfilment: next,
      lines: mine,
    }, { client: db })
  }

  return {
    ok: true,
    order: {
      id: orderId,
      fulfillmentStatus: input.status,
      status: rolled.status,
      fulfilment: next,
      shareId: share.id,
      orderFulfillmentStatus: rolled.fulfillmentStatus,
    },
  }
}

/**
 * Move a split order's own fulfillment_status to the least advanced share with something to send,
 * and close a paid order as fulfilled once every such share is delivered or complete. FORWARD ONLY:
 * the write only lands on an order still at an earlier step, so two sellers finishing at once can
 * never pull it back. Best-effort: a failed roll-up is logged and the share's own step stands; the
 * next share move rolls it up again.
 */
async function rollUpSplitOrder(
  db: SupabaseClient,
  order: OrderRow,
  lines: OrderLine[],
): Promise<{ fulfillmentStatus: FulfillmentStatus; status: string }> {
  const current = (FULFILLMENT_LADDER.includes(order.fulfillment_status as FulfillmentStatus)
    ? order.fulfillment_status
    : 'none') as FulfillmentStatus
  const kept = { fulfillmentStatus: current, status: order.status }
  const { data, error } = await db
    .from('commerce_order_transfers')
    .select('owner_kind, owner_profile_id, owner_space_id, status, fulfillment_status')
    .eq('order_id', order.id)
  if (error) {
    console.error(`${LOG} split roll-up read failed`, { orderId: order.id, error: error.message })
    return kept
  }
  const steps = ((data ?? []) as Omit<ShareRow, 'id' | 'fulfilment'>[])
    .filter((r) => !CLOSED_SHARE.has(r.status))
    .filter((r) => orderNeedsFulfilment(lines.filter((l) => lineIsShares(l, r)).map((l) => l.kind)))
    .map((r) => r.fulfillment_status)
  const target = rollupShareFulfilment(steps)
  const targetIdx = FULFILLMENT_LADDER.indexOf(target)
  if (targetIdx <= FULFILLMENT_LADDER.indexOf(current)) return kept

  const closesOrder = (target === 'delivered' || target === 'completed') && order.status === 'paid'
  const { data: moved, error: writeError } = await db
    .from('commerce_orders')
    .update({ fulfillment_status: target, ...(closesOrder ? { status: 'fulfilled' } : {}) })
    .eq('id', order.id)
    .in('fulfillment_status', FULFILLMENT_LADDER.slice(0, targetIdx) as string[])
    .select('id')
  if (writeError) {
    console.error(`${LOG} split roll-up write failed`, { orderId: order.id, target, error: writeError.message })
    return kept
  }
  if (!moved || (moved as unknown[]).length === 0) return kept
  // Every member who sold a share of a split cart gets the closed-sale credit (LIVE-679).
  if (closesOrder) {
    await emitDealCompleted(order.id, [
      order.owner_profile_id,
      ...((data ?? []) as { owner_profile_id: string | null }[]).map((r) => r.owner_profile_id),
    ])
  }
  return { fulfillmentStatus: target, status: closesOrder ? 'fulfilled' : order.status }
}

/**
 * Re-roll a split order after a share CLOSED without moving (SCAN-650): a transfer fully reversed
 * from the Stripe dashboard drops its share out of the roll-up, and the order's own step must
 * follow the shares still open. Best-effort, as the roll-up itself is: a read that fails is logged
 * and the order stands where it was. Does nothing for an order that is not a split order.
 */
export async function rollUpSplitOrderById(orderId: string, deps: { client?: SupabaseClient } = {}): Promise<void> {
  const db = deps.client ?? createAdminClient()
  const { data, error } = await db
    .from('commerce_orders')
    .select(ORDER_COLS)
    .eq('id', orderId)
    .eq('funds_flow', 'separate')
    .maybeSingle()
  if (error) {
    console.error(`${LOG} split roll-up order read failed`, { orderId, error: error.message })
    return
  }
  const order = (data as unknown as OrderRow | null) ?? null
  if (!order) return
  const lines = await orderLines(db, orderId)
  if (!lines) {
    console.error(`${LOG} split roll-up lines read failed`, { orderId })
    return
  }
  await rollUpSplitOrder(db, order, lines)
}

// ── The shipped notice ─────────────────────────────────────────────────────────────────────────

interface ShippedNoticeInput {
  orderId: string
  ownerKind: OwnerKind
  ownerProfileId: string | null
  ownerSpaceId: string | null
  buyerProfileId: string | null
  guestEmail: string | null
  fulfilment: OrderFulfilment
  /** The lines this notice is about, when they are not the whole order: one seller's share of a
   *  split order (LIVE-705). Omitted, the order's lines are read. */
  lines?: { title: string | null; qty: number | null }[]
}

/** "Two mugs, One print", or null. Best-effort. */
async function itemSummary(
  db: SupabaseClient,
  orderId: string,
  given?: { title: string | null; qty: number | null }[],
): Promise<{ summary: string | null; first: string | null }> {
  try {
    let rows = given
    if (!rows) {
      const { data, error } = await db.from('commerce_order_items').select('title, qty').eq('order_id', orderId)
      if (error) return { summary: null, first: null }
      rows = (data ?? []) as { title: string | null; qty: number | null }[]
    }
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
    const [{ summary, first }, seller] = await Promise.all([itemSummary(db, input.orderId, input.lines), sellerName(input)])
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
          ...(to ? { email: { to, subject, html: await receiptHtml(content), text: receiptText(content) } } : {}),
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
    await enqueueEmail({ to: guest, subject, html: await receiptHtml(content), text: receiptText(content) })
  } catch (err) {
    console.error(`${LOG} shipped notice failed`, { orderId: input.orderId, err })
  }
}
