// Order reads for the commerce core (ADR-39X). Buyers see what they bought, sellers
// (makers / Spaces) see their sales, operators see everything + can refund. Server-only
// (admin client behind app-code authz); settlement + refund live in ./checkout.ts.

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import type { OrderStatus, OwnerKind, FulfillmentStatus } from './types'

function db(): SupabaseClient {
  return createAdminClient()
}

export interface OrderItem {
  id: string
  title: string
  qty: number
  unitCents: number
  subtotalCents: number
}

export interface CommerceOrder {
  id: string
  buyerProfileId: string | null
  ownerKind: OwnerKind
  ownerProfileId: string | null
  ownerSpaceId: string | null
  amountCents: number
  platformFeeCents: number
  currency: string
  status: OrderStatus
  fulfillmentStatus: FulfillmentStatus
  createdAt: string
  paidAt: string | null
  refundedAt: string | null
  items: OrderItem[]
}

const ORDER_COLS =
  'id, buyer_profile_id, owner_kind, owner_profile_id, owner_space_id, amount_cents, platform_fee_cents, ' +
  'currency, status, fulfillment_status, created_at, paid_at, refunded_at, ' +
  'commerce_order_items(id, title, qty, unit_cents, subtotal_cents)'

function rowToOrder(r: Record<string, unknown>): CommerceOrder {
  const rawItems = Array.isArray(r.commerce_order_items) ? r.commerce_order_items : []
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
    createdAt: r.created_at as string,
    paidAt: (r.paid_at as string) ?? null,
    refundedAt: (r.refunded_at as string) ?? null,
    items: (rawItems as Record<string, unknown>[]).map((it) => ({
      id: it.id as string,
      title: it.title as string,
      qty: it.qty as number,
      unitCents: it.unit_cents as number,
      subtotalCents: it.subtotal_cents as number,
    })),
  }
}

const LIMIT = (n?: number) => Math.min(Math.max(n ?? 50, 1), 200)

/** A buyer's own orders, newest first. Only paid+ states (a pending checkout that was
 *  never completed isn't a purchase). */
export async function listOrdersForBuyer(profileId: string, opts: { limit?: number } = {}): Promise<CommerceOrder[]> {
  const { data } = await db()
    .from('commerce_orders')
    .select(ORDER_COLS)
    .eq('buyer_profile_id', profileId)
    .neq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(LIMIT(opts.limit))
  return ((data ?? []) as unknown as Record<string, unknown>[]).map(rowToOrder)
}

/** A maker's sales (orders for products they own), newest first. */
export async function listOrdersForSeller(profileId: string, opts: { limit?: number } = {}): Promise<CommerceOrder[]> {
  const { data } = await db()
    .from('commerce_orders')
    .select(ORDER_COLS)
    .eq('owner_profile_id', profileId)
    .neq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(LIMIT(opts.limit))
  return ((data ?? []) as unknown as Record<string, unknown>[]).map(rowToOrder)
}

/** A Space's sales (orders for products the Space owns), newest first. The Orders tab of the Shop
 *  console reads this — listOrdersForSeller filters owner_profile_id, which is NULL for a Space, so
 *  a Space's orders are invisible through the maker path (ADR-596). Paid+ states only. */
export async function listSpaceOrders(spaceId: string, opts: { limit?: number } = {}): Promise<CommerceOrder[]> {
  if (!spaceId) return []
  const { data } = await db()
    .from('commerce_orders')
    .select(ORDER_COLS)
    .eq('owner_space_id', spaceId)
    // Settled + refunded only: a failed / cancelled checkout is not a sale, so it must not pad the
    // Orders list or the count that sits beside the money figures (which sum settled orders only).
    .in('status', ['paid', 'fulfilled', 'refunded'])
    .order('created_at', { ascending: false })
    .limit(LIMIT(opts.limit))
  return ((data ?? []) as unknown as Record<string, unknown>[]).map(rowToOrder)
}

/** How many cents a PARTIAL refund took back off a still-settled order (LIVE-160). A partial refund
 *  (lib/commerce/checkout.ts recordPartialCommerceRefund) leaves the order's status alone — the schema's
 *  status check has no partial state and the sale partly stands — and records the amounts in
 *  `metadata.refund`. A summary that reads `status` alone therefore counts a half-refunded order at full
 *  gross. Returns 0 for anything that is not a well-formed partial record, and never more than the order.
 *  PURE. */
function partialRefundedCents(metadata: unknown, amountCents: number): number {
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

export async function spaceEarningsSummary(spaceId: string, sinceDays?: number): Promise<SpaceEarnings> {
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
  if (!spaceId) return empty
  try {
    let query = db()
      .from('commerce_orders')
      // `metadata` carries the partial-refund record (LIVE-160); without it a half-refunded order that
      // keeps its 'paid' status is counted at full gross.
      .select('amount_cents, platform_fee_cents, status, source, metadata')
      .eq('owner_space_id', spaceId)
      .neq('status', 'pending')
    if (sinceDays && sinceDays > 0) {
      const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000).toISOString()
      query = query.gte('created_at', since)
    }
    const { data } = await query
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
    return out
  } catch {
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
