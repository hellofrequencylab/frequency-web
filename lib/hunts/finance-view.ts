/**
 * The reconciling view and the sales kill switch (FH-040).
 *
 * Reconciliation matches what a source EXPECTED to be paid against what the provider reported, with
 * fees, refunds, the seller transfer and the live entitlements, and ages anything unresolved. The kill
 * switch closes NEW sales only: payment settlement, refund handling and reconciliation never read it,
 * so a simulated outage stops selling while the money keeps being accounted for.
 *
 * `matchReconciliation` is pure. `createReconciliationReader` is the injected reader that the Packet F
 * page (components/hunts/reconciliation-page.tsx) takes: it enforces scope on every read and returns only
 * the redacted projection, with a short hash in place of any source id.
 */
import { createHash } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { HuntReconciliationReader, HuntReconciliationScope } from './reconciliation-reader'
import type { Rpc } from './entitlements'

type ReconciliationInput = Readonly<{
  currency: string
  expectedAmountMinor: number
  providerAmountMinor: number | null
  providerCurrency?: string | null
  feeMinor: number
  refundedMinor: number
  transferMinor: number | null
  /** Entitlements still active, pending claim or suspended (not revoked, not consumed). */
  openEntitlements: number
  ageMinutes: number
}>

type ReconciliationVerdict = Readonly<{ status: 'matched' | 'pending' | 'exception'; note: string | null }>

/** An unmatched row older than this is an exception, not just pending. */
export const RECONCILIATION_PENDING_MINUTES = 24 * 60

/**
 * Compare expected against received. Currency or amount drift, a refund larger than the sale, a seller
 * transfer that does not equal the net of fees, and live benefits on a fully refunded source are all
 * exceptions. A row the provider has not reported yet is pending until it ages out.
 */
export function matchReconciliation(r: ReconciliationInput): ReconciliationVerdict {
  const bad = (note: string): ReconciliationVerdict => ({ status: 'exception', note })
  if (!Number.isSafeInteger(r.expectedAmountMinor) || r.expectedAmountMinor < 0) return bad('expected_amount_invalid')
  if (r.providerCurrency && r.providerCurrency.toUpperCase() !== r.currency.toUpperCase()) return bad('currency_mismatch')
  if (r.providerAmountMinor === null) {
    return r.ageMinutes > RECONCILIATION_PENDING_MINUTES ? bad('provider_record_missing') : { status: 'pending', note: 'awaiting_provider' }
  }
  if (r.providerAmountMinor !== r.expectedAmountMinor) return bad('amount_mismatch')
  if (r.refundedMinor > r.providerAmountMinor) return bad('refund_exceeds_sale')
  if (r.feeMinor > r.providerAmountMinor) return bad('fee_exceeds_sale')
  if (r.transferMinor !== null && r.refundedMinor === 0 && r.transferMinor !== r.providerAmountMinor - r.feeMinor) {
    return bad('transfer_mismatch')
  }
  if (r.refundedMinor === r.providerAmountMinor && r.openEntitlements > 0) return bad('refunded_with_open_benefit')
  return { status: 'matched', note: null }
}

/** Short, lowercase hexadecimal digest of a source. The view never shows a raw id. */
export function sourceHash(sourceType: string, sourceId: string): string {
  return createHash('sha256').update(`${sourceType}:${sourceId}`).digest('hex').slice(0, 12)
}

type Row = {
  source_type: 'event-ticket' | 'store-order'
  source_id: string
  currency: string
  expected_amount_minor: number
  status: 'matched' | 'pending' | 'exception'
  first_seen_at: string
  seller_space_id: string
}

const ORDER: Record<Row['status'], number> = { exception: 0, pending: 1, matched: 2 }

/** The reader the reconciliation page takes. Scope was authorized by the route; each query still applies it. */
export function createReconciliationReader(
  db: () => Pick<SupabaseClient, 'from'>,
  now: () => number = Date.now,
): HuntReconciliationReader {
  return async (scope: HuntReconciliationScope) => {
    let q = db()
      .from('hunt_reconciliation')
      .select('source_type, source_id, currency, expected_amount_minor, status, first_seen_at, seller_space_id')
      .order('first_seen_at', { ascending: false })
      .limit(200)
    if (scope.role === 'space-owner') q = q.eq('seller_space_id', scope.spaceId)
    else if (scope.role !== 'platform-admin') return []
    const { data, error } = await q
    if (error) throw new Error(`hunt_reconciliation read failed: ${error.message}`)
    const rows = (data ?? []) as Row[]
    return rows
      .map((r) => ({
        amountMinor: Number(r.expected_amount_minor),
        currency: r.currency,
        status: r.status,
        ageMinutes: Math.max(0, Math.floor((now() - new Date(r.first_seen_at).getTime()) / 60000)),
        sourceType: r.source_type,
        sourceHash: sourceHash(r.source_type, r.source_id),
      }))
      .sort((a, b) => ORDER[a.status] - ORDER[b.status] || b.ageMinutes - a.ageMinutes)
  }
}

/**
 * Are new sales open? Fails CLOSED: a read error or a missing row stops selling rather than guessing.
 * Callers check this before creating a pass or store-item checkout. It is never consulted by settlement,
 * refund handling or reconciliation.
 */
export async function huntSalesOpen(db: () => Pick<SupabaseClient, 'from'>): Promise<boolean> {
  try {
    const { data, error } = await db().from('hunt_commerce_state').select('sales_open').eq('id', true).maybeSingle()
    if (error || !data) return false
    return (data as { sales_open: boolean }).sales_open === true
  } catch {
    return false
  }
}

/** Flip the kill switch. Closing needs a reason; the database audits both directions. */
export async function setHuntSales(rpc: Rpc, open: boolean, actorProfileId: string, reason: string): Promise<boolean> {
  const { data, error } = await rpc('hunt_commerce_set_sales', { p_open: open, p_actor: actorProfileId, p_reason: reason })
  if (error) throw new Error(`hunt_commerce_set_sales failed: ${error.message}`)
  return data === true
}
