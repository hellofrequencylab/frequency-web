// Member-facing order disputes / refund requests (ADR-597, Phase 8). A buyer opens a dispute on
// their own order; it lands in a queue operators (and the seller, read-only) resolve. Mirrors the
// reports triage shape (lib/commerce/reports.ts); the difference is a dispute is scoped to an ORDER
// and resolving it can move money (refundCommerceOrder) once payments are on. Server-only (admin
// client behind app-code authz).
//
// types: regenerated after the 20261112000000_commerce_reviews migration applies. Until then db()
// is annotated as the untyped SupabaseClient so `.from('commerce_disputes')` type-checks (same idiom
// as lib/commerce/reports.ts).

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'

function db(): SupabaseClient {
  return createAdminClient()
}

export type DisputeStatus = 'open' | 'reviewing' | 'resolved_refund' | 'resolved_denied' | 'cancelled'

/** The live (unresolved) statuses that make up the operator work queue. */
export const OPEN_DISPUTE_STATUSES: readonly DisputeStatus[] = ['open', 'reviewing'] as const

export interface CommerceDispute {
  id: string
  orderId: string
  openerProfileId: string | null
  reason: string
  detail: string | null
  status: DisputeStatus
  resolutionNote: string | null
  resolvedBy: string | null
  resolvedAt: string | null
  createdAt: string
}

const COLS =
  'id, order_id, opener_profile_id, reason, detail, status, resolution_note, resolved_by, resolved_at, created_at'

function rowToDispute(r: Record<string, unknown>): CommerceDispute {
  return {
    id: r.id as string,
    orderId: r.order_id as string,
    openerProfileId: (r.opener_profile_id as string) ?? null,
    reason: r.reason as string,
    detail: (r.detail as string) ?? null,
    status: r.status as DisputeStatus,
    resolutionNote: (r.resolution_note as string) ?? null,
    resolvedBy: (r.resolved_by as string) ?? null,
    resolvedAt: (r.resolved_at as string) ?? null,
    createdAt: r.created_at as string,
  }
}

/** Open a dispute on an order. Caller MUST already be authorized as the order's buyer. Refuses a
 *  duplicate while one is still live (open/reviewing) for the order. Returns the new id, or null. */
export async function openDispute(input: {
  orderId: string
  openerProfileId: string
  reason: string
  detail?: string | null
}): Promise<string | null> {
  const reason = input.reason.trim().slice(0, 200)
  if (!reason) return null
  // Guard against a second live dispute (the DB also enforces this with a partial unique index).
  const existing = await getLiveDisputeForOrder(input.orderId)
  if (existing) return null
  const { data, error } = await db()
    .from('commerce_disputes')
    .insert({
      order_id: input.orderId,
      opener_profile_id: input.openerProfileId,
      reason,
      detail: input.detail?.trim().slice(0, 2000) || null,
    })
    .select('id')
    .maybeSingle()
  if (error || !data) return null
  return (data as { id: string }).id
}

/** The live (open/reviewing) dispute for an order, or null. Powers the buyer's order card so it
 *  shows status instead of re-offering "Open a dispute". */
export async function getLiveDisputeForOrder(orderId: string): Promise<CommerceDispute | null> {
  if (!orderId) return null
  const { data } = await db()
    .from('commerce_disputes')
    .select(COLS)
    .eq('order_id', orderId)
    .in('status', OPEN_DISPUTE_STATUSES as unknown as string[])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data ? rowToDispute(data as Record<string, unknown>) : null
}

/** The most recent dispute (any status) per order id, for decorating a buyer's order list. Returns
 *  a Map keyed by order id. Fail-safe to an empty Map. */
export async function disputesForOrders(orderIds: string[]): Promise<Map<string, CommerceDispute>> {
  const out = new Map<string, CommerceDispute>()
  const ids = Array.from(new Set(orderIds.filter(Boolean)))
  if (ids.length === 0) return out
  try {
    const { data } = await db()
      .from('commerce_disputes')
      .select(COLS)
      .in('order_id', ids)
      .order('created_at', { ascending: false })
    for (const row of (data ?? []) as Record<string, unknown>[]) {
      const d = rowToDispute(row)
      if (!out.has(d.orderId)) out.set(d.orderId, d) // newest first, so keep the first seen
    }
    return out
  } catch {
    return out
  }
}

/** The dispute queue, newest first. Defaults to the open + reviewing work. */
export async function listDisputes(
  opts: { status?: DisputeStatus | 'queue'; limit?: number } = {},
): Promise<CommerceDispute[]> {
  let query = db()
    .from('commerce_disputes')
    .select(COLS)
    .order('created_at', { ascending: false })
    .limit(Math.min(Math.max(opts.limit ?? 100, 1), 300))
  if (opts.status && opts.status !== 'queue') query = query.eq('status', opts.status)
  else if (opts.status === 'queue') query = query.in('status', OPEN_DISPUTE_STATUSES as unknown as string[])
  const { data } = await query
  return ((data ?? []) as Record<string, unknown>[]).map(rowToDispute)
}

export async function disputeStatusCounts(): Promise<Record<string, number>> {
  const { data } = await db().from('commerce_disputes').select('status')
  const counts: Record<string, number> = {}
  for (const r of (data ?? []) as { status: string }[]) counts[r.status] = (counts[r.status] ?? 0) + 1
  return counts
}

/** Record a dispute resolution (or a status advance). `resolvedBy` + `resolvedAt` are stamped for
 *  the terminal states; a move to 'reviewing' just advances the queue. Throws on error. */
export async function setDisputeStatus(
  id: string,
  status: DisputeStatus,
  opts: { resolvedBy?: string | null; resolutionNote?: string | null } = {},
): Promise<void> {
  const terminal = status === 'resolved_refund' || status === 'resolved_denied' || status === 'cancelled'
  const patch: Record<string, unknown> = { status, updated_at: new Date().toISOString() }
  if (terminal) {
    patch.resolved_at = new Date().toISOString()
    patch.resolved_by = opts.resolvedBy ?? null
  }
  if (opts.resolutionNote !== undefined) patch.resolution_note = opts.resolutionNote?.trim().slice(0, 2000) || null
  const { error } = await db().from('commerce_disputes').update(patch).eq('id', id)
  if (error) throw new Error(error.message)
}

/** The order behind a dispute (id, owner, status) — the operator resolver needs owner_kind + status
 *  to decide whether a refund can move money. Returns null if missing. */
export async function orderForDispute(
  disputeId: string,
): Promise<{ orderId: string; ownerKind: string; status: string } | null> {
  const { data } = await db().from('commerce_disputes').select('order_id').eq('id', disputeId).maybeSingle()
  const orderId = data ? ((data as { order_id?: string }).order_id ?? null) : null
  if (!orderId) return null
  const { data: order } = await db()
    .from('commerce_orders')
    .select('id, owner_kind, status')
    .eq('id', orderId)
    .maybeSingle()
  if (!order) return null
  const o = order as { id: string; owner_kind: string; status: string }
  return { orderId: o.id, ownerKind: o.owner_kind, status: o.status }
}
