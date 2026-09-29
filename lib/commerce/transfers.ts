// THE TRANSFER LEDGER (LIVE-622, ADR-1614; PROG-D8 piece 2). MONEY CODE. Server-only.
//
// A split order (funds_flow 'separate', ADR-1576) is ONE charge on the platform account carrying
// `transfer_group` = the order id. The charge pays nobody. Each seller is paid by a Stripe transfer
// that follows it, and those transfers are separate API calls that can each fail on their own. So
// every transfer a seller is owed is a row in `commerce_order_transfers` with its own state, written
// BEFORE the money moves:
//
//   planned ──create──▶ created ──transfer.reversed (in full)──▶ reversed
//      │                   ▲
//      └──refused──▶ failed ┘  (retried by the reconciler, same idempotency key)
//
// THE SURFACE, for the settle, the webhook, the cron and the two rows that build on this one:
//   settleSplitOrderTransfers(orderId)  the settle's one call: plan, then pay. Never throws.
//   planTransferShares(order)           PURE. The rows an order owes, or why it owes none.
//   planTransfersForOrder(orderId)      write one planned row per seller (idempotent by key).
//   executePlannedTransfers(orderId)    pay the planned and failed rows of one order.
//   reconcileTransfers({ limit, ... })  the cron: plan what was missed, retry what did not land,
//                                       log what is stuck, one line each.
//   recordTransferCreated(transfer)     webhook `transfer.created`: adopt a transfer that landed
//                                       at Stripe but was never written here.
//   recordTransferReversed(transfer)    webhook `transfer.reversed`: the reversed cents, and the
//                                       status once the whole transfer is back.
//   listOrderTransfers(orderId)         every row of one order, for a refund (LIVE-623) that
//                                       reverses them and a seller view (LIVE-624) that shows one.
//
// NEVER TWICE. Four things stand between a retry and a second payment to the same seller:
//   1. one row per seller per order: unique (order_id, seller_key), and the plan upserts with
//      ignoreDuplicates, so a second settle, a redelivered webhook or a cron run writes nothing new;
//   2. a claim before the call: `attempts` is bumped with a compare-and-set on its old value and on
//      a not-yet-landed status, so two workers cannot both be calling Stripe for one row, and a
//      created row is never selected again;
//   3. the Stripe idempotency key `transfer:<row id>`, the same on every attempt, so a retry inside
//      Stripe's 24 hour key window returns the transfer the first attempt made;
//   4. before a RETRY (attempts > 0) calls create at all, it looks for a transfer already in the
//      order's transfer_group carrying this row's id in its metadata, and adopts it. That covers a
//      retry after the key window, and a first attempt that landed at Stripe but whose write here
//      was lost. If that lookup cannot be made, the attempt fails rather than risk a second transfer.
//
// NEVER A SELLER PAID FOR A REFUNDED ORDER. A transfer is created only while its order is paid or
// fulfilled and carries no refund. A refund arriving between a failure and its retry holds the row
// (logged); the pro rata reversal of transfers that DID land is LIVE-623's.
//
// NOT THE FINANCE LEDGER. A split order's financial_transactions row is its platform fee (the
// revenue, exactly as a destination order records its application fee); the sellers' gross never
// was platform revenue. A `payout` row per transfer on top of a fee-only revenue row would drive the
// Labs total negative by every seller's share, so this table, not financial_transactions, is the
// record of money leaving (ADR-1614 §4, amending ADR-1565 §5).

import type Stripe from 'stripe'
import type { SupabaseClient } from '@supabase/supabase-js'
import { stripe } from '@/lib/billing/stripe'
import { createAdminClient } from '@/lib/supabase/admin'
import { log, briefError } from '@/lib/log'
import { sellerKey, type FundsFlowSeller } from './funds-flow'

function db(): SupabaseClient {
  return createAdminClient()
}

const TABLE = 'commerce_order_transfers'

export type TransferStatus = 'planned' | 'created' | 'failed' | 'reversed'

/** A row not yet paid: what the executor and the reconciler pick up. */
const OPEN: TransferStatus[] = ['planned', 'failed']

/** Attempts before a row stops being retried and is logged as stuck every reconciler run. At the
 *  reconciler's half-hour cadence this is about four hours of a seller's account refusing money. An
 *  operator retry (LIVE-624) is the way back from here. */
export const MAX_TRANSFER_ATTEMPTS = 8

/** How long a row must sit untouched before the reconciler takes it, so it never races the settle
 *  that is paying it right now. */
export const RECONCILE_STALE_MS = 10 * 60_000

/** How far back the reconciler looks for a paid split order that was never planned. */
export const RECONCILE_PLAN_WINDOW_MS = 3 * 24 * 60 * 60_000

/** The one Stripe idempotency key for a row, identical on every attempt. */
export function transferIdempotencyKey(rowId: string): string {
  return `transfer:${rowId}`
}

/** One transfer row as the rest of the product reads it. */
export interface OrderTransfer {
  id: string
  orderId: string
  ownerKind: 'profile' | 'space'
  ownerProfileId: string | null
  ownerSpaceId: string | null
  stripeAccountId: string
  amountCents: number
  platformFeeCents: number
  currency: string
  status: TransferStatus
  stripeTransferId: string | null
  reversedCents: number
  attempts: number
  lastError: string | null
}

interface TransferRow {
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

const ROW_COLS =
  'id, order_id, owner_kind, owner_profile_id, owner_space_id, stripe_account_id, amount_cents, platform_fee_cents, currency, status, stripe_transfer_id, reversed_cents, attempts, last_error'

function toTransfer(r: TransferRow): OrderTransfer {
  return {
    id: r.id,
    orderId: r.order_id,
    ownerKind: r.owner_kind,
    ownerProfileId: r.owner_profile_id,
    ownerSpaceId: r.owner_space_id,
    stripeAccountId: r.stripe_account_id,
    amountCents: r.amount_cents,
    platformFeeCents: r.platform_fee_cents,
    currency: r.currency,
    status: r.status,
    stripeTransferId: r.stripe_transfer_id,
    reversedCents: r.reversed_cents,
    attempts: r.attempts,
    lastError: r.last_error,
  }
}

// ── The plan (pure) ─────────────────────────────────────────────────────────────────────────────

/** The order fields a plan reads. `metadata.split` is what the checkout wrote (ADR-1576 §5): each
 *  seller's share as priced that day. */
export interface TransferPlanOrder {
  id: string
  funds_flow: string | null
  amount_cents: number
  platform_fee_cents: number
  currency: string
  metadata: unknown
}

/** One row the plan writes. */
export interface TransferShare {
  sellerKey: string
  ownerKind: 'profile' | 'space'
  ownerProfileId: string | null
  ownerSpaceId: string | null
  stripeAccountId: string
  amountCents: number
  platformFeeCents: number
}

/** Why an order owes no transfer rows. `destination` is the normal answer for every order that is
 *  not a split; the other three are an order the ledger refuses to pay from, logged by the caller. */
export type TransferPlanRefusal = 'destination' | 'no_split' | 'bad_share' | 'sum_mismatch'

const int = (v: unknown): number | null => (typeof v === 'number' && Number.isInteger(v) ? v : null)
const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null)

/**
 * The transfers a split order owes, one per seller share. PURE.
 *
 * INVARIANT: the shares' gross sums to the order amount and their fees sum to the order's platform
 * fee, so the planned amounts plus the platform fee equal what the buyer paid. An order whose shares
 * do not add up is refused whole: a transfer is never made on arithmetic the charge does not back.
 * A share whose fee takes its whole gross owes nothing and gets no row (Stripe refuses a zero
 * transfer); its fee still counts toward the platform fee the order records.
 */
export function planTransferShares(
  order: TransferPlanOrder,
): { shares: TransferShare[] } | { refused: TransferPlanRefusal } {
  if (order.funds_flow !== 'separate') return { refused: 'destination' }
  const split = (order.metadata as { split?: unknown } | null)?.split
  if (!Array.isArray(split) || split.length === 0) return { refused: 'no_split' }

  const shares: TransferShare[] = []
  let gross = 0
  let fee = 0
  for (const raw of split as Record<string, unknown>[]) {
    const kind = raw?.owner_kind
    const g = int(raw?.gross_cents)
    const f = int(raw?.platform_fee_cents)
    const account = str(raw?.stripe_account_id)
    if ((kind !== 'profile' && kind !== 'space') || g == null || f == null || g <= 0 || f < 0 || f > g || !account) {
      return { refused: 'bad_share' }
    }
    const seller: FundsFlowSeller = {
      owner_kind: kind,
      owner_profile_id: str(raw.owner_profile_id),
      owner_space_id: str(raw.owner_space_id),
    }
    gross += g
    fee += f
    if (g - f > 0) {
      shares.push({
        sellerKey: sellerKey(seller),
        ownerKind: kind,
        ownerProfileId: seller.owner_profile_id,
        ownerSpaceId: seller.owner_space_id,
        stripeAccountId: account,
        amountCents: g - f,
        platformFeeCents: f,
      })
    }
  }
  if (gross !== order.amount_cents || fee !== order.platform_fee_cents) return { refused: 'sum_mismatch' }
  if (new Set(shares.map((s) => s.sellerKey)).size !== shares.length) return { refused: 'bad_share' }
  return { shares }
}

// ── The order a transfer draws on ───────────────────────────────────────────────────────────────

interface OrderForTransfer extends TransferPlanOrder {
  status: string
  stripe_payment_intent_id: string | null
  refunded_at: string | null
}

const ORDER_COLS =
  'id, funds_flow, status, amount_cents, platform_fee_cents, currency, metadata, stripe_payment_intent_id, refunded_at'

async function readOrder(orderId: string): Promise<OrderForTransfer | null> {
  const { data, error } = await db().from('commerce_orders').select(ORDER_COLS).eq('id', orderId).maybeSingle()
  if (error) throw new Error(`order ${orderId} unreadable: ${error.message}`)
  return (data as OrderForTransfer | null) ?? null
}

/** Paid or fulfilled, and never refunded: the only state in which a seller may be paid. */
function orderIsPayable(o: Pick<OrderForTransfer, 'status' | 'refunded_at'>): boolean {
  return (o.status === 'paid' || o.status === 'fulfilled') && !o.refunded_at
}

// ── Plan ────────────────────────────────────────────────────────────────────────────────────────

export type PlanOutcome = { planned: number } | { refused: TransferPlanRefusal | 'not_found' | 'not_payable' }

/** Write one planned row per seller share of a paid split order. Idempotent: a second call, from a
 *  redelivered webhook or the reconciler, inserts nothing. A destination order writes nothing.
 *  Throws on a database error, so a caller can decide whether that is fatal (it never is at settle). */
export async function planTransfersForOrder(orderId: string): Promise<PlanOutcome> {
  const order = await readOrder(orderId)
  if (!order) return { refused: 'not_found' }
  if (order.funds_flow !== 'separate') return { refused: 'destination' }
  if (!orderIsPayable(order)) return { refused: 'not_payable' }

  const plan = planTransferShares(order)
  if ('refused' in plan) {
    log.error('commerce.transfer.plan_refused', { orderId, reason: plan.refused })
    return plan
  }
  if (!plan.shares.length) return { planned: 0 }

  const { data, error } = await db()
    .from(TABLE)
    .upsert(
      plan.shares.map((s) => ({
        order_id: order.id,
        seller_key: s.sellerKey,
        owner_kind: s.ownerKind,
        owner_profile_id: s.ownerProfileId,
        owner_space_id: s.ownerSpaceId,
        stripe_account_id: s.stripeAccountId,
        amount_cents: s.amountCents,
        platform_fee_cents: s.platformFeeCents,
        currency: order.currency,
      })),
      { onConflict: 'order_id,seller_key', ignoreDuplicates: true },
    )
    .select('id')
  if (error) throw new Error(`transfer plan for ${orderId} not written: ${error.message}`)
  return { planned: (data ?? []).length }
}

// ── Execute ─────────────────────────────────────────────────────────────────────────────────────

export interface ExecuteSummary {
  created: number
  adopted: number
  failed: number
  /** Rows another worker had already claimed. */
  skipped: number
  /** Rows not paid because the order is no longer payable (refunded, cancelled). */
  held: number
}

const emptySummary = (): ExecuteSummary => ({ created: 0, adopted: 0, failed: 0, skipped: 0, held: 0 })

/** The charge behind an order's PaymentIntent, which a transfer names as `source_transaction` so it
 *  can land before the charge's funds are available. Null when it cannot be read. */
async function chargeFor(paymentIntentId: string | null): Promise<string | null> {
  if (!stripe || !paymentIntentId) return null
  try {
    const pi = await stripe.paymentIntents.retrieve(paymentIntentId)
    const charge = pi?.latest_charge
    return typeof charge === 'string' ? charge : (charge?.id ?? null)
  } catch (err) {
    log.warn('commerce.transfer.charge_unreadable', { paymentIntentId, error: briefError(err) })
    return null
  }
}

/** A transfer already made for this row, found by the row id Stripe carries in its metadata. Throws
 *  when Stripe cannot be asked, and the caller then refuses to create (a second transfer is worse
 *  than a late one). */
async function findLandedTransfer(orderId: string, rowId: string): Promise<{ id: string } | null> {
  if (!stripe) throw new Error('payments are not configured')
  const list = await stripe.transfers.list({ transfer_group: orderId, limit: 100 })
  const hit = ((list?.data ?? []) as Stripe.Transfer[]).find(
    (t) => t?.metadata?.commerce_order_transfer_id === rowId,
  )
  return hit ? { id: hit.id } : null
}

async function markCreated(row: TransferRow, transferId: string, chargeId: string | null): Promise<void> {
  const { error } = await db()
    .from(TABLE)
    .update({
      status: 'created',
      stripe_transfer_id: transferId,
      source_charge_id: chargeId,
      last_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', row.id)
    .in('status', OPEN)
  if (error) {
    // The money has moved and this row does not say so. Loud, and self-healing: the retry lookup
    // (attempts > 0) and the transfer.created webhook both adopt it by the row id in its metadata.
    log.error('commerce.transfer.record_failed', { orderId: row.order_id, rowId: row.id, transferId, error: error.message })
  }
}

async function markFailed(row: TransferRow, reason: string): Promise<void> {
  const { error } = await db()
    .from(TABLE)
    .update({ status: 'failed', last_error: reason.slice(0, 500), updated_at: new Date().toISOString() })
    .eq('id', row.id)
    .in('status', OPEN)
  log.warn('commerce.transfer.failed', {
    orderId: row.order_id,
    rowId: row.id,
    attempt: row.attempts + 1,
    reason,
    ...(error ? { recordError: error.message } : {}),
  })
}

type RowOutcome = 'created' | 'adopted' | 'failed' | 'skipped'

async function executeTransferRow(row: TransferRow, chargeId: string | null): Promise<RowOutcome> {
  // THE CLAIM. Compare-and-set on the attempts this worker read and on a not-yet-landed status: if
  // another worker got here first, or the row has landed since, this matches nothing and stops.
  const { data: claimed, error: claimErr } = await db()
    .from(TABLE)
    .update({ attempts: row.attempts + 1, updated_at: new Date().toISOString() })
    .eq('id', row.id)
    .eq('attempts', row.attempts)
    .in('status', OPEN)
    .select('id')
  if (claimErr || !(claimed ?? []).length) return 'skipped'

  if (!stripe) {
    await markFailed(row, 'payments are not configured')
    return 'failed'
  }
  if (!chargeId) {
    await markFailed(row, 'no charge to transfer from')
    return 'failed'
  }

  if (row.attempts > 0) {
    let landed: { id: string } | null
    try {
      landed = await findLandedTransfer(row.order_id, row.id)
    } catch (err) {
      await markFailed(row, `could not check for an earlier transfer: ${briefError(err)}`)
      return 'failed'
    }
    if (landed) {
      await markCreated(row, landed.id, chargeId)
      log.info('commerce.transfer.adopted', { orderId: row.order_id, rowId: row.id, transferId: landed.id })
      return 'adopted'
    }
  }

  try {
    const transfer = await stripe.transfers.create(
      {
        amount: row.amount_cents,
        currency: row.currency,
        destination: row.stripe_account_id,
        transfer_group: row.order_id,
        source_transaction: chargeId,
        metadata: { kind: 'commerce_order_transfer', order_id: row.order_id, commerce_order_transfer_id: row.id },
      },
      { idempotencyKey: transferIdempotencyKey(row.id) },
    )
    await markCreated(row, transfer.id, chargeId)
    log.info('commerce.transfer.created', { orderId: row.order_id, rowId: row.id, transferId: transfer.id })
    return 'created'
  } catch (err) {
    await markFailed(row, briefError(err))
    return 'failed'
  }
}

/**
 * Pay the planned and failed rows of one order, one row at a time, so a failure stops nothing
 * else. `staleBefore` (an ISO time) limits it to rows untouched since then, which is how the
 * reconciler keeps out of the way of a settle that is paying the same order now.
 */
export async function executePlannedTransfers(
  orderId: string,
  opts: { staleBefore?: string } = {},
): Promise<ExecuteSummary> {
  const out = emptySummary()
  let q = db()
    .from(TABLE)
    .select(ROW_COLS)
    .eq('order_id', orderId)
    .in('status', OPEN)
    .lt('attempts', MAX_TRANSFER_ATTEMPTS)
  if (opts.staleBefore) q = q.lt('updated_at', opts.staleBefore)
  const { data, error } = await q.order('created_at', { ascending: true })
  if (error) throw new Error(`transfers for ${orderId} unreadable: ${error.message}`)
  const rows = (data ?? []) as TransferRow[]
  if (!rows.length) return out

  const order = await readOrder(orderId)
  if (!order || !orderIsPayable(order)) {
    out.held = rows.length
    log.warn('commerce.transfer.held', { orderId, rows: rows.length, status: order?.status ?? 'missing' })
    return out
  }

  const chargeId = await chargeFor(order.stripe_payment_intent_id)
  for (const row of rows) {
    out[await executeTransferRow(row, chargeId)] += 1
  }
  return out
}

/**
 * The settle's one call for a split order: plan the rows, then pay them. NEVER THROWS: the buyer's
 * money has already moved, so a failure here must not 500 the webhook into a redelivery loop. Every
 * row that does not land is left planned or failed for the reconciler, and a plan that could not be
 * written is found again by the reconciler's missing-plan sweep.
 */
export async function settleSplitOrderTransfers(orderId: string): Promise<void> {
  try {
    const plan = await planTransfersForOrder(orderId)
    if ('refused' in plan) return
    const run = await executePlannedTransfers(orderId)
    log.info('commerce.transfer.settle', { orderId, planned: plan.planned, ...run })
  } catch (err) {
    log.error('commerce.transfer.settle_failed', { orderId, error: briefError(err) })
  }
}

// ── Reconcile (the cron) ────────────────────────────────────────────────────────────────────────

export interface ReconcileSummary extends ExecuteSummary {
  /** Split orders found paid with no plan, and planned now. */
  plannedOrders: number
  /** Orders whose due rows were worked. */
  orders: number
  /** Rows over the attempt ceiling, logged one line each. */
  stuck: number
  /** Orders with due rows left for the next run when the clock ran out. */
  remainingOrders: number
}

/**
 * Go back for every transfer that did not land. Three passes, each bounded by `limit`:
 *   1. a paid split order from the last three days with no row at all (the settle died between the
 *      paid flip and the plan) is planned;
 *   2. every planned or failed row under the attempt ceiling and untouched for ten minutes is
 *      retried, grouped by order, oldest first, until `exhausted()` says the clock is spent;
 *   3. every row over the ceiling is logged as stuck, one line each, every run, until a person
 *      acts on it. Never silently.
 */
export async function reconcileTransfers(opts: {
  limit: number
  exhausted?: () => boolean
  now?: number
}): Promise<ReconcileSummary> {
  const now = opts.now ?? Date.now()
  const exhausted = opts.exhausted ?? (() => false)
  const out: ReconcileSummary = { ...emptySummary(), plannedOrders: 0, orders: 0, stuck: 0, remainingOrders: 0 }
  const staleBefore = new Date(now - RECONCILE_STALE_MS).toISOString()

  // 1. Paid split orders with no plan.
  const { data: paid, error: paidErr } = await db()
    .from('commerce_orders')
    .select('id, commerce_order_transfers(id)')
    .eq('funds_flow', 'separate')
    .in('status', ['paid', 'fulfilled'])
    .is('refunded_at', null)
    .gte('paid_at', new Date(now - RECONCILE_PLAN_WINDOW_MS).toISOString())
    .lt('paid_at', staleBefore)
    .order('paid_at', { ascending: true })
    .limit(opts.limit)
  if (paidErr) throw new Error(`paid split orders unreadable: ${paidErr.message}`)
  for (const o of (paid ?? []) as { id: string; commerce_order_transfers: { id: string }[] | null }[]) {
    if (exhausted()) break
    if ((o.commerce_order_transfers ?? []).length) continue
    const plan = await planTransfersForOrder(o.id)
    if ('planned' in plan && plan.planned > 0) {
      out.plannedOrders += 1
      log.warn('commerce.transfer.plan_recovered', { orderId: o.id, planned: plan.planned })
    }
  }

  // 2. Due rows, grouped by order.
  const { data: due, error: dueErr } = await db()
    .from(TABLE)
    .select('order_id')
    .in('status', OPEN)
    .lt('attempts', MAX_TRANSFER_ATTEMPTS)
    .lt('updated_at', staleBefore)
    .order('updated_at', { ascending: true })
    .limit(opts.limit)
  if (dueErr) throw new Error(`due transfers unreadable: ${dueErr.message}`)
  const orderIds = [...new Set(((due ?? []) as { order_id: string }[]).map((r) => r.order_id))]
  for (const [i, orderId] of orderIds.entries()) {
    if (exhausted()) {
      out.remainingOrders = orderIds.length - i
      break
    }
    const run = await executePlannedTransfers(orderId, { staleBefore })
    out.orders += 1
    out.created += run.created
    out.adopted += run.adopted
    out.failed += run.failed
    out.skipped += run.skipped
    out.held += run.held
  }

  // 3. Stuck rows. One line each, every run.
  const { data: stuck, error: stuckErr } = await db()
    .from(TABLE)
    .select('id, order_id, stripe_account_id, amount_cents, currency, attempts, last_error')
    .in('status', OPEN)
    .gte('attempts', MAX_TRANSFER_ATTEMPTS)
    .order('updated_at', { ascending: true })
    .limit(opts.limit)
  if (stuckErr) throw new Error(`stuck transfers unreadable: ${stuckErr.message}`)
  for (const r of (stuck ?? []) as {
    id: string
    order_id: string
    stripe_account_id: string
    amount_cents: number
    currency: string
    attempts: number
    last_error: string | null
  }[]) {
    out.stuck += 1
    log.error('commerce.transfer.stuck', {
      orderId: r.order_id,
      rowId: r.id,
      account: r.stripe_account_id,
      amountCents: r.amount_cents,
      currency: r.currency,
      attempts: r.attempts,
      lastError: r.last_error,
    })
  }
  return out
}

// ── The webhook ─────────────────────────────────────────────────────────────────────────────────

/** `transfer.created`: adopt a transfer this ledger made but never recorded (the write after the
 *  call was lost). Keyed on the row id the transfer carries in its metadata; a transfer that is not
 *  ours, or a row already created, matches nothing. Throws on a database error so the webhook
 *  releases its claim and Stripe redelivers. Returns whether a row changed. */
export async function recordTransferCreated(transfer: Stripe.Transfer): Promise<boolean> {
  const rowId = transfer?.metadata?.commerce_order_transfer_id
  if (typeof rowId !== 'string' || !rowId || typeof transfer?.id !== 'string') return false
  const { data, error } = await db()
    .from(TABLE)
    .update({
      status: 'created',
      stripe_transfer_id: transfer.id,
      source_charge_id: typeof transfer.source_transaction === 'string' ? transfer.source_transaction : null,
      last_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', rowId)
    .in('status', OPEN)
    .select('id')
  if (error) throw new Error(`transfer ${transfer.id} not adopted: ${error.message}`)
  return (data ?? []).length > 0
}

/** `transfer.reversed`: record the reversed cents Stripe reports (cumulative, so a replay or an
 *  out-of-order delivery converges instead of adding twice), and mark the row reversed once the whole
 *  transfer is back. A partial reversal stays created with reversed_cents set. A reversal made from
 *  the Stripe dashboard is then not invisible to the ledger. Throws on a database error. */
export async function recordTransferReversed(transfer: Stripe.Transfer): Promise<boolean> {
  if (typeof transfer?.id !== 'string') return false
  const reversed = int(transfer.amount_reversed) ?? 0
  const { data: found, error: readErr } = await db()
    .from(TABLE)
    .select('id, amount_cents, reversed_cents, status')
    .eq('stripe_transfer_id', transfer.id)
    .maybeSingle()
  if (readErr) throw new Error(`transfer ${transfer.id} unreadable: ${readErr.message}`)
  const row = found as { id: string; amount_cents: number; reversed_cents: number; status: TransferStatus } | null
  if (!row || reversed <= row.reversed_cents) return false
  const cents = Math.min(reversed, row.amount_cents)
  const { data, error } = await db()
    .from(TABLE)
    .update({
      reversed_cents: cents,
      status: cents >= row.amount_cents ? 'reversed' : row.status,
      updated_at: new Date().toISOString(),
    })
    .eq('id', row.id)
    .lt('reversed_cents', cents)
    .select('id')
  if (error) throw new Error(`transfer ${transfer.id} reversal not recorded: ${error.message}`)
  return (data ?? []).length > 0
}

// ── Read ────────────────────────────────────────────────────────────────────────────────────────

/** Every transfer row of one order, oldest first. The read LIVE-623 reverses from and LIVE-624
 *  shows a seller their share from. Throws on a database error: an unreadable ledger must never read
 *  as "no transfers", which would tell a refund there is nothing to reverse. */
export async function listOrderTransfers(orderId: string): Promise<OrderTransfer[]> {
  const { data, error } = await db()
    .from(TABLE)
    .select(ROW_COLS)
    .eq('order_id', orderId)
    .order('created_at', { ascending: true })
  if (error) throw new Error(`transfers for ${orderId} unreadable: ${error.message}`)
  return ((data ?? []) as TransferRow[]).map(toTransfer)
}
