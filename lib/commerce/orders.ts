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
