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
 *  a Space's orders are invisible through the maker path (ADR-593). Paid+ states only. */
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

/** A Space's earnings summary for the Orders tab header / StatCards. Gross + platform fee on settled
 *  orders (paid / fulfilled), refunded total on refunded orders, net = gross − fee. Optional trailing
 *  window (`sinceDays`, by created_at). Server-only; FAIL-SAFE to zeros so the header never breaks. */
export interface SpaceEarnings {
  grossCents: number
  feeCents: number
  netCents: number
  refundedCents: number
  orderCount: number
}

export async function spaceEarningsSummary(spaceId: string, sinceDays?: number): Promise<SpaceEarnings> {
  const empty: SpaceEarnings = { grossCents: 0, feeCents: 0, netCents: 0, refundedCents: 0, orderCount: 0 }
  if (!spaceId) return empty
  try {
    let query = db()
      .from('commerce_orders')
      .select('amount_cents, platform_fee_cents, status')
      .eq('owner_space_id', spaceId)
      .neq('status', 'pending')
    if (sinceDays && sinceDays > 0) {
      const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000).toISOString()
      query = query.gte('created_at', since)
    }
    const { data } = await query
    const rows = (data ?? []) as { amount_cents?: number | null; platform_fee_cents?: number | null; status?: string }[]
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
        out.grossCents += amt
        out.feeCents += fee
        out.orderCount += 1
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

/** A Space's trailing processed volume (cents) from paid commerce orders over the last `sinceDays`
 *  (default 30). The per-space money read the "you'd have saved $X" upgrade nudge uses (ADR-552): the
 *  savings = the take-rate bps delta applied to this volume. Sums settled orders (paid / fulfilled) by
 *  paid_at; a pending / failed / refunded order is not processed revenue. Server-only; FAIL-SAFE to 0.
 *  NOTE: this covers COMMERCE orders (the one per-space money read that exists today); ticket / tip /
 *  membership-dues channels are not yet aggregated per space, so the figure undercounts those. */
export async function spaceTrailingProcessedCents(spaceId: string, sinceDays = 30): Promise<number> {
  if (!spaceId) return 0
  const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000).toISOString()
  const { data } = await db()
    .from('commerce_orders')
    .select('amount_cents')
    .eq('owner_space_id', spaceId)
    .in('status', ['paid', 'fulfilled'])
    .gte('paid_at', since)
  let sum = 0
  for (const r of (data ?? []) as { amount_cents?: number | null }[]) {
    const c = Number(r.amount_cents)
    if (Number.isFinite(c) && c > 0) sum += c
  }
  return sum
}

/** Status counts for the operator orders header (paid / refunded / fulfilled / failed). */
export async function orderStatusCounts(): Promise<Record<string, number>> {
  const { data } = await db().from('commerce_orders').select('status')
  const counts: Record<string, number> = {}
  for (const r of (data ?? []) as { status: string }[]) counts[r.status] = (counts[r.status] ?? 0) + 1
  return counts
}
