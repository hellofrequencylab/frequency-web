// THE TRANSFER LEDGER (LIVE-622, ADR-1636; PROG-D8 piece 2).
//
// A destination charge is atomic: the money splits as it lands. A separate order (LIVE-621) is
// not. The charge sits on the platform, and paying each seller is N Stripe transfers that each
// fail on their own. This module is the one place those transfers are planned, created, retried
// and marked reversed. The checkout builder never talks to Stripe's Transfers API; the settle
// calls `ensureTransfersForOrder` after the paid flip, the reconciler goes back for the ones
// that did not land, and the webhook records a reversal made outside the product.
//
// WHAT IT DECIDES
//   plan     one planned row per entry in `commerce_orders.metadata.split`, net = gross minus
//            that seller's fee. A destination order writes nothing. Idempotent on (order, account).
//   execute  `stripe.transfers.create` under `idempotencyKey: "transfer:" + row.id`, grouped on
//            the order id, sourced from the charge. One row at a time, so a failure stops nothing
//            else. Created rows get a Labs `payout` ledger line keyed on the transfer id.
//   reverse  a `transfer.reversed` event stamps `reversed_cents` and status reversed on the
//            matching row. A created row is never re-created.
//
// WHAT IT DOES NOT DECIDE: the refund proportion (LIVE-623) or who can see a share (LIVE-624).
// Server-only. The table is service-role only (RLS on, no member policy).

import type Stripe from 'stripe'
import type { SupabaseClient } from '@supabase/supabase-js'
import { stripe } from '@/lib/billing/stripe'
import { createAdminClient } from '@/lib/supabase/admin'
import { recordFinancialTransaction, ENTITY_ID } from '@/lib/finance/record'
import { log, briefError } from '@/lib/log'

/** Attempts the reconciler will make before a row is stuck and logged, never silently. Eight is
 *  four hours at the 30-minute cadence, long enough for a restricted account to recover and short
 *  enough that a permanently dead destination is a log line the same day. */
export const MAX_TRANSFER_ATTEMPTS = 8

export type TransferStatus = 'planned' | 'created' | 'failed' | 'reversed'

/** One seller's share as `createCommerceCheckout` wrote it onto a split order. */
export interface SplitShare {
  owner_kind: 'profile' | 'space'
  owner_profile_id: string | null
  owner_space_id: string | null
  stripe_account_id: string
  gross_cents: number
  platform_fee_cents: number
}

export interface TransferRow {
  id: string
  order_id: string
  owner_kind: 'profile' | 'space'
  owner_profile_id: string | null
  owner_space_id: string | null
  stripe_account_id: string
  amount_cents: number
  platform_fee_cents: number
  currency: string
  status: TransferStatus
  stripe_transfer_id: string | null
  reversed_cents: number
  attempts: number
  last_error: string | null
}

function db(): SupabaseClient {
  return createAdminClient()
}

/** The cents the seller is owed: their gross minus the platform fee priced at checkout. */
export function netCentsForShare(share: Pick<SplitShare, 'gross_cents' | 'platform_fee_cents'>): number {
  return Math.max(0, Math.floor(share.gross_cents) - Math.max(0, Math.floor(share.platform_fee_cents)))
}

/** True when the planned nets plus the platform fee equal the order amount, which is the
 *  invariant a paid split order has to keep: every cent of the charge is either a seller's
 *  transfer or the platform's fee. */
export function plannedSumMatchesOrder(
  shares: readonly Pick<SplitShare, 'gross_cents' | 'platform_fee_cents'>[],
  order: { amount_cents: number; platform_fee_cents: number },
): boolean {
  const nets = shares.reduce((sum, s) => sum + netCentsForShare(s), 0)
  const fees = shares.reduce((sum, s) => sum + Math.max(0, Math.floor(s.platform_fee_cents)), 0)
  return nets + fees === order.amount_cents && fees === order.platform_fee_cents
}

/** Read the per-seller shares a split order recorded at checkout. Null when the shape is missing
 *  or any entry cannot become a transfer (no account, a non-positive net). */
export function sharesFromSplitMetadata(metadata: unknown): SplitShare[] | null {
  if (!metadata || typeof metadata !== 'object') return null
  const split = (metadata as { split?: unknown }).split
  if (!Array.isArray(split) || split.length === 0) return null
  const shares: SplitShare[] = []
  for (const raw of split) {
    if (!raw || typeof raw !== 'object') return null
    const row = raw as Record<string, unknown>
    const ownerKind = row.owner_kind === 'profile' || row.owner_kind === 'space' ? row.owner_kind : null
    const account = typeof row.stripe_account_id === 'string' ? row.stripe_account_id.trim() : ''
    const gross = Number(row.gross_cents)
    const fee = Number(row.platform_fee_cents)
    if (!ownerKind || !account || !Number.isFinite(gross) || !Number.isFinite(fee)) return null
    const share: SplitShare = {
      owner_kind: ownerKind,
      owner_profile_id: typeof row.owner_profile_id === 'string' ? row.owner_profile_id : null,
      owner_space_id: typeof row.owner_space_id === 'string' ? row.owner_space_id : null,
      stripe_account_id: account,
      gross_cents: Math.floor(gross),
      platform_fee_cents: Math.floor(fee),
    }
    if (netCentsForShare(share) <= 0) return null
    shares.push(share)
  }
  return shares
}

type PlanResult = 'skipped' | 'planned' | 'already'

/**
 * Write one planned row per seller of a paid separate order. A destination order, an order that
 * already has rows, or an order whose split metadata cannot be a transfer, writes nothing.
 * Idempotent: a second call after a successful plan is `already`.
 */
export async function planTransfersForOrder(orderId: string): Promise<PlanResult> {
  const { data: order } = await db()
    .from('commerce_orders')
    .select('id, funds_flow, amount_cents, platform_fee_cents, currency, metadata, status')
    .eq('id', orderId)
    .maybeSingle()
  const row = order as {
    id: string
    funds_flow: string
    amount_cents: number
    platform_fee_cents: number
    currency: string
    metadata: unknown
    status: string
  } | null
  if (!row || row.funds_flow !== 'separate' || row.status !== 'paid') return 'skipped'

  const { data: existing } = await db()
    .from('commerce_order_transfers')
    .select('id')
    .eq('order_id', orderId)
    .limit(1)
  if ((existing ?? []).length > 0) return 'already'

  const shares = sharesFromSplitMetadata(row.metadata)
  if (!shares) {
    log.error('commerce.transfers.plan_missing_split', { order_id: orderId })
    return 'skipped'
  }
  if (!plannedSumMatchesOrder(shares, row)) {
    log.error('commerce.transfers.plan_sum_mismatch', {
      order_id: orderId,
      amount_cents: row.amount_cents,
      platform_fee_cents: row.platform_fee_cents,
    })
    return 'skipped'
  }

  const { error } = await db().from('commerce_order_transfers').insert(
    shares.map((s) => ({
      order_id: orderId,
      owner_kind: s.owner_kind,
      owner_profile_id: s.owner_profile_id,
      owner_space_id: s.owner_space_id,
      stripe_account_id: s.stripe_account_id,
      amount_cents: netCentsForShare(s),
      platform_fee_cents: s.platform_fee_cents,
      currency: row.currency || 'usd',
      status: 'planned',
    })),
  )
  if (error) {
    if (error.code === '23505') return 'already'
    log.error('commerce.transfers.plan_insert_failed', { order_id: orderId, error: briefError(error) })
    return 'skipped'
  }
  return 'planned'
}

async function chargeIdForIntent(paymentIntentId: string): Promise<string | null> {
  if (!stripe) return null
  try {
    const pi = await stripe.paymentIntents.retrieve(paymentIntentId)
    const latest = pi.latest_charge
    if (typeof latest === 'string' && latest.length > 0) return latest
    if (latest && typeof latest === 'object' && 'id' in latest && typeof latest.id === 'string') {
      return latest.id
    }
  } catch (err) {
    log.error('commerce.transfers.charge_lookup_failed', {
      payment_intent_id: paymentIntentId,
      error: briefError(err),
    })
  }
  return null
}

export interface ExecuteResult {
  created: number
  failed: number
  skipped: number
}

/**
 * Create every planned or failed transfer for one order that is still under the attempts
 * ceiling. One row at a time: a Stripe error on seller A does not skip seller B. A created
 * row is never sent again. The idempotency key is the row id, so a retry of the same row
 * cannot pay the seller twice.
 */
export async function executePlannedTransfers(orderId: string): Promise<ExecuteResult> {
  const result: ExecuteResult = { created: 0, failed: 0, skipped: 0 }
  if (!stripe) return result

  const { data: order } = await db()
    .from('commerce_orders')
    .select('id, funds_flow, stripe_payment_intent_id, entity_id, currency')
    .eq('id', orderId)
    .maybeSingle()
  const parent = order as {
    id: string
    funds_flow: string
    stripe_payment_intent_id: string | null
    entity_id: string
    currency: string
  } | null
  if (!parent || parent.funds_flow !== 'separate' || !parent.stripe_payment_intent_id) return result

  const { data: due } = await db()
    .from('commerce_order_transfers')
    .select(
      'id, order_id, owner_kind, owner_profile_id, owner_space_id, stripe_account_id, amount_cents, platform_fee_cents, currency, status, stripe_transfer_id, reversed_cents, attempts, last_error',
    )
    .eq('order_id', orderId)
    .in('status', ['planned', 'failed'])
    .lt('attempts', MAX_TRANSFER_ATTEMPTS)
    .order('created_at', { ascending: true })
  const rows = (due ?? []) as TransferRow[]
  if (rows.length === 0) return result

  const chargeId = await chargeIdForIntent(parent.stripe_payment_intent_id)
  if (!chargeId) {
    for (const row of rows) {
      await markFailed(row, 'charge_not_available')
      result.failed += 1
    }
    return result
  }

  for (const row of rows) {
    if (row.stripe_transfer_id) {
      result.skipped += 1
      continue
    }
    const created = await createOneTransfer(row, {
      paymentIntentId: parent.stripe_payment_intent_id,
      chargeId,
      entityId: parent.entity_id,
    })
    if (created) result.created += 1
    else result.failed += 1
  }
  return result
}

async function createOneTransfer(
  row: TransferRow,
  ctx: { paymentIntentId: string; chargeId: string; entityId: string },
): Promise<boolean> {
  if (!stripe) return false
  try {
    const transfer = await stripe.transfers.create(
      {
        amount: row.amount_cents,
        currency: row.currency || 'usd',
        destination: row.stripe_account_id,
        transfer_group: row.order_id,
        source_transaction: ctx.chargeId,
        metadata: { order_id: row.order_id, transfer_row_id: row.id },
      },
      { idempotencyKey: `transfer:${row.id}` },
    )
    const { error } = await db()
      .from('commerce_order_transfers')
      .update({
        status: 'created',
        stripe_transfer_id: transfer.id,
        last_error: null,
        attempts: row.attempts + 1,
        updated_at: new Date().toISOString(),
      })
      .eq('id', row.id)
      .in('status', ['planned', 'failed'])
    if (error) {
      log.error('commerce.transfers.mark_created_failed', { transfer_id: row.id, error: briefError(error) })
    }
    await recordFinancialTransaction({
      entityId: ctx.entityId || ENTITY_ID.labs,
      revenueType: 'payout',
      amountCents: -row.amount_cents,
      currency: row.currency || 'usd',
      stripeAccountId: row.stripe_account_id,
      stripePaymentIntentId: ctx.paymentIntentId,
      sourceTable: 'commerce_order_transfers',
      sourceId: row.id,
      idempotencyKey: `commerce_transfer:${transfer.id}`,
    }).catch((err) => {
      log.error('commerce.transfers.ledger_failed', { transfer_id: row.id, error: briefError(err) })
    })
    return true
  } catch (err) {
    await markFailed(row, briefError(err))
    return false
  }
}

async function markFailed(row: TransferRow, lastError: string): Promise<void> {
  const { error } = await db()
    .from('commerce_order_transfers')
    .update({
      status: 'failed',
      last_error: lastError.slice(0, 500),
      attempts: row.attempts + 1,
      updated_at: new Date().toISOString(),
    })
    .eq('id', row.id)
    .in('status', ['planned', 'failed'])
  if (error) {
    log.error('commerce.transfers.mark_failed_failed', { transfer_id: row.id, error: briefError(error) })
  }
}

/**
 * Plan then execute for one order. A destination order is a no-op. Called from settle after the
 * paid flip and from the reconciler for a paid separate order that still has work.
 */
export async function ensureTransfersForOrder(orderId: string): Promise<ExecuteResult> {
  const planned = await planTransfersForOrder(orderId)
  if (planned === 'skipped') return { created: 0, failed: 0, skipped: 0 }
  return executePlannedTransfers(orderId)
}

export interface ReconcileResult {
  processed: number
  created: number
  failed: number
  stuck: number
}

/**
 * Retry planned and failed rows under the attempts ceiling, and log each row over it as stuck,
 * one line each, never silently. Also plans any paid separate order that somehow has no rows
 * (a settle that flipped paid and then threw before the insert). Due rows come first so a
 * transfer that failed yesterday is retried even when older fully-paid split orders fill the
 * limit; the backfill looks at recent paid separate orders, newest first.
 */
export async function reconcileTransfers(opts: {
  limit: number
  exhausted?: () => boolean
}): Promise<ReconcileResult> {
  const result: ReconcileResult = { processed: 0, created: 0, failed: 0, stuck: 0 }
  const seen = new Set<string>()

  const { data: due } = await db()
    .from('commerce_order_transfers')
    .select('order_id')
    .in('status', ['planned', 'failed'])
    .lt('attempts', MAX_TRANSFER_ATTEMPTS)
    .order('updated_at', { ascending: true })
    .limit(opts.limit)
  for (const row of (due ?? []) as { order_id: string }[]) {
    if (opts.exhausted?.()) break
    if (seen.has(row.order_id)) continue
    seen.add(row.order_id)
    const run = await executePlannedTransfers(row.order_id)
    result.processed += 1
    result.created += run.created
    result.failed += run.failed
  }

  if (!opts.exhausted?.()) {
    const { data: paid } = await db()
      .from('commerce_orders')
      .select('id')
      .eq('status', 'paid')
      .eq('funds_flow', 'separate')
      .order('paid_at', { ascending: false })
      .limit(opts.limit)
    for (const order of (paid ?? []) as { id: string }[]) {
      if (opts.exhausted?.()) break
      if (seen.has(order.id)) continue
      const { data: existing } = await db()
        .from('commerce_order_transfers')
        .select('id')
        .eq('order_id', order.id)
        .limit(1)
      if ((existing ?? []).length > 0) continue
      const run = await ensureTransfersForOrder(order.id)
      result.processed += 1
      result.created += run.created
      result.failed += run.failed
    }
  }

  const { data: stuckRows } = await db()
    .from('commerce_order_transfers')
    .select('id, order_id, stripe_account_id, attempts, last_error, status')
    .in('status', ['planned', 'failed'])
    .gte('attempts', MAX_TRANSFER_ATTEMPTS)
    .order('updated_at', { ascending: true })
    .limit(opts.limit)
  for (const row of (stuckRows ?? []) as {
    id: string
    order_id: string
    stripe_account_id: string
    attempts: number
    last_error: string | null
    status: string
  }[]) {
    result.stuck += 1
    log.error('commerce.transfers.stuck', {
      transfer_id: row.id,
      order_id: row.order_id,
      stripe_account_id: row.stripe_account_id,
      attempts: row.attempts,
      last_error: row.last_error,
      status: row.status,
    })
  }

  return result
}

/**
 * A reversal made outside the product (Stripe dashboard, or LIVE-623) is otherwise acked and
 * forgotten. Stamp the matching row so the ledger agrees with the money the seller no longer holds.
 * Idempotent on the transfer id: a redelivered event flips nothing twice.
 */
export async function recordTransferReversed(transfer: Pick<Stripe.Transfer, 'id' | 'amount_reversed' | 'reversed'>): Promise<void> {
  if (!transfer.id) return
  const reversedCents =
    typeof transfer.amount_reversed === 'number' && transfer.amount_reversed > 0
      ? transfer.amount_reversed
      : null
  const { data: existing } = await db()
    .from('commerce_order_transfers')
    .select('id, amount_cents, reversed_cents, status')
    .eq('stripe_transfer_id', transfer.id)
    .maybeSingle()
  const row = existing as {
    id: string
    amount_cents: number
    reversed_cents: number
    status: TransferStatus
  } | null
  if (!row) return
  if (row.status === 'reversed' && row.reversed_cents >= row.amount_cents) return
  const amount = reversedCents ?? row.amount_cents
  await db()
    .from('commerce_order_transfers')
    .update({
      status: 'reversed',
      reversed_cents: amount,
      updated_at: new Date().toISOString(),
    })
    .eq('id', row.id)
}
