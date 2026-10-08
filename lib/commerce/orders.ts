// Order reads for the commerce core (ADR-39X). Buyers see what they bought, sellers
// (makers / Spaces) see their sales, operators see everything + can refund. Server-only
// (admin client behind app-code authz); settlement + refund live in ./checkout.ts.
//
// A SPLIT ORDER (funds_flow 'separate', LIVE-621) names no seller on its own row: owner_kind is
// 'split' and both owner ids are null, so a read keyed on the owner columns never finds it. Each
// seller's claim on it is their row in `commerce_order_transfers` (LIVE-622). The two seller reads
// below therefore union the orders a seller owns with the split orders that carry a transfer row
// for them, and return each of those as THAT seller's view of it (LIVE-624, ADR-1616): their lines
// only, their gross and fee in amountCents and platformFeeCents, and `share` with the net and the
// transfer's state. The whole cart, and every other seller's figures, never leave this module on a
// seller read. spaceEarningsSummary sums the share the same way.
//
// Each seller ships their own share of a split order (LIVE-705, ADR-1652): the step and record live
// on their transfer row, so a seller's view carries THEIR step, the buyer's read carries each
// seller's step beside their lines (sellerFulfilments), and the operator reads every share's.

import { completeEarningsRead, assertUsdEarningsRows } from './complete-read'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import type { OrderStatus, OwnerKind, OrderOwnerKind, FulfillmentStatus, FundsFlow } from './types'
import type { TransferStatus } from './transfers'
import {
  fulfilmentFromRecord,
  fulfilmentFromShipping,
  orderNeedsFulfilment,
  orderShips,
  type OrderFulfilment,
} from './fulfilment-state'

function db(): SupabaseClient {
  return createAdminClient()
}

/** Who sold a line: the product's owner at read time. Null when the product is gone. */
export interface OrderLineSeller {
  kind: OwnerKind
  profileId: string | null
  spaceId: string | null
}

interface OrderItem {
  id: string
  title: string
  qty: number
  unitCents: number
  subtotalCents: number
  /** The product's kind at read time (physical, digital, service, booking, ticket, journey), or null
   *  when the product is gone. Decides whether the seller has anything to send (LIVE-606). */
  productKind: string | null
  /** The seller of this line, so a split order can be shown seller by seller (LIVE-624). */
  seller: OrderLineSeller | null
}

/** One seller's share of a split order, from their row in commerce_order_transfers (LIVE-624). */
export interface OrderShare {
  /** What this seller's lines came to: the transfer plus the fee kept from it. */
  grossCents: number
  feeCents: number
  /** What the transfer pays this seller. */
  netCents: number
  /** Cents pulled back from this seller's transfer so far. */
  reversedCents: number
  transferStatus: TransferStatus
}

/** A seller, as the two seller reads take one. The caller has already verified the viewer may act
 *  for it (the maker is the signed-in profile; the Space was resolved through its manage access). */
export type OrderSellerRef = { kind: 'profile'; id: string } | { kind: 'space'; id: string }

export interface CommerceOrder {
  id: string
  buyerProfileId: string | null
  /** 'split' for an order that pays more than one seller (LIVE-621). */
  ownerKind: OrderOwnerKind
  ownerProfileId: string | null
  ownerSpaceId: string | null
  amountCents: number
  platformFeeCents: number
  currency: string
  status: OrderStatus
  fulfillmentStatus: FulfillmentStatus
  /** Carrier, tracking and the step timestamps the seller stamped into `shipping` (LIVE-606). */
  fulfilment: OrderFulfilment
  /** True when at least one line is something the seller sends (a physical or digital good). */
  needsFulfilment: boolean
  /** True when a line physically ships, so a carrier and tracking number apply. */
  ships: boolean
  createdAt: string
  paidAt: string | null
  refundedAt: string | null
  items: OrderItem[]
  /** Which funds flow the order took. 'separate' is a split order paid by transfers (LIVE-622). */
  fundsFlow: FundsFlow
  /** How many sellers the order pays: 1 for a destination order, one per share for a split order. */
  sellerCount: number
  /** Set ONLY on a seller's own read of a split order: their share and its transfer state. On such a
   *  read amountCents and platformFeeCents are this share's and items are this seller's lines.
   *  Null on every other read (a destination order, the buyer's view, the operator's view). */
  share: OrderShare | null
  /** The buyer's read of a split order only (LIVE-705): where each seller's share stands, matched to
   *  that seller's lines by sellerNameKey(seller). Absent on every other read. */
  sellerFulfilments?: SellerFulfilment[]
}

/** Where one seller's share of a split order stands (LIVE-705). No money figure rides here. */
export interface SellerFulfilment {
  seller: OrderLineSeller
  fulfillmentStatus: FulfillmentStatus
  fulfilment: OrderFulfilment
}

/** A share as the operator reads it: which transfer row, so the operator's door can name it. */
export interface ShareFulfilment extends SellerFulfilment {
  shareId: string
}

const ORDER_COLS =
  'id, buyer_profile_id, owner_kind, owner_profile_id, owner_space_id, amount_cents, platform_fee_cents, ' +
  'currency, status, fulfillment_status, shipping, created_at, paid_at, refunded_at, funds_flow, metadata, ' +
  // The product's kind rides along through the product_id join so a surface can tell a mug from a
  // booking without a second read; a deleted product reads null and defaults to "needs sending".
  // Its owner rides along too, so a split order's lines can be told apart by seller (LIVE-624).
  'commerce_order_items(id, title, qty, unit_cents, subtotal_cents, ' +
  'commerce_products(product_kind, owner_kind, owner_profile_id, owner_space_id))'

/** How many sellers a split order's checkout priced a share for (metadata.split), or 1. PURE. */
function splitSellerCount(metadata: unknown): number {
  const split = (metadata as { split?: unknown } | null | undefined)?.split
  return Array.isArray(split) && split.length > 0 ? split.length : 1
}

function rowToOrder(r: Record<string, unknown>): CommerceOrder {
  const rawItems = Array.isArray(r.commerce_order_items) ? r.commerce_order_items : []
  const items = (rawItems as Record<string, unknown>[]).map((it) => {
    const product = it.commerce_products as {
      product_kind?: string | null
      owner_kind?: OwnerKind | null
      owner_profile_id?: string | null
      owner_space_id?: string | null
    } | null
    return {
      id: it.id as string,
      title: it.title as string,
      qty: it.qty as number,
      unitCents: it.unit_cents as number,
      subtotalCents: it.subtotal_cents as number,
      productKind: product?.product_kind ?? null,
      seller: product?.owner_kind
        ? { kind: product.owner_kind, profileId: product.owner_profile_id ?? null, spaceId: product.owner_space_id ?? null }
        : null,
    }
  })
  const kinds = items.map((it) => it.productKind)
  return {
    id: r.id as string,
    buyerProfileId: (r.buyer_profile_id as string) ?? null,
    ownerKind: r.owner_kind as OwnerKind,
    ownerProfileId: (r.owner_profile_id as string) ?? null,
    ownerSpaceId: (r.owner_space_id as string) ?? null,
    amountCents: r.amount_cents as number,
    platformFeeCents: (r.platform_fee_cents as number) ?? 0,
    currency: (r.currency as string) ?? 'usd',
    status: r.status as OrderStatus,
    fulfillmentStatus: (r.fulfillment_status as FulfillmentStatus) ?? 'none',
    fulfilment: fulfilmentFromShipping(r.shipping),
    needsFulfilment: orderNeedsFulfilment(kinds),
    ships: orderShips(kinds),
    createdAt: r.created_at as string,
    paidAt: (r.paid_at as string) ?? null,
    refundedAt: (r.refunded_at as string) ?? null,
    items,
    fundsFlow: r.funds_flow === 'separate' ? 'separate' : 'destination',
    sellerCount: r.funds_flow === 'separate' ? splitSellerCount(r.metadata) : 1,
    share: null,
  }
}

// ── A seller's share of a split order (LIVE-624) ────────────────────────────────────────────────

interface ShareRow {
  order_id: string
  amount_cents: number
  platform_fee_cents: number
  reversed_cents: number
  status: TransferStatus
  /** This seller's own step and record for their share (LIVE-705). */
  fulfillment_status?: string | null
  fulfilment?: unknown
}

const SHARE_COLS = 'id, order_id, amount_cents, platform_fee_cents, reversed_cents, status, fulfillment_status, fulfilment'

/** This seller's transfer rows, newest first. Filtered on the seller's own owner column AND kind, so
 *  no other seller's row is ever read here. Throws on a database error; each caller decides. */
async function sellerShareRows(seller: OrderSellerRef, limit?: number, strict = false): Promise<ShareRow[]> {
  let q = db()
    .from('commerce_order_transfers')
    .select(SHARE_COLS)
    .eq('owner_kind', seller.kind)
    .eq(seller.kind === 'space' ? 'owner_space_id' : 'owner_profile_id', seller.id)
  if (!strict) q = q.order('created_at', { ascending: false })
  if (limit) q = q.limit(limit)
  const { data, error } = strict ? await completeEarningsRead(q) : await q
  if (error) throw new Error(`transfer shares unreadable: ${error.message}`)
  return (data ?? []) as ShareRow[]
}

function lineBelongsTo(item: OrderItem, seller: OrderSellerRef): boolean {
  const s = item.seller
  if (!s || s.kind !== seller.kind) return false
  return seller.kind === 'space' ? s.spaceId === seller.id : s.profileId === seller.id
}

function asFulfillmentStatus(v: unknown): FulfillmentStatus {
  return v === 'pending' || v === 'shipped' || v === 'delivered' || v === 'completed' ? v : 'none'
}

/**
 * A split order narrowed to ONE seller's share for sending it (LIVE-705). PURE.
 *
 * Their lines, whether those need sending or ship, and THEIR step and record in place of the order's
 * roll-up, so the seller's door offers the next step of their own share and the operator's door one
 * per share. Money figures are untouched here; sellerViewOfSplitOrder replaces those for a seller.
 */
export function shareView(order: CommerceOrder, seller: OrderLineSeller, fulfillmentStatus: FulfillmentStatus, fulfilment: OrderFulfilment): CommerceOrder {
  const ref: OrderSellerRef = seller.kind === 'space' ? { kind: 'space', id: seller.spaceId ?? '' } : { kind: 'profile', id: seller.profileId ?? '' }
  const items = order.items.filter((it) => lineBelongsTo(it, ref))
  const kinds = items.map((it) => it.productKind)
  return {
    ...order,
    items,
    needsFulfilment: orderNeedsFulfilment(kinds),
    ships: orderShips(kinds),
    fulfillmentStatus,
    fulfilment,
  }
}

/**
 * A split order as ONE of its sellers may see it. PURE.
 *
 * Their lines only; their gross and fee in place of the cart's, so every existing sum over
 * amountCents (a console total, a count beside a money figure) adds this share and never the whole
 * cart; and `share` with the net and the transfer state. Fulfilment is recomputed from their lines,
 * since the other sellers' goods are not theirs to send.
 */
export function sellerViewOfSplitOrder(order: CommerceOrder, seller: OrderSellerRef, row: ShareRow): CommerceOrder {
  const lineSeller: OrderLineSeller =
    seller.kind === 'space' ? { kind: 'space', profileId: null, spaceId: seller.id } : { kind: 'profile', profileId: seller.id, spaceId: null }
  // Their step and record, not the order's roll-up: the door below offers THEIR next step (LIVE-705).
  const view = shareView(order, lineSeller, asFulfillmentStatus(row.fulfillment_status), fulfilmentFromRecord(row.fulfilment))
  const grossCents = row.amount_cents + row.platform_fee_cents
  return {
    ...view,
    amountCents: grossCents,
    platformFeeCents: row.platform_fee_cents,
    share: {
      grossCents,
      feeCents: row.platform_fee_cents,
      netCents: row.amount_cents,
      reversedCents: row.reversed_cents,
      transferStatus: row.status,
    },
  }
}

/** The split orders that carry a transfer row for this seller, each as their view of it. FAIL-SAFE
 *  to none (logged): a seller surface still lists the orders they own when the ledger is unreadable. */
async function splitOrdersForSeller(
  seller: OrderSellerRef,
  statuses: OrderStatus[] | null,
  limit: number,
): Promise<CommerceOrder[]> {
  try {
    const rows = await sellerShareRows(seller, limit)
    if (!rows.length) return []
    const byOrder = new Map(rows.map((r) => [r.order_id, r]))
    let q = db().from('commerce_orders').select(ORDER_COLS).in('id', [...byOrder.keys()]).eq('funds_flow', 'separate')
    q = statuses ? q.in('status', statuses) : q.neq('status', 'pending')
    const { data, error } = await q
    if (error) throw new Error(`split orders unreadable: ${error.message}`)
    return ((data ?? []) as unknown as Record<string, unknown>[]).flatMap((r) => {
      const row = byOrder.get(r.id as string)
      return row ? [sellerViewOfSplitOrder(rowToOrder(r), seller, row)] : []
    })
  } catch (err) {
    console.error('[commerce orders] split shares unreadable', {
      sellerKind: seller.kind,
      error: err instanceof Error ? err.message : String(err),
    })
    return []
  }
}

/** Owned orders and split shares in one list, newest first, capped. An order is never both (a split
 *  order names no owner), and the id guard keeps it that way if one ever were. */
function newestFirst(owned: CommerceOrder[], shared: CommerceOrder[], limit: number): CommerceOrder[] {
  const seen = new Set(owned.map((o) => o.id))
  return [...owned, ...shared.filter((o) => !seen.has(o.id))]
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0))
    .slice(0, limit)
}

const LIMIT = (n?: number) => Math.min(Math.max(n ?? 50, 1), 200)

/**
 * Where every share of these split orders stands, keyed by order id (LIVE-705). One read of the
 * transfer ledger, fulfilment columns and seller only: no money figure is selected. FAIL-SAFE to an
 * empty map (logged): a surface then shows the order's roll-up, never an error.
 */
export async function splitShareFulfilments(orderIds: string[]): Promise<Map<string, ShareFulfilment[]>> {
  const out = new Map<string, ShareFulfilment[]>()
  if (!orderIds.length) return out
  try {
    const { data, error } = await db()
      .from('commerce_order_transfers')
      .select('id, order_id, owner_kind, owner_profile_id, owner_space_id, fulfillment_status, fulfilment')
      .in('order_id', orderIds)
      .order('created_at', { ascending: true })
    if (error) throw new Error(error.message)
    for (const r of (data ?? []) as Record<string, unknown>[]) {
      const kind = r.owner_kind === 'space' ? 'space' : 'profile'
      const list = out.get(r.order_id as string) ?? []
      list.push({
        shareId: r.id as string,
        seller: { kind, profileId: (r.owner_profile_id as string | null) ?? null, spaceId: (r.owner_space_id as string | null) ?? null },
        fulfillmentStatus: asFulfillmentStatus(r.fulfillment_status),
        fulfilment: fulfilmentFromRecord(r.fulfilment),
      })
      out.set(r.order_id as string, list)
    }
  } catch (err) {
    console.error('[commerce orders] share fulfilment unreadable', { error: err instanceof Error ? err.message : String(err) })
    return new Map()
  }
  return out
}

/** A buyer's own orders, newest first. Only paid+ states (a pending checkout that was
 *  never completed isn't a purchase). A split order carries where each seller's share stands
 *  (LIVE-705), so the buyer sees who has sent what. */
export async function listOrdersForBuyer(profileId: string, opts: { limit?: number } = {}): Promise<CommerceOrder[]> {
  const { data } = await db()
    .from('commerce_orders')
    .select(ORDER_COLS)
    .eq('buyer_profile_id', profileId)
    .neq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(LIMIT(opts.limit))
  const orders = ((data ?? []) as unknown as Record<string, unknown>[]).map(rowToOrder)
  const split = orders.filter((o) => o.fundsFlow === 'separate')
  if (!split.length) return orders
  const shares = await splitShareFulfilments(split.map((o) => o.id))
  return orders.map((o) => {
    const list = shares.get(o.id)
    // The operator's row id stays on the server: the buyer reads the seller and the step only.
    return list ? { ...o, sellerFulfilments: list.map(({ seller, fulfillmentStatus, fulfilment }) => ({ seller, fulfillmentStatus, fulfilment })) } : o
  })
}

/** A maker's sales (orders for products they own, and their share of every split order that pays
 *  them, LIVE-624), newest first. */
export async function listOrdersForSeller(profileId: string, opts: { limit?: number } = {}): Promise<CommerceOrder[]> {
  const limit = LIMIT(opts.limit)
  const [{ data }, shared] = await Promise.all([
    db()
      .from('commerce_orders')
      .select(ORDER_COLS)
      .eq('owner_profile_id', profileId)
      .neq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(limit),
    profileId ? splitOrdersForSeller({ kind: 'profile', id: profileId }, null, limit) : Promise.resolve([]),
  ])
  return newestFirst(((data ?? []) as unknown as Record<string, unknown>[]).map(rowToOrder), shared, limit)
}

/** A Space's sales (orders for products the Space owns), newest first. The Orders tab of the Shop
 *  console reads this — listOrdersForSeller filters owner_profile_id, which is NULL for a Space, so
 *  a Space's orders are invisible through the maker path (ADR-596). Paid+ states only. */
export async function listSpaceOrders(spaceId: string, opts: { limit?: number } = {}): Promise<CommerceOrder[]> {
  if (!spaceId) return []
  const limit = LIMIT(opts.limit)
  // Settled + refunded only: a failed / cancelled checkout is not a sale, so it must not pad the
  // Orders list or the count that sits beside the money figures (which sum settled orders only).
  const settled: OrderStatus[] = ['paid', 'fulfilled', 'refunded']
  const [{ data }, shared] = await Promise.all([
    db()
      .from('commerce_orders')
      .select(ORDER_COLS)
      .eq('owner_space_id', spaceId)
      .in('status', settled)
      .order('created_at', { ascending: false })
      .limit(limit),
    // The Space's share of every split order that pays it (LIVE-624).
    splitOrdersForSeller({ kind: 'space', id: spaceId }, settled, limit),
  ])
  return newestFirst(((data ?? []) as unknown as Record<string, unknown>[]).map(rowToOrder), shared, limit)
}

/** How many cents a PARTIAL refund took back off a still-settled order (LIVE-160). A partial refund
 *  (lib/commerce/checkout.ts recordPartialCommerceRefund) leaves the order's status alone — the schema's
 *  status check has no partial state and the sale partly stands — and records the amounts in
 *  `metadata.refund`. A summary that reads `status` alone therefore counts a half-refunded order at full
 *  gross. Returns 0 for anything that is not a well-formed partial record, and never more than the order.
 *  PURE. */
export function partialRefundedCents(metadata: unknown, amountCents: number): number {
  const refund = (metadata as { refund?: unknown } | null | undefined)?.refund as
    | { kind?: unknown; refunded_cents?: unknown }
    | null
    | undefined
  if (!refund || refund.kind !== 'partial') return 0
  const cents = Number(refund.refunded_cents)
  if (!Number.isFinite(cents) || cents <= 0) return 0
  return Math.min(Math.round(cents), Math.max(0, amountCents))
}

/** A Space's earnings summary for the Orders tab header / StatCards. Gross + platform fee on settled
 *  orders (paid / fulfilled), refunded total across BOTH fully refunded orders and the partial refunds
 *  recorded on still-settled ones (LIVE-160), net = gross − fee. Optional trailing
 *  window (`sinceDays`, by created_at). Server-only; FAIL-SAFE to zeros so the header never breaks. */
export interface SpaceEarnings {
  grossCents: number
  feeCents: number
  netCents: number
  refundedCents: number
  orderCount: number
  // Phase 5 (ADR-811 §A, the honest receipt): the slice of settled gross the NETWORK sourced (orders with
  // source='network'), the platform's take on ONLY that slice, and how many such orders. Pre-attribution
  // rows default to 'self' (the migration backfill), so they never inflate the network figure. This makes
  // brand promise #4 provable: "we earn only on the business the network brings you, and here it is".
  networkGrossCents: number
  networkFeeCents: number
  networkOrderCount: number
}

/**
 * THE TICKET ARM (LIVE-375).
 *
 * 🔴 WHY THIS EXISTS. This summary read `commerce_orders` and nothing else, and an event ticket sale
 * does not write `commerce_orders` -- it writes `event_tickets`, through `settle_ticket_atomic`. The
 * two never met, so a Space that had sold tickets read $0.00 under a line that said "No sales yet".
 * Measured on 2026-09-16: `commerce_orders` held ZERO rows platform-wide while a Space had a
 * succeeded $44.00 ticket, so there was no Space for which the number was right.
 *
 * WHICH EVENTS COUNT AS THE SPACE'S. `host_space_id` is the hosting field -- it is what
 * `payoutProfileId` resolves through, so it is the one that decides where the money was aimed. An
 * event that names no host Space but BELONGS to this one (`space_id`, no `host_space_id`) counts
 * too, because that is the shape every Space-created event had before hosting was a separate field,
 * and excluding it would under-report a Space's own back catalogue.
 *
 * ⚠️ WHAT THIS DELIBERATELY DOES NOT DO. It adds nothing to the NETWORK slice. `event_tickets` has
 * no `source` column, so there is no honest way to say a ticket sale was network-sourced, and the
 * rule beside `networkGrossCents` is that anything not explicitly 'network' must never inflate it --
 * brand promise #4 is only provable while that number cannot be overstated. Tickets therefore land
 * in gross and in the fee, and in neither network figure.
 *
 * The window is measured on `succeeded_at`, the instant the money actually landed, rather than on
 * `created_at`: a ticket row is created when checkout opens, which can be days earlier on a delayed
 * settlement and is not when the Space earned anything.
 */
async function ticketEarnings(spaceId: string, sinceDays?: number, strict = false): Promise<SpaceEarnings> {
  const out: SpaceEarnings = {
    grossCents: 0,
    feeCents: 0,
    netCents: 0,
    refundedCents: 0,
    orderCount: 0,
    networkGrossCents: 0,
    networkFeeCents: 0,
    networkOrderCount: 0,
  }

  // Two steps rather than an embedded join: the "hosted by us, or ours and hosted by nobody" rule is
  // an OR across two columns of the PARENT row, which an embedded filter cannot express without
  // turning the inner join into a condition the outer query no longer controls.
  const eventQuery = db()
    .from('events')
    .select('id')
    .or(`host_space_id.eq.${spaceId},and(space_id.eq.${spaceId},host_space_id.is.null)`)
  const { data: evRows } = strict ? await completeEarningsRead(eventQuery) : await eventQuery
  const eventIds = ((evRows ?? []) as { id: string }[]).map((e) => e.id).filter(Boolean)
  if (eventIds.length === 0) return out

  let q = db()
    .from('event_tickets')
    .select('id, currency, amount_cents, platform_fee_cents, status, refunded_at')
    .in('event_id', eventIds)
    .not('succeeded_at', 'is', null)
  if (sinceDays && sinceDays > 0) {
    q = q.gte('succeeded_at', new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000).toISOString())
  }
  const { data } = strict ? await completeEarningsRead(q) : await q
  if (strict) assertUsdEarningsRows(data ?? [])
  const rows = (data ?? []) as {
    amount_cents?: number | null
    platform_fee_cents?: number | null
    status?: string | null
    refunded_at?: string | null
  }[]

  for (const r of rows) {
    const amt = Number(r.amount_cents) || 0
    const fee = Number(r.platform_fee_cents) || 0
    // `refund_ticket_atomic` sets BOTH the status and the stamp; either alone is enough to mean
    // refunded, and reading both means a hand-repaired row cannot be counted as revenue twice.
    // A ticket refund is all-or-nothing today -- there is no partial-refund record on these rows
    // the way `commerce_orders.metadata` carries one -- so a refunded ticket moves its whole amount.
    if (r.status === 'refunded' || r.refunded_at) {
      out.refundedCents += amt
      out.orderCount += 1
    } else if (r.status === 'succeeded') {
      out.grossCents += amt
      out.feeCents += fee
      out.orderCount += 1
    }
  }
  out.netCents = out.grossCents - out.feeCents
  return out
}

/**
 * THE DONATION ARM (LIVE-431).
 *
 * Same leftover class as LIVE-375. A gift to a Space fund writes `space_donations` through
 * `recordSpaceDonationFromSession`. It never writes `commerce_orders`. After the ticket arm, a
 * Space that had taken gifts still read $0.00 under "No sales yet" whenever the only money was
 * the fund.
 *
 * UNLIKE tickets, `space_donations.source` is the effective order source the fee was billed at
 * (`self` | `network`). A network-sourced gift therefore lands in the network slice, the same
 * rule `commerce_orders` already uses: only an explicit `network` counts. A signed-out donor
 * degrades to `self` at checkout, so those gifts cannot inflate the network figure.
 *
 * The window is `succeeded_at`, matching tickets. Pending and abandoned rows never get that
 * stamp. A refund is recognised by status or `refunded_at`, same as tickets.
 *
 * Memberships stay out of this arm. `space_memberships` has no amount and no invoice ledger, so
 * summing a tier price on `started_at` would invent renewals that never happened.
 */
async function donationEarnings(spaceId: string, sinceDays?: number, strict = false): Promise<SpaceEarnings> {
  const out: SpaceEarnings = {
    grossCents: 0,
    feeCents: 0,
    netCents: 0,
    refundedCents: 0,
    orderCount: 0,
    networkGrossCents: 0,
    networkFeeCents: 0,
    networkOrderCount: 0,
  }
  if (!spaceId) return out

  let q = db()
    .from('space_donations')
    .select('id, currency, amount_cents, platform_fee_cents, status, refunded_at, source')
    .eq('space_id', spaceId)
    .not('succeeded_at', 'is', null)
  if (sinceDays && sinceDays > 0) {
    q = q.gte('succeeded_at', new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000).toISOString())
  }
  const { data } = strict ? await completeEarningsRead(q) : await q
  if (strict) assertUsdEarningsRows(data ?? [])
  const rows = (data ?? []) as {
    amount_cents?: number | null
    platform_fee_cents?: number | null
    status?: string | null
    refunded_at?: string | null
    source?: string | null
  }[]

  for (const r of rows) {
    const amt = Number(r.amount_cents) || 0
    const fee = Number(r.platform_fee_cents) || 0
    if (r.status === 'refunded' || r.refunded_at) {
      out.refundedCents += amt
      out.orderCount += 1
    } else if (r.status === 'succeeded') {
      out.grossCents += amt
      out.feeCents += fee
      out.orderCount += 1
      if (r.source === 'network') {
        out.networkGrossCents += amt
        out.networkFeeCents += fee
        out.networkOrderCount += 1
      }
    }
  }
  out.netCents = out.grossCents - out.feeCents
  return out
}

/**
 * THE SPLIT-SHARE ARM (LIVE-624).
 *
 * A split order names no owner, so the commerce_orders read above never finds it, and its whole
 * amount would sit under nobody's earnings. This Space's claim on it is its transfer row: gross is
 * the transfer plus the fee kept from it, the fee is that fee, never the cart's. A refund is read off
 * the ORDER the same way the arm above reads it (status, or the partial-refund record), and a partial
 * refund is taken from this share pro rata to its part of the order, the rule ADR-1565 set for a split
 * refund. Nothing here counts toward the NETWORK slice: a split order records one source for the whole
 * cart, not per share, so the rule beside networkGrossCents (never overstate it) keeps shares out.
 * The window is the order's created_at, matching the arm above.
 */
async function splitShareEarnings(spaceId: string, sinceDays?: number, strict = false): Promise<SpaceEarnings> {
  const out: SpaceEarnings = {
    grossCents: 0,
    feeCents: 0,
    netCents: 0,
    refundedCents: 0,
    orderCount: 0,
    networkGrossCents: 0,
    networkFeeCents: 0,
    networkOrderCount: 0,
  }
  const rows = await sellerShareRows({ kind: 'space', id: spaceId }, undefined, strict)
  if (!rows.length) return out
  const byOrder = new Map(rows.map((r) => [r.order_id, r]))
  let q = db()
    .from('commerce_orders')
    .select('id, currency, amount_cents, status, metadata')
    .in('id', [...byOrder.keys()])
    .eq('funds_flow', 'separate')
  if (sinceDays && sinceDays > 0) {
    q = q.gte('created_at', new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000).toISOString())
  }
  const { data, error } = strict ? await completeEarningsRead(q) : await q
  if (error) throw new Error(`split orders unreadable: ${error.message}`)
  if (strict) assertUsdEarningsRows(data ?? [])
  for (const o of (data ?? []) as { id: string; amount_cents?: number | null; status?: string; metadata?: unknown }[]) {
    const row = byOrder.get(o.id)
    if (!row) continue
    const gross = row.amount_cents + row.platform_fee_cents
    const fee = row.platform_fee_cents
    const orderAmount = Number(o.amount_cents) || 0
    if (o.status === 'refunded') {
      out.refundedCents += gross
      out.orderCount += 1
    } else if (o.status === 'paid' || o.status === 'fulfilled') {
      const orderRefunded = partialRefundedCents(o.metadata, orderAmount)
      const refunded = orderAmount > 0 ? Math.min(gross, Math.round((orderRefunded * gross) / orderAmount)) : 0
      const feeRefunded = gross > 0 ? Math.min(fee, Math.round((fee * refunded) / gross)) : 0
      out.grossCents += gross - refunded
      out.feeCents += fee - feeRefunded
      out.refundedCents += refunded
      out.orderCount += 1
    }
  }
  out.netCents = out.grossCents - out.feeCents
  return out
}

/** strict=true rejects any errored or truncated source; default retains the legacy dashboard fallback. */
export async function spaceEarningsSummary(spaceId: string, sinceDays?: number, strict = false): Promise<SpaceEarnings> {
  const empty: SpaceEarnings = {
    grossCents: 0,
    feeCents: 0,
    netCents: 0,
    refundedCents: 0,
    orderCount: 0,
    networkGrossCents: 0,
    networkFeeCents: 0,
    networkOrderCount: 0,
  }
  if (!spaceId) {
    if (strict) throw new Error('complete earnings requires a Space')
    return empty
  }
  try {
    let query = db()
      .from('commerce_orders')
      // `metadata` carries the partial-refund record (LIVE-160); without it a half-refunded order that
      // keeps its 'paid' status is counted at full gross.
      .select('id, currency, amount_cents, platform_fee_cents, status, source, metadata')
      .eq('owner_space_id', spaceId)
      .neq('status', 'pending')
    if (sinceDays && sinceDays > 0) {
      const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000).toISOString()
      query = query.gte('created_at', since)
    }
    const { data } = strict ? await completeEarningsRead(query) : await query
    if (strict) assertUsdEarningsRows(data ?? [])
    const rows = (data ?? []) as {
      amount_cents?: number | null
      platform_fee_cents?: number | null
      status?: string
      source?: string | null
      metadata?: unknown
    }[]
    const out = { ...empty }
    for (const r of rows) {
      const amt = Number(r.amount_cents) || 0
      const fee = Number(r.platform_fee_cents) || 0
      // Count only meaningful (settled / refunded) orders, so orderCount agrees with the money figures.
      // A failed / cancelled row contributes nothing and must not inflate the count.
      if (r.status === 'refunded') {
        out.refundedCents += amt
        out.orderCount += 1
      } else if (r.status === 'paid' || r.status === 'fulfilled') {
        // A PARTIALLY refunded order is still 'paid' (the sale partly stands), so status alone reads it
        // at full gross and the widget overstates earnings by the refunded share. Net it out here, and
        // pro-rate the fee the same way Stripe does on a partial refund with refund_application_fee —
        // the identical share recordPartialCommerceRefund reverses in the ledger, so this summary and
        // the ledger agree instead of drifting by the refunded slice (LIVE-160).
        const refunded = partialRefundedCents(r.metadata, amt)
        const feeRefunded = amt > 0 ? Math.min(fee, Math.round((fee * refunded) / amt)) : 0
        out.grossCents += amt - refunded
        out.feeCents += fee - feeRefunded
        out.refundedCents += refunded
        out.orderCount += 1
        // The network-sourced split: only orders the collective attributed as 'network' (default-safe to
        // self on null / anything else, so the 0%-fee promise is never overstated as network revenue).
        if (r.source === 'network') {
          out.networkGrossCents += amt - refunded
          out.networkFeeCents += fee - feeRefunded
          out.networkOrderCount += 1
        }
      }
    }
    out.netCents = out.grossCents - out.feeCents

    // THE TICKET ARM, added rather than replacing (LIVE-375). Its own try/catch is INSIDE the
    // helper's caller here rather than around the pair, so a failure to read tickets returns the
    // commerce number instead of collapsing the whole header to zeros -- the same fail-safe posture
    // the outer catch takes, applied at the finer grain the second source makes possible.
    let tickets: SpaceEarnings | null = null
    try {
      tickets = await ticketEarnings(spaceId, sinceDays, strict)
    } catch (error) {
      if (strict) throw error
      tickets = null
    }
    if (tickets) {
      out.grossCents += tickets.grossCents
      out.feeCents += tickets.feeCents
      out.refundedCents += tickets.refundedCents
      out.orderCount += tickets.orderCount
      // networkGross / networkFee / networkOrderCount are deliberately untouched; see ticketEarnings.
      out.netCents = out.grossCents - out.feeCents
    }

    // THE DONATION ARM (LIVE-431). Own try/catch, same posture as tickets: a failure to read
    // gifts returns the commerce+ticket number instead of collapsing the header to zeros.
    let donations: SpaceEarnings | null = null
    try {
      donations = await donationEarnings(spaceId, sinceDays, strict)
    } catch (error) {
      if (strict) throw error
      donations = null
    }
    if (donations) {
      out.grossCents += donations.grossCents
      out.feeCents += donations.feeCents
      out.refundedCents += donations.refundedCents
      out.orderCount += donations.orderCount
      out.networkGrossCents += donations.networkGrossCents
      out.networkFeeCents += donations.networkFeeCents
      out.networkOrderCount += donations.networkOrderCount
      out.netCents = out.grossCents - out.feeCents
    }

    // THE SPLIT-SHARE ARM (LIVE-624). Own try/catch, same posture: an unreadable ledger returns the
    // other arms' number rather than zeros. Network figures untouched; see splitShareEarnings.
    let shares: SpaceEarnings | null = null
    try {
      shares = await splitShareEarnings(spaceId, sinceDays, strict)
    } catch (error) {
      if (strict) throw error
      shares = null
    }
    if (shares) {
      out.grossCents += shares.grossCents
      out.feeCents += shares.feeCents
      out.refundedCents += shares.refundedCents
      out.orderCount += shares.orderCount
      out.netCents = out.grossCents - out.feeCents
    }
    return out
  } catch (error) {
    if (strict) throw error
    return empty
  }
}

/** All orders (operator view), optionally filtered by status. */
export async function listAllOrders(opts: { status?: OrderStatus; limit?: number } = {}): Promise<CommerceOrder[]> {
  let query = db()
    .from('commerce_orders')
    .select(ORDER_COLS)
    .order('created_at', { ascending: false })
    .limit(LIMIT(opts.limit))
  if (opts.status) query = query.eq('status', opts.status)
  const { data } = await query
  return ((data ?? []) as unknown as Record<string, unknown>[]).map(rowToOrder)
}

/** Status counts for the operator orders header (paid / refunded / fulfilled / failed). */
export async function orderStatusCounts(): Promise<Record<string, number>> {
  const { data } = await db().from('commerce_orders').select('status')
  const counts: Record<string, number> = {}
  for (const r of (data ?? []) as { status: string }[]) counts[r.status] = (counts[r.status] ?? 0) + 1
  return counts
}

/** Display names for the sellers a surface is about to list (the operator's transfer ledger, the
 *  buyer's lines of a split order), keyed `profile:<id>` / `space:<id>`. One read per table.
 *  FAIL-SAFE to an empty map: a missing name falls back to the seller kind, never to an error. */
export async function sellerNames(sellers: Array<{ kind: string; profileId: string | null; spaceId: string | null }>): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const profileIds = [...new Set(sellers.filter((s) => s.kind === 'profile' && s.profileId).map((s) => s.profileId as string))]
  const spaceIds = [...new Set(sellers.filter((s) => s.kind === 'space' && s.spaceId).map((s) => s.spaceId as string))]
  try {
    const [profiles, spaces] = await Promise.all([
      profileIds.length ? db().from('profiles').select('id, display_name').in('id', profileIds) : Promise.resolve({ data: [] }),
      spaceIds.length ? db().from('spaces').select('id, name').in('id', spaceIds) : Promise.resolve({ data: [] }),
    ])
    for (const p of (profiles.data ?? []) as { id: string; display_name?: string | null }[]) {
      if (p.display_name) out.set(`profile:${p.id}`, p.display_name)
    }
    for (const sp of (spaces.data ?? []) as { id: string; name?: string | null }[]) {
      if (sp.name) out.set(`space:${sp.id}`, sp.name)
    }
  } catch {
    // Names are decoration here; the figures beside them are what the surface is for.
  }
  return out
}

/** The key sellerNames() files a seller's name under. PURE. */
export function sellerNameKey(s: { kind: string; profileId: string | null; spaceId: string | null }): string {
  return s.kind === 'space' ? `space:${s.spaceId}` : `profile:${s.profileId}`
}
