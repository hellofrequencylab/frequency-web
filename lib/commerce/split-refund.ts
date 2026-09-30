// A SPLIT REFUND (LIVE-623, ADR-1615; PROG-D8 piece 3). MONEY CODE. Server-only.
//
// A split order (funds_flow 'separate', ADR-1576) was one charge on the platform, and each seller
// was paid by a transfer after it (./transfers.ts, ADR-1614). A refund of that charge comes out of
// the platform balance. Before this module, the sellers kept their transfers and the platform paid
// the whole refund; `reverse_transfer` on the refund does nothing here, because the charge carries
// no transfer.
//
// THE RULE (ADR-1565 §3, built here): a refund, full or partial, comes out of every seller PRO RATA
// to their share of the order gross, and the platform fee is reduced in the same proportion. So a
// seller's part of a refund R on an order of gross G is R × (their transfer) / G: their share of
// the refund, less the fee the platform kept on that share. A full refund takes back each transfer
// whole. A lost dispute is the same thing as a refund of the disputed amount.
//
// THE SURFACE:
//   proportionRefund(refunded, splits)   PURE. Each share of a refund and the part of it that is a
//                                        reversal, largest-remainder rounded to sum exactly.
//   reverseSplitTransfers(orderId, n)    n = everything refunded on the order so far (cumulative).
//                                        Writes each row's target, cancels rows never paid when the
//                                        refund is full, then reverses what is owed now.
//   reverseSplitRefundForPaymentIntent   the same, found from a charge's PaymentIntent (webhook).
//   reconcileSplitReversals({ limit })   the cron: retry what is owed, log what is stuck.
//
// NEVER TWICE, NEVER TOO MUCH. The refund writes a TARGET on the row (refund_reversal_cents,
// cumulative, only ever raised, never above the transfer) before any money moves, so a reversal that
// fails is still owed and the reconciler finds it. A reversal then:
//   1. claims the row with a compare-and-set on reversal_attempts, so two workers cannot both call;
//   2. asks Stripe how much of the transfer is already reversed (amount_reversed), which counts a
//      reversal whose write here was lost and one made by hand in the dashboard;
//   3. reverses only target minus that, under the key transfer-reversal:<row>:<from>-<to>. The key
//      names the refund by where it moves this transfer from and to, which is what every caller of
//      the same refund knows identically: the refund action, its charge.refunded webhook (whose
//      payload carries the cumulative amount_refunded, not the refund's id) and a lost dispute
//      (which has no refund at all). A replay computes the same target, finds nothing owed and
//      calls nothing; a replay inside the key window with the write lost gets the same reversal back.
// Stripe itself refuses to reverse more than the transfer, and the target never asks for more.
//
// THE BUYER FIRST. The refund to the buyer is made before any reversal and never waits on one. A
// reversal that fails (the seller's balance is empty, the network) is recorded on the row, retried by
// /api/cron/reconcile-transfers under the same ceiling as transfers, and logged as stuck past it.
//
// A REFUND THAT PLANS THE ORDER (LIVE-739, ADR-1702). A partial refund of a paid split order the
// settle never planned writes the plan itself (below). The settle told nobody (it found no rows), and
// the reconciler now skips the order (it has rows), so the refund's plan call is the only one that
// can: each seller its insert returned is sent the settle's own sale notice through
// noticeRecoveredSellers (./transfers), before any target is written. A notice that fails is logged
// and holds up no reversal, no payout and nothing the buyer gets.
//
// NOT THE FINANCE LEDGER. The platform's revenue on a split order is its fee (ADR-1614 §4), and the
// refund recorder in ./checkout.ts already reverses that fee pro rata. A seller's transfer was never
// platform revenue, so its reversal is not a finance row either: the transfer table records it.

import type Stripe from 'stripe'
import type { SupabaseClient } from '@supabase/supabase-js'
import { stripe } from '@/lib/billing/stripe'
import { createAdminClient } from '@/lib/supabase/admin'
import { log, briefError } from '@/lib/log'
import {
  listOrderTransfers,
  planTransfersForOrder,
  noticeRecoveredSellers,
  cancelOpenTransfers,
  MAX_TRANSFER_ATTEMPTS,
  RECONCILE_STALE_MS,
  type OrderTransfer,
} from './transfers'

function db(): SupabaseClient {
  return createAdminClient()
}

const TABLE = 'commerce_order_transfers'

const int = (v: unknown): number | null => (typeof v === 'number' && Number.isInteger(v) ? v : null)

/** The Stripe idempotency key of one reversal: the row, and the cumulative reversed cents it moves
 *  the transfer from and to. Deterministic for every caller of the same refund. */
export function reversalIdempotencyKey(rowId: string, fromCents: number, toCents: number): string {
  return `transfer-reversal:${rowId}:${fromCents}-${toCents}`
}

// ── The proportion (pure) ───────────────────────────────────────────────────────────────────────

/** One seller share of an order, as the refund divides it. `transferCents` is what the seller was
 *  sent (gross minus the platform fee); a share the platform kept whole has `transferCents` 0. */
export interface RefundSplit {
  key: string
  grossCents: number
  transferCents: number
}

/** One share of a refund: `refundCents` is this share's part of what the buyer got back, split into
 *  `reversalCents` (taken back from the seller's transfer) and `platformCents` (the platform fee on
 *  that part, which the platform gives up). */
export interface RefundPart {
  key: string
  refundCents: number
  reversalCents: number
  platformCents: number
}

/**
 * Divide a refund across the seller shares of an order, pro rata to each share's gross. PURE.
 *
 * 1. The refund shares are largest-remainder rounded, so they sum EXACTLY to the refund (clamped to
 *    the order gross): the floor of each exact share first, then one cent each to the largest
 *    remainders, ties to the larger share and then to list order, so the answer is deterministic.
 * 2. Each refund share is split transfer:gross into the seller's reversal and the platform's fee.
 *    The reversal is floored, so a rounding cent is the platform's and never taken from a seller,
 *    and a full refund reverses each transfer exactly (a share of g returns g × t / g = t).
 * So a reversal never exceeds its transfer, and reversal + platform = refund for every share.
 */
export function proportionRefund(refundedCents: number, splits: RefundSplit[]): RefundPart[] {
  const clean = splits.map((s) => {
    const gross = Math.max(0, Math.trunc(Number(s.grossCents) || 0))
    return { key: s.key, gross, transfer: Math.max(0, Math.min(gross, Math.trunc(Number(s.transferCents) || 0))) }
  })
  const total = clean.reduce((n, s) => n + s.gross, 0)
  const zero = () => clean.map((s) => ({ key: s.key, refundCents: 0, reversalCents: 0, platformCents: 0 }))
  if (total <= 0) return zero()
  const refund = Math.max(0, Math.min(total, Math.round(Number.isFinite(refundedCents) ? refundedCents : 0)))
  if (refund === 0) return zero()

  // BigInt: a refund times a gross can pass 2^53 on an order of a few hundred thousand dollars.
  const bigRefund = BigInt(refund)
  const bigTotal = BigInt(total)
  const shares = clean.map((s, i) => {
    const exact = bigRefund * BigInt(s.gross)
    return { i, cents: Number(exact / bigTotal), rem: exact % bigTotal }
  })
  let left = refund - shares.reduce((n, s) => n + s.cents, 0)
  const byRemainder = [...shares].sort((a, b) => {
    if (a.rem !== b.rem) return a.rem > b.rem ? -1 : 1
    return clean[b.i].gross - clean[a.i].gross || a.i - b.i
  })
  for (const s of byRemainder) {
    if (left <= 0) break
    s.cents += 1
    left -= 1
  }

  return clean.map((s, i) => {
    const cents = shares[i].cents
    const reversal = s.gross > 0 ? Number((BigInt(cents) * BigInt(s.transfer)) / BigInt(s.gross)) : 0
    return { key: s.key, refundCents: cents, reversalCents: reversal, platformCents: cents - reversal }
  })
}

// ── One reversal ────────────────────────────────────────────────────────────────────────────────

type ReversalOutcome = 'reversed' | 'settled' | 'failed' | 'skipped'

async function markReversalFailed(row: OrderTransfer, reason: string): Promise<void> {
  const { error } = await db()
    .from(TABLE)
    .update({ last_error: `reversal: ${reason}`.slice(0, 500), updated_at: new Date().toISOString() })
    .eq('id', row.id)
    .eq('status', 'created')
  log.warn('commerce.transfer.reversal_failed', {
    orderId: row.orderId,
    rowId: row.id,
    transferId: row.stripeTransferId,
    attempt: row.reversalAttempts + 1,
    owedCents: row.reversalOwedCents,
    reason,
    ...(error ? { recordError: error.message } : {}),
  })
}

/** Record what Stripe says is reversed now. Never lowers reversed_cents (the transfer.reversed
 *  webhook writes the same column from the same cumulative number). */
async function markReversed(row: OrderTransfer, reversedCents: number): Promise<void> {
  const cents = Math.min(reversedCents, row.amountCents)
  const { error } = await db()
    .from(TABLE)
    .update({
      reversed_cents: cents,
      status: cents >= row.amountCents ? 'reversed' : 'created',
      last_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', row.id)
    .eq('status', 'created')
    .lte('reversed_cents', cents)
  if (error) {
    // The money is back and this row does not say so yet. The transfer.reversed webhook writes the
    // same number, and the next attempt reads it from Stripe before reversing anything.
    log.error('commerce.transfer.reversal_record_failed', { orderId: row.orderId, rowId: row.id, cents, error: error.message })
  }
}

/** Reverse what one created row still owes. One row at a time, so a failure stops nothing else. */
async function reverseTransferRow(row: OrderTransfer): Promise<ReversalOutcome> {
  if (row.status !== 'created' || !row.stripeTransferId || row.reversalOwedCents <= 0) return 'skipped'

  // THE CLAIM: a compare-and-set on the attempts this worker read. A second worker matches nothing.
  const { data: claimed, error: claimErr } = await db()
    .from(TABLE)
    .update({ reversal_attempts: row.reversalAttempts + 1, updated_at: new Date().toISOString() })
    .eq('id', row.id)
    .eq('reversal_attempts', row.reversalAttempts)
    .eq('status', 'created')
    .select('id')
  if (claimErr || !(claimed ?? []).length) return 'skipped'

  if (!stripe) {
    await markReversalFailed(row, 'payments are not configured')
    return 'failed'
  }

  const to = Math.min(row.refundReversalCents, row.amountCents)
  // How much is already back, by Stripe's count: a reversal whose write here was lost, or one made
  // in the dashboard, is counted, so the call below can only ever move the rest.
  let from: number
  try {
    const transfer = (await stripe.transfers.retrieve(row.stripeTransferId)) as Stripe.Transfer
    from = int(transfer?.amount_reversed) ?? 0
  } catch (err) {
    await markReversalFailed(row, `could not read the transfer: ${briefError(err)}`)
    return 'failed'
  }
  if (from >= to) {
    await markReversed(row, from)
    return 'settled'
  }

  try {
    const reversal = (await stripe.transfers.createReversal(
      row.stripeTransferId,
      {
        amount: to - from,
        metadata: { kind: 'commerce_order_transfer_reversal', order_id: row.orderId, commerce_order_transfer_id: row.id },
      },
      { idempotencyKey: reversalIdempotencyKey(row.id, from, to) },
    )) as Stripe.TransferReversal
    await markReversed(row, from + (int(reversal?.amount) ?? to - from))
    log.info('commerce.transfer.reversal_created', { orderId: row.orderId, rowId: row.id, reversalId: reversal?.id, from, to })
    return 'reversed'
  } catch (err) {
    await markReversalFailed(row, briefError(err))
    return 'failed'
  }
}

// ── A refund of a split order ───────────────────────────────────────────────────────────────────

export interface SplitReversalSummary {
  /** Rows whose target this refund raised. */
  targeted: number
  /** Rows never paid, cancelled because the order was refunded in full first. */
  cancelled: number
  /** Reversals made at Stripe. */
  reversed: number
  /** Rows Stripe already had back as far as the target (a replay, a lost write, the dashboard). */
  settled: number
  /** Reversals that failed and are left owed for the reconciler. */
  failed: number
  skipped: number
  /** Sellers sent their sale notice because THIS refund wrote the order's plan (LIVE-739). */
  noticedSellers: number
}

export type SplitReversalRefusal = 'not_found' | 'destination' | 'bad_ledger'

const emptySummary = (): SplitReversalSummary => ({
  targeted: 0,
  cancelled: 0,
  reversed: 0,
  settled: 0,
  failed: 0,
  skipped: 0,
  noticedSellers: 0,
})

interface SplitOrder {
  id: string
  funds_flow: string | null
  status: string
  amount_cents: number
}

/**
 * Take back each seller's pro rata part of what a split order has refunded so far.
 *
 * `refundedCents` is CUMULATIVE: everything the buyer has had back on this order (a charge's
 * amount_refunded, or that plus a lost dispute). So a partial refund and its later top-up each
 * raise the targets to the proportion of the new total, and a replay of either raises nothing.
 *
 *   - A destination order is refused and nothing is touched: its one transfer is unwound on the
 *     refund itself (reverse_transfer), exactly as before.
 *   - A full refund cancels every row not yet paid (nobody is owed anything), and every paid row is
 *     owed back whole.
 *   - A partial refund of an order that is still paid first writes a plan the settle never got to
 *     (idempotent), so a seller paid later is paid their share and then has this part reversed. Each
 *     seller that plan inserted is told of the sale, once (LIVE-739): nobody else can, now.
 *   - Every target is written before any money moves; then each created row owing anything is
 *     reversed now. What fails stays owed for reconcileSplitReversals.
 *
 * Throws on a database error (the webhook then redelivers; the refund action logs and carries on,
 * because the buyer's refund has already been made). Stripe failures never throw: they are rows.
 */
export async function reverseSplitTransfers(
  orderId: string,
  refundedCents: number,
): Promise<SplitReversalSummary | { refused: SplitReversalRefusal }> {
  const { data, error } = await db()
    .from('commerce_orders')
    .select('id, funds_flow, status, amount_cents')
    .eq('id', orderId)
    .maybeSingle()
  if (error) throw new Error(`order ${orderId} unreadable: ${error.message}`)
  const order = data as SplitOrder | null
  if (!order) return { refused: 'not_found' }
  if (order.funds_flow !== 'separate') return { refused: 'destination' }

  const out = emptySummary()
  const refunded = Math.max(0, Math.min(order.amount_cents, Math.round(refundedCents)))
  if (refunded <= 0) return out
  const full = refunded >= order.amount_cents

  if (!full && (order.status === 'paid' || order.status === 'fulfilled')) {
    const plan = await planTransfersForOrder(orderId)
    // TELL THE SELLERS (LIVE-739, ADR-1702). Rows back means THIS call wrote the order's first plan:
    // the settle found none and told nobody, and the reconciler skips an order that has rows, so this
    // is the last call that can. The same notice the settle and the reconciler send, for exactly the
    // rows inserted here, so a replayed refund, its own webhook or a racing reconciler (none of which
    // insert anything) tells nobody twice. Sent now, before any target is written, so a database
    // error below (which makes the webhook redeliver, and a redelivery plans nothing) cannot lose it.
    // It never throws, and the refund and the payouts go on whatever happened to the mail. A seller
    // is told of the sale as the settle would have told them, before any refund: the refund is not
    // a reason to hide a sale their payout still carries (ADR-1702).
    if ('rowIds' in plan && plan.rowIds.length) {
      out.noticedSellers = await noticeRecoveredSellers(orderId, plan.rowIds, { via: 'split_refund' })
    }
  }

  const rows = await listOrderTransfers(orderId)
  // Every seller share, including one whose fee took its whole gross (no row; the platform kept it
  // and so bears its part of the refund): the rows' gross, and the rest of the order as one share.
  const splits: RefundSplit[] = rows.map((r) => ({
    key: r.id,
    grossCents: r.amountCents + r.platformFeeCents,
    transferCents: r.amountCents,
  }))
  const rest = order.amount_cents - splits.reduce((n, s) => n + s.grossCents, 0)
  if (rest < 0) {
    // The ledger says the sellers were owed more than the order. Reverse nothing on that arithmetic.
    log.error('commerce.split_refund.bad_ledger', { orderId, amountCents: order.amount_cents, rows: rows.length })
    return { refused: 'bad_ledger' }
  }
  if (rest > 0) splits.push({ key: '', grossCents: rest, transferCents: 0 })
  const parts = new Map(proportionRefund(refunded, splits).map((p) => [p.key, p]))

  if (full) out.cancelled = await cancelOpenTransfers(orderId)

  const now = new Date().toISOString()
  for (const row of rows) {
    if (row.status === 'reversed' || row.status === 'cancelled') continue
    const target = full ? row.amountCents : Math.min(row.amountCents, parts.get(row.id)?.reversalCents ?? 0)
    if (target <= row.refundReversalCents) continue
    // Only ever raised: a lower target from an older or replayed refund matches nothing.
    const { data: raised, error: raiseErr } = await db()
      .from(TABLE)
      .update({ refund_reversal_cents: target, reversal_attempts: 0, updated_at: now })
      .eq('id', row.id)
      .in('status', ['planned', 'failed', 'created'])
      .lt('refund_reversal_cents', target)
      .select('id')
    if (raiseErr) throw new Error(`reversal target for ${row.id} not written: ${raiseErr.message}`)
    if ((raised ?? []).length) out.targeted += 1
  }

  for (const row of await listOrderTransfers(orderId)) {
    if (row.status !== 'created' || row.reversalOwedCents <= 0) continue
    out[await reverseTransferRow(row)] += 1
  }
  log.info('commerce.split_refund', { orderId, refundedCents: refunded, full, ...out })
  return out
}

/** The webhook's door: the split order behind a charge's PaymentIntent, if there is one, reversed to
 *  what has been refunded on it. A charge that is not a split order's does nothing. Throws on a
 *  database error so the webhook releases its claim and Stripe redelivers. */
export async function reverseSplitRefundForPaymentIntent(
  paymentIntentId: string | null,
  refundedCents: number,
): Promise<SplitReversalSummary | { refused: SplitReversalRefusal } | null> {
  if (!paymentIntentId) return null
  const { data, error } = await db()
    .from('commerce_orders')
    .select('id')
    .eq('stripe_payment_intent_id', paymentIntentId)
    .eq('funds_flow', 'separate')
    .maybeSingle()
  if (error) throw new Error(`split order for ${paymentIntentId} unreadable: ${error.message}`)
  const order = data as { id: string } | null
  if (!order) return null
  return reverseSplitTransfers(order.id, refundedCents)
}

// ── Reconcile (the cron) ────────────────────────────────────────────────────────────────────────

export interface ReversalReconcileSummary {
  /** Orders whose owed reversals were worked. */
  orders: number
  reversed: number
  settled: number
  failed: number
  skipped: number
  /** Rows over the attempt ceiling, logged one line each. */
  stuck: number
  /** Orders with owed rows left for the next run when the clock ran out. */
  remainingOrders: number
}

/**
 * Go back for every reversal that is owed and did not land: created rows whose target is above
 * what is reversed, under the attempt ceiling and untouched for ten minutes (so a refund reversing
 * right now is left alone), grouped by order, oldest first. Rows over the ceiling are logged as
 * stuck, one line each, every run, until a person acts on them. Never silently.
 */
export async function reconcileSplitReversals(opts: {
  limit: number
  exhausted?: () => boolean
  now?: number
}): Promise<ReversalReconcileSummary> {
  const now = opts.now ?? Date.now()
  const exhausted = opts.exhausted ?? (() => false)
  const out: ReversalReconcileSummary = { orders: 0, reversed: 0, settled: 0, failed: 0, skipped: 0, stuck: 0, remainingOrders: 0 }
  const staleBefore = new Date(now - RECONCILE_STALE_MS).toISOString()

  const { data: due, error: dueErr } = await db()
    .from(TABLE)
    .select('order_id')
    .eq('status', 'created')
    .gt('reversal_owed_cents', 0)
    .lt('reversal_attempts', MAX_TRANSFER_ATTEMPTS)
    .lt('updated_at', staleBefore)
    .order('updated_at', { ascending: true })
    .limit(opts.limit)
  if (dueErr) throw new Error(`owed reversals unreadable: ${dueErr.message}`)
  const orderIds = [...new Set(((due ?? []) as { order_id: string }[]).map((r) => r.order_id))]
  for (const [i, orderId] of orderIds.entries()) {
    if (exhausted()) {
      out.remainingOrders = orderIds.length - i
      break
    }
    out.orders += 1
    for (const row of await listOrderTransfers(orderId)) {
      if (row.status !== 'created' || row.reversalOwedCents <= 0 || row.reversalAttempts >= MAX_TRANSFER_ATTEMPTS) continue
      out[await reverseTransferRow(row)] += 1
    }
  }

  const { data: stuck, error: stuckErr } = await db()
    .from(TABLE)
    .select('id, order_id, stripe_account_id, stripe_transfer_id, reversal_owed_cents, currency, reversal_attempts, last_error')
    .eq('status', 'created')
    .gt('reversal_owed_cents', 0)
    .gte('reversal_attempts', MAX_TRANSFER_ATTEMPTS)
    .order('updated_at', { ascending: true })
    .limit(opts.limit)
  if (stuckErr) throw new Error(`stuck reversals unreadable: ${stuckErr.message}`)
  for (const r of (stuck ?? []) as {
    id: string
    order_id: string
    stripe_account_id: string
    stripe_transfer_id: string | null
    reversal_owed_cents: number
    currency: string
    reversal_attempts: number
    last_error: string | null
  }[]) {
    out.stuck += 1
    log.error('commerce.transfer.reversal_stuck', {
      orderId: r.order_id,
      rowId: r.id,
      account: r.stripe_account_id,
      transferId: r.stripe_transfer_id,
      owedCents: r.reversal_owed_cents,
      currency: r.currency,
      attempts: r.reversal_attempts,
      lastError: r.last_error,
    })
  }
  return out
}
