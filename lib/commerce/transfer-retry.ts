// THE OPERATOR'S RETRY OF ONE TRANSFER (LIVE-624, ADR-1616; PROG-D8 piece 4). MONEY CODE. Server-only.
//
// The reconciler (./transfers.ts reconcileTransfers) retries a planned or failed transfer on its own
// until MAX_TRANSFER_ATTEMPTS, then logs it as stuck every run and stops trying. ADR-1614 §7 named
// the way back: an operator retry. This is it, and it adds NO second payment path. It sends the row
// through the same executePlannedTransfers the settle and the reconciler use, so all four of that
// module's never-twice guarantees hold unchanged: one row per seller, the compare-and-set claim, the
// idempotency key fixed to the row, and the adoption lookup before any retry creates.
//
// THE ONE WRITE HERE lifts the attempt ceiling by exactly ONE attempt on a stuck row: attempts goes
// from the ceiling (or above) to one under it, compare-and-set on the value read and on a not-yet-
// landed status. It never goes to zero, and that is load-bearing: the adoption lookup (guarantee 4)
// runs only when attempts > 0, so a row reset to zero would call create without first asking Stripe
// whether a transfer for it already exists, which after the 24 hour key window is a second payment.
//
// A row whose order is no longer payable (refunded, cancelled) is refused before the ceiling moves,
// so a held row is not handed back to the reconciler to be held again every half hour.
//
// authz-delegated: every caller is retryOrderTransferAction (app/(main)/admin/marketplace/actions.ts),
// which runs requireOperator (platform staff) before it reaches here. The ledger is service role only
// (RLS on, no policy), so there is no member session this could run under.

import { createAdminClient } from '@/lib/supabase/admin'
import { log } from '@/lib/log'
import { executePlannedTransfers, MAX_TRANSFER_ATTEMPTS, type TransferStatus } from './transfers'

const TABLE = 'commerce_order_transfers'
const OPEN: TransferStatus[] = ['planned', 'failed']

export type RetryTransferResult =
  | { ok: true; status: TransferStatus; lastError: string | null }
  | { ok: false; error: string }

/** Send one planned or failed transfer again, as an operator. Never throws: every refusal is a
 *  sentence the operator reads. `ok: true` means the attempt ran; `status` says how it ended (a
 *  failed attempt is recorded on the row with its error, exactly as the reconciler's would be). */
export async function retryOrderTransfer(transferId: string): Promise<RetryTransferResult> {
  if (!transferId) return { ok: false, error: 'No transfer was named.' }
  const db = createAdminClient()

  const { data: found, error: readErr } = await db
    .from(TABLE)
    .select('id, order_id, status, attempts')
    .eq('id', transferId)
    .maybeSingle()
  if (readErr) return { ok: false, error: 'Could not read that transfer. Try again in a moment.' }
  const row = found as { id: string; order_id: string; status: TransferStatus; attempts: number } | null
  if (!row) return { ok: false, error: 'That transfer is not on record.' }
  if (!OPEN.includes(row.status)) return { ok: false, error: 'That transfer already landed, so there is nothing to send again.' }

  const { data: order, error: orderErr } = await db
    .from('commerce_orders')
    .select('status, refunded_at')
    .eq('id', row.order_id)
    .maybeSingle()
  if (orderErr) return { ok: false, error: 'Could not read the order. Try again in a moment.' }
  const o = order as { status: string; refunded_at: string | null } | null
  // A PARTIAL refund stamps refunded_at and leaves the status paid, and its sellers are still paid
  // their shares (the refund reverses each one pro rata), exactly as the reconciler's
  // orderIsPayable reads it. Only a full refund (status 'refunded') stops the transfer.
  if (!o || !(o.status === 'paid' || o.status === 'fulfilled')) {
    return { ok: false, error: 'This order was refunded or never completed, so its sellers are not paid.' }
  }

  if (row.attempts >= MAX_TRANSFER_ATTEMPTS) {
    // One more attempt, never a fresh start (see the header: attempts must stay above zero).
    const { data: lifted, error: liftErr } = await db
      .from(TABLE)
      .update({ attempts: MAX_TRANSFER_ATTEMPTS - 1 })
      .eq('id', row.id)
      .eq('attempts', row.attempts)
      .in('status', OPEN)
      .select('id')
    if (liftErr) return { ok: false, error: 'Could not reopen that transfer. Try again in a moment.' }
    if (!(lifted ?? []).length) return { ok: false, error: 'That transfer changed while you were looking. Reload to see where it stands.' }
  }

  try {
    const run = await executePlannedTransfers(row.order_id)
    log.info('commerce.transfer.operator_retry', { orderId: row.order_id, rowId: row.id, ...run })
  } catch (err) {
    log.error('commerce.transfer.operator_retry_failed', {
      orderId: row.order_id,
      rowId: row.id,
      error: err instanceof Error ? err.message : String(err),
    })
    return { ok: false, error: 'The retry could not run. Try again in a moment.' }
  }

  const { data: after } = await db.from(TABLE).select('status, last_error').eq('id', row.id).maybeSingle()
  const now = after as { status: TransferStatus; last_error: string | null } | null
  return { ok: true, status: now?.status ?? row.status, lastError: now?.last_error ?? null }
}
