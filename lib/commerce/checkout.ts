// Commerce checkout — the one new caller of the existing billing rails. Mirrors
// lib/billing/tickets.ts (destination charge + application fee, pending row keyed
// by checkout session, idempotent settle, financial_transactions recording,
// destination-charge refund). Three owner kinds:
//   platform → plain charge on the platform account (no transfer; keep 100%)
//   profile  → destination charge to the maker's connected account (maker rake)
//   space    → destination charge to the Space owner's connected account (plan rake)
// Server-only. Flag-gated by payoutsLive() like every other billing path.

import type Stripe from 'stripe'
import type { SupabaseClient } from '@supabase/supabase-js'
import { stripe, appUrl } from '@/lib/billing/stripe'
import { getConnectStatus, payoutsLive } from '@/lib/billing/connect'
import { spaceTakeRateCents, memberTakeRateCents } from '@/lib/billing/fees'
import { classifyOrderSource } from './order-source'
import { effectiveOrderSource } from '@/lib/pricing/network-world'
import type { OrderSource } from '@/lib/billing/pricing-keys'
import { confirmBookingByOrder, cancelBookingByOrder } from '@/lib/spaces/booking'
import { createAdminClient } from '@/lib/supabase/admin'
import { recordFinancialTransaction } from '@/lib/finance/record'
import { computeBookingRefundCents } from './cancellation'
import { canTakePayments } from './selling'
import { getVariantsByIds } from './variants'
import { effectiveVariantPriceCents, effectiveVariantStock } from './types'
import type { CheckoutInput, CommerceVariant, ServiceConfig } from './types'

function db(): SupabaseClient {
  return createAdminClient()
}

interface ProductRow {
  id: string
  owner_kind: 'platform' | 'profile' | 'space'
  owner_profile_id: string | null
  owner_space_id: string | null
  entity_id: string
  title: string
  price_cents: number
  currency: string
  stock: number | null
  status: string
}

const PRODUCT_COLS =
  'id, owner_kind, owner_profile_id, owner_space_id, entity_id, title, price_cents, currency, stock, status'

/** Member-facing copy for a checkout that could not start. One string so every failure arm agrees. */
const CHECKOUT_START_FAILED = 'Could not start checkout. Please try again.'

export interface CommerceCheckoutResult {
  url?: string
  error?: string
  /** The pending order's id (Phase 4: lets a service booking link its hold to the order it will settle). */
  orderId?: string
}

type ResolvedCharge =
  // `source` is the EFFECTIVE source the fee was computed at: a disconnected space collapses it to `self`
  // (ADR-811 §3), so the persisted attribution matches the 0% it was actually billed (the honest receipt).
  | { platformFeeCents: number; sellerStripeAccountId: string | null; source: OrderSource }
  | { error: string }

async function resolveCharge(seller: ProductRow, grossCents: number, source: OrderSource): Promise<ResolvedCharge> {
  if (seller.owner_kind === 'platform') {
    return { platformFeeCents: 0, sellerStripeAccountId: null, source }
  }
  if (seller.owner_kind === 'profile') {
    const status = await getConnectStatus(seller.owner_profile_id ?? '')
    if (!status.accountId || !status.ready) return { error: 'This seller can’t take payment yet.' }
    // An individual seller: 0% on their OWN sale, and their TIER's rung on a network-sourced one — free
    // Member 10%, Crew 8% (ADR-914). Moving the listing into a Business Space buys it down further (the
    // space branch below).
    //
    // Reads the REAL `membership_tier`, not the beta-granted one: BETA_OPEN_ACCESS reports 'crew' to
    // every signed-in member, and billing the Crew rate to someone who has not bought Crew charges them
    // for a discount they do not hold. Fail-safe — an error leaves the tier null, which prices at the
    // free rung (never under-collect).
    const { data: sellerProf } = await db()
      .from('profiles')
      .select('membership_tier')
      .eq('id', seller.owner_profile_id ?? '')
      .maybeSingle()
    const sellerTier = (sellerProf as { membership_tier: string | null } | null)?.membership_tier ?? null
    return {
      platformFeeCents: await memberTakeRateCents(grossCents, source, sellerTier),
      sellerStripeAccountId: status.accountId,
      source,
    }
  }
  const { data } = await db()
    .from('spaces')
    .select('owner_profile_id, plan, network_connected')
    .eq('id', seller.owner_space_id ?? '')
    .maybeSingle()
  const owner =
    (data as { owner_profile_id?: string | null; plan?: string | null; network_connected?: boolean | null } | null) ??
    null
  if (!owner?.owner_profile_id) return { error: 'This storefront has no owner to pay.' }
  const status = await getConnectStatus(owner.owner_profile_id)
  if (!status.accountId || !status.ready) return { error: 'This storefront can’t take payment yet.' }
  // A standalone (disconnected) Space has left the graph, so it can have NO network-sourced revenue —
  // its source collapses to self (ADR-811 §3), guaranteeing 0% even if a stray referral cookie was set.
  const effective = effectiveOrderSource(source, owner.network_connected)
  return {
    // A space store's take-rate is 0% on its OWN booking (the hard promise) and the tier's network rate
    // on a sale the collective sourced (ADR-811), keyed on the space plan (Business 5% → Collective 3% → …).
    platformFeeCents: await spaceTakeRateCents(grossCents, owner.plan ?? 'free', effective),
    sellerStripeAccountId: status.accountId,
    source: effective,
  }
}

/** Validate a single-seller cart, record a pending order + items, return Checkout URL. */
export async function createCommerceCheckout(input: CheckoutInput): Promise<CommerceCheckoutResult> {
  if (!input.items?.length) return { error: 'Your cart is empty.' }
  if (!stripe) return { error: 'Payments aren’t turned on yet.' }

  const ids = [...new Set(input.items.map((i) => i.productId))]
  const { data } = await db().from('commerce_products').select(PRODUCT_COLS).in('id', ids)
  const products = (data ?? []) as ProductRow[]
  if (products.length !== ids.length) return { error: 'Some items are no longer available.' }
  if (products.some((p) => p.status !== 'active')) return { error: 'Some items are no longer on sale.' }

  const ownerKey = (p: ProductRow) => `${p.owner_kind}:${p.owner_profile_id ?? ''}:${p.owner_space_id ?? ''}`
  if (new Set(products.map(ownerKey)).size > 1) {
    return { error: 'Please check out items from one seller at a time.' }
  }
  const seller = products[0]

  // R2 (Phase 0): only a Business Space Shop or the Frequency Store may take in-app payments. An
  // individual maker ('profile') listing is connect-only — never open a Stripe session for it; the
  // buyer contacts the seller instead. Single source of truth: canTakePayments.
  if (!canTakePayments(seller.owner_kind)) {
    return { error: 'This seller takes contact only. Message them to arrange the sale.' }
  }

  // Resolve any selected variants (Etsy-Grade Phase 2): each must belong to its product AND be active;
  // its effective price (variant override, else the product price) drives the line + gross, and its
  // effective stock is soft-checked here (the paid-order RPC still enforces it atomically). A plain
  // item with no variantId is unchanged. One Line per cart item feeds gross, the Stripe line items, and
  // the order-item rows so price + variant stay consistent across all three.
  const variantMap = await getVariantsByIds(input.items.map((i) => i.variantId ?? '').filter(Boolean))
  const lines: {
    product: ProductRow
    variant: CommerceVariant | null
    qty: number
    unitCents: number
    title: string
  }[] = []
  for (const it of input.items) {
    const p = products.find((x) => x.id === it.productId)!
    const qty = Math.max(1, Math.floor(it.qty))
    let variant: CommerceVariant | null = null
    if (it.variantId) {
      variant = variantMap.get(it.variantId) ?? null
      if (!variant || variant.productId !== p.id || !variant.active) {
        return { error: 'That option is no longer available.' }
      }
      const available = effectiveVariantStock(variant)
      if (available != null && available < qty) return { error: 'That option is out of stock.' }
    }
    const unitCents = variant ? effectiveVariantPriceCents({ priceCents: p.price_cents }, variant) : p.price_cents
    lines.push({ product: p, variant, qty, unitCents, title: variant ? `${p.title} (${variant.name})` : p.title })
  }

  const gross = lines.reduce((sum, l) => sum + l.unitCents * l.qty, 0)
  if (gross <= 0) return { error: 'Nothing to charge.' }

  // Classify the order's source ONCE (ADR-811 §A): self = the operator's own booking (0% fee), network =
  // the collective sourced the customer. Default-safe to self on any ambiguity.
  const { source, attributionRef } = await classifyOrderSource({
    entryPoint: input.entryPoint ?? null,
    buyerProfileId: input.buyerProfileId,
    sellerProfileId: seller.owner_profile_id,
    // A Space shop: the relationship check (ADR-913) asks the SPACE's followers / members / CRM too,
    // not just the owner profile. Null for a profile or platform seller, which is correct.
    sellerSpaceId: seller.owner_kind === 'space' ? seller.owner_space_id ?? null : null,
  })
  const charge = await resolveCharge(seller, gross, source)
  if ('error' in charge) return charge
  if (charge.sellerStripeAccountId && !(await payoutsLive())) {
    return { error: 'Payments aren’t turned on yet.' }
  }

  // L6-03 (2026-09-05): the ORDER is written BEFORE the Stripe session, and every write is checked.
  // The previous order was session → order insert (error discarded) → items insert (error discarded)
  // → return the URL regardless, so a failed insert (constraint, RLS, transient) or a process kill
  // between the two left a payable session with NO order behind it: the buyer paid, the webhook found
  // zero 'pending' rows to flip, and there was nothing to fulfil or refund from the operator UI. The
  // tips and tickets rails already check their pending insert and expire the session on failure;
  // commerce was the outlier. Now: pending order → items → Stripe session (carrying order_id in its
  // metadata) → session id stored on the order. Any failure marks the order 'failed' (a status the
  // table already has; 'cancelled' is reserved for an abandoned/expired session) and returns the
  // action's error shape instead of a URL. The webhook contract is UNCHANGED: recordCommerceOrderFromSession
  // still finds the row by stripe_checkout_session_id + status='pending', and abandonCommerceOrderFromSession
  // the same way; order_id in the session metadata is carried for reconciliation, not looked up.
  const { data: orderRow, error: orderErr } = await db()
    .from('commerce_orders')
    .insert({
      buyer_profile_id: input.buyerProfileId,
      owner_kind: seller.owner_kind,
      owner_profile_id: seller.owner_profile_id,
      owner_space_id: seller.owner_space_id,
      entity_id: seller.entity_id,
      amount_cents: gross,
      platform_fee_cents: charge.platformFeeCents,
      // Persist the EFFECTIVE source the fee was billed at (a disconnected space collapses to self, ADR-811
      // §3), and drop the provenance tag when it collapsed — a self order carries no network attribution.
      source: charge.source,
      attribution_ref: charge.source === 'network' ? attributionRef : null,
      currency: seller.currency || 'usd',
      status: 'pending',
      shipping: input.shipping ?? {},
      seller_stripe_account_id: charge.sellerStripeAccountId,
    })
    .select('id')
    .maybeSingle()
  const orderId = (orderRow as { id?: string } | null)?.id
  if (orderErr || !orderId) {
    console.error('[commerce] pending order insert failed', { error: orderErr?.message ?? 'no id returned' })
    return { error: CHECKOUT_START_FAILED }
  }

  const { error: itemsErr } = await db().from('commerce_order_items').insert(
    lines.map((l) => ({
      order_id: orderId,
      product_id: l.product.id,
      // variant_id drives the per-variant stock decrement in decrement_commerce_stock_atomic
      // (Etsy-Grade Phase 2); null for a plain item, which decrements product stock as before.
      variant_id: l.variant?.id ?? null,
      title: l.title,
      qty: l.qty,
      unit_cents: l.unitCents,
      subtotal_cents: l.unitCents * l.qty,
    })),
  )
  if (itemsErr) {
    console.error('[commerce] order items insert failed', { orderId, error: itemsErr.message })
    await markPendingOrderFailed(orderId, 'items_insert_failed')
    return { error: CHECKOUT_START_FAILED }
  }

  let session: Stripe.Checkout.Session
  try {
    session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: lines.map((l) => ({
        quantity: l.qty,
        price_data: {
          currency: (l.product.currency || 'usd').toLowerCase(),
          unit_amount: l.unitCents,
          product_data: { name: l.title },
        },
      })),
      ...(charge.sellerStripeAccountId
        ? {
            payment_intent_data: {
              application_fee_amount: charge.platformFeeCents,
              transfer_data: { destination: charge.sellerStripeAccountId },
              on_behalf_of: charge.sellerStripeAccountId,
              metadata: { kind: 'commerce_order', buyer_profile_id: input.buyerProfileId, order_id: orderId },
            },
          }
        : {}),
      client_reference_id: input.buyerProfileId,
      metadata: { kind: 'commerce_order', buyer_profile_id: input.buyerProfileId, order_id: orderId },
      success_url: `${appUrl()}/orders?ok=1&session_id={CHECKOUT_SESSION_ID}`,
      // Cancel back to the surface the buyer was purchasing from, never the free peer board
      // (`/marketplace` redirects to Classifieds). Frequency Store → /store; Market + Space
      // shops both browse under the Market umbrella.
      cancel_url: `${appUrl()}${seller.owner_kind === 'platform' ? '/store' : '/market'}`,
    })
  } catch (err) {
    console.error('[commerce] stripe session create failed', { orderId, err })
    await markPendingOrderFailed(orderId, 'stripe_session_failed')
    return { error: CHECKOUT_START_FAILED }
  }

  // Link the session to the order (checked). Without this link the webhook cannot find the row, so
  // if it fails the session is expired (best-effort, like tips/tickets) so it can never be paid into
  // a void, and the order is marked failed.
  const { data: linked, error: linkErr } = await db()
    .from('commerce_orders')
    .update({ stripe_checkout_session_id: session.id })
    .eq('id', orderId)
    .eq('status', 'pending')
    .select('id')
  if (linkErr || !(linked ?? []).length || !session.url) {
    console.error('[commerce] session link failed', { orderId, sessionId: session.id, error: linkErr?.message ?? null })
    try {
      await stripe.checkout.sessions.expire(session.id)
    } catch {
      // best-effort: an unexpired session simply lapses on its own; we still refuse the URL
    }
    await markPendingOrderFailed(orderId, linkErr || !(linked ?? []).length ? 'session_link_failed' : 'no_session_url')
    return { error: CHECKOUT_START_FAILED }
  }

  return { url: session.url, orderId }
}

/** Mark a never-paid pending order 'failed' so nothing dangles (L6-03). Guarded on status='pending' so it
 *  can never touch a row the webhook has already settled. The reason lands in metadata for the operator;
 *  the row is still pending at this point (no session is linked yet, or it was just expired), so nothing
 *  else writes its metadata and a whole-value write cannot clobber a settle marker. Fail-soft: a failure
 *  here leaves a 'pending' row that no session can ever pay, which is inert. */
async function markPendingOrderFailed(orderId: string, reason: string): Promise<void> {
  try {
    await db()
      .from('commerce_orders')
      .update({ status: 'failed', metadata: { checkout_failure: reason } })
      .eq('id', orderId)
      .eq('status', 'pending')
  } catch (err) {
    console.error('[commerce] could not mark order failed', { orderId, reason, err })
  }
}

/** Settle the order behind a completed Checkout session (idempotent). Platform
 *  (first-party) revenue = the full amount; a destination charge's revenue = the
 *  application fee (seller gross is off-ledger). */
export async function recordCommerceOrderFromSession(session: Stripe.Checkout.Session): Promise<void> {
  if (session.metadata?.kind !== 'commerce_order') return
  if (session.payment_status !== 'paid') return
  const paymentIntentId =
    typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id ?? null

  const { data: updated } = await db()
    .from('commerce_orders')
    .update({ status: 'paid', paid_at: new Date().toISOString(), stripe_payment_intent_id: paymentIntentId })
    .eq('stripe_checkout_session_id', session.id)
    .eq('status', 'pending')
    .select('id, owner_kind, entity_id, amount_cents, platform_fee_cents, buyer_profile_id, currency')
  const rows = (updated ?? []) as {
    id: string
    owner_kind: 'platform' | 'profile' | 'space'
    entity_id: string
    amount_cents: number
    platform_fee_cents: number
    buyer_profile_id: string | null
    currency: string
  }[]

  for (const row of rows) {
    // Enforce inventory for this paid order: decrement_commerce_stock_atomic
    // (migration 20260819000000) locks each tracked-stock product, subtracts this
    // order's quantities, and is idempotent per order (a retried/concurrent settle
    // no-ops). Untracked products (stock null) are skipped and stay unlimited.
    const { error: stockError } = await db().rpc('decrement_commerce_stock_atomic', { _order: row.id })
    if (stockError) {
      // The order is already paid + settled; the RPC raises typed P0001 'out_of_stock'
      // only when stock raced below the sold quantity. We fail SOFT (log, do not throw)
      // so the ledger record + paid flip are never blocked. Operators reconcile oversell
      // out of band; idempotency means a webhook retry re-runs safely once stock is fixed.
      console.error('[commerce] stock decrement failed', { orderId: row.id, error: stockError.message })
    }

    const revenue = row.owner_kind === 'platform' ? row.amount_cents : row.platform_fee_cents
    await recordFinancialTransaction({
      entityId: row.entity_id,
      revenueType: 'commerce',
      amountCents: revenue,
      profileId: row.buyer_profile_id,
      currency: row.currency,
      stripePaymentIntentId: paymentIntentId,
      sourceTable: 'commerce_orders',
      sourceId: row.id,
      idempotencyKey: `commerce_order:${row.id}`,
    }).catch(() => {})

    // Bookable services (Phase 4, ADR-596): if this order paid the deposit on a held booking, confirm
    // it. No-op / fail-soft for a normal product order (no linked booking) and pre-migration.
    await confirmBookingByOrder(row.id)
  }
}

/** Abandon the pending order behind an EXPIRED or async-failed Checkout session (idempotent): mark it
 *  cancelled and release any held booking (Phase 4). No charge occurred, so there is nothing to refund;
 *  without this, an abandoned service checkout would leave its 'pending' booking hold occupying the slot
 *  forever. FAIL-SOFT booking release (no-op for a normal product order / pre-migration). */
export async function abandonCommerceOrderFromSession(session: Stripe.Checkout.Session): Promise<void> {
  if (session.metadata?.kind !== 'commerce_order') return
  const { data: updated } = await db()
    .from('commerce_orders')
    .update({ status: 'cancelled' })
    .eq('stripe_checkout_session_id', session.id)
    .eq('status', 'pending')
    .select('id')
  for (const row of (updated ?? []) as { id: string }[]) {
    await cancelBookingByOrder(row.id)
  }
}

/**
 * The Stripe `amount` (cents) to refund for a booking-backed service order whose ServiceConfig
 * carries a cancellation/no-show policy, or `undefined` for a FULL refund (a normal product order,
 * a service with no policy, or any read miss). PURE money math lives in ./cancellation.ts; this is
 * the thin IO that resolves the booking's start time + the product's policy and clamps to a genuine
 * partial. FAIL-SOFT: any read error returns undefined so the caller issues the full refund rather
 * than blocking the cancel (ADR-596, finding #4).
 */
async function bookingPartialRefundCents(order: { id: string; amount_cents: number }): Promise<number | undefined> {
  if (!(order.amount_cents > 0)) return undefined
  try {
    // order_id ↔ booking is 1:1.
    const admin = createAdminClient()
    const { data: bk } = await admin
      .from('space_bookings')
      .select('starts_at, product_id')
      .eq('order_id', order.id)
      .maybeSingle()
    const booking = bk ?? null
    if (!booking?.product_id || !booking.starts_at) return undefined // not booking-backed

    const { data: prod } = await db()
      .from('commerce_products')
      .select('product_kind, metadata')
      .eq('id', booking.product_id)
      .maybeSingle()
    const product = prod as { product_kind: string; metadata: Record<string, unknown> | null } | null
    if (!product || (product.product_kind !== 'service' && product.product_kind !== 'booking')) return undefined

    const svc = ((product.metadata?.service ?? {}) as ServiceConfig) || {}
    // No enforceable policy → full refund (undefined). computeBookingRefundCents also guards this,
    // but short-circuiting keeps the common (policy-less) path a no-op.
    if (!svc.noShowFeePct || svc.cancellationWindowHours == null) return undefined

    const { refundCents } = computeBookingRefundCents({
      paidCents: order.amount_cents,
      startsAt: booking.starts_at,
      now: new Date(),
      cancellationWindowHours: svc.cancellationWindowHours,
      noShowFeePct: svc.noShowFeePct,
    })
    // Only pass an explicit amount for a genuine partial; a full refund stays undefined (unchanged behavior).
    return refundCents < order.amount_cents ? refundCents : undefined
  } catch {
    return undefined // fail-soft: fall back to a full refund, never block the cancel
  }
}

/** Refund a paid order. Destination charges unwind with reverse_transfer +
 *  refund_application_fee; platform charges refund normally. A booking-backed service order with a
 *  cancellation/no-show policy refunds the COMPUTED (partial) amount; everything else refunds fully. */
export async function refundCommerceOrder(orderId: string): Promise<{ ok?: true; error?: string }> {
  if (!stripe) return { error: 'Payments aren’t turned on yet.' }
  const { data } = await db()
    .from('commerce_orders')
    .select('id, owner_kind, status, amount_cents, stripe_payment_intent_id, refunded_at')
    .eq('id', orderId)
    .maybeSingle()
  const order = data as
    | {
        id: string
        owner_kind: string
        status: string
        amount_cents: number
        stripe_payment_intent_id: string | null
        refunded_at: string | null
      }
    | null
  if (!order) return { error: 'Order not found.' }
  if (order.status === 'refunded') return { ok: true }
  // L6-08 (2026-09-05): a PARTIAL refund keeps its settled status (the schema has no partial state; see
  // recordCommerceRefund) but stamps refunded_at, so this guard is what stops a second call from refunding
  // the retained fee on top. Idempotent: the order has already been refunded as far as it will be.
  if (order.refunded_at) return { ok: true }
  if (order.status !== 'paid' && order.status !== 'fulfilled') return { error: 'Only a paid order can be refunded.' }
  if (!order.stripe_payment_intent_id) return { error: 'This order has no charge to refund.' }

  // Cancellation/no-show ENFORCEMENT (ADR-596, finding #4): a booking-backed service order with a
  // policy refunds only the computed amount (the seller keeps the fee). undefined ⇒ full refund.
  const partialAmount = await bookingPartialRefundCents({ id: order.id, amount_cents: order.amount_cents })

  try {
    await stripe.refunds.create({
      payment_intent: order.stripe_payment_intent_id,
      ...(partialAmount != null ? { amount: partialAmount } : {}),
      ...(order.owner_kind === 'platform' ? {} : { reverse_transfer: true, refund_application_fee: true }),
      metadata: { kind: 'commerce_order', order_id: order.id },
    })
  } catch (err) {
    console.error('[commerce] refund failed', { orderId, err })
    return { error: 'Refund failed at the payment processor.' }
  }
  // L6-08 (2026-09-05): record what was ACTUALLY refunded. Before this the partial amount went to Stripe
  // and the recorder was then told nothing, so it flipped the order to 'refunded' and reversed the whole
  // revenue: the ledger under-reported by the retained fee and the order read as fully refunded to
  // buyer and seller. The partial path releases the booking slot (this IS the policy-cancel).
  await recordCommerceRefund(
    order.stripe_payment_intent_id,
    partialAmount != null ? { refundedCents: partialAmount, releaseBooking: true } : undefined,
  )
  return { ok: true }
}

export interface CommerceRefundOptions {
  /** Cents actually returned to the buyer. Omit for a full refund; a value >= amount_cents is full. */
  refundedCents?: number
  /** Release the booking slot behind a PARTIAL refund (the policy-cancel path). A full refund always
   *  releases it; a partial one arriving from the webhook alone (a dashboard goodwill refund) does not,
   *  because a partial refund by itself does not say the appointment was cancelled. */
  releaseBooking?: boolean
}

interface RefundedOrderRow {
  id: string
  owner_kind: 'platform' | 'profile' | 'space'
  entity_id: string
  amount_cents: number
  platform_fee_cents: number
  buyer_profile_id: string | null
  currency: string
  metadata: Record<string, unknown> | null
}

const REFUND_ROW_COLS = 'id, owner_kind, entity_id, amount_cents, platform_fee_cents, buyer_profile_id, currency, metadata'

/** What a partial refund leaves in commerce_orders.metadata.refund (L6-08). The schema's status check
 *  (`pending|paid|fulfilled|cancelled|refunded|failed`, migration 20260815000000) has NO partial state and
 *  this lane adds no migration, so the order KEEPS its settled status (the sale partly stands: the seller
 *  kept the fee), `refunded_at` is stamped, and the amounts live here. The full path reads
 *  `revenue_reversed_cents` back so a later top-up to a full refund reverses only the remainder. */
export interface PartialRefundRecord {
  kind: 'partial'
  refunded_cents: number
  retained_cents: number
  revenue_reversed_cents: number
  recorded_at: string
}

/** The platform's recorded revenue for an order: the full amount for a first-party sale, the
 *  application fee for a destination charge (seller gross is off-ledger). */
function recordedRevenueCents(row: Pick<RefundedOrderRow, 'owner_kind' | 'amount_cents' | 'platform_fee_cents'>): number {
  return row.owner_kind === 'platform' ? row.amount_cents : row.platform_fee_cents
}

/** Record a refund against the order behind a PaymentIntent (idempotent).
 *  - FULL (no `refundedCents`, or >= amount_cents): paid/fulfilled → refunded, reverse the ledger for the
 *    revenue not already reversed by an earlier partial, release the booking, and restore tracked stock.
 *  - PARTIAL (`refundedCents` < amount_cents): status unchanged, refunded_at stamped once, ledger reversal
 *    pro-rated to the refunded share, booking released only when the caller says so. Stock is NOT restored
 *    on a partial refund: the goods were not returned, and the only partial path in the product is the
 *    booking policy, which has no stock. */
export async function recordCommerceRefund(
  paymentIntentId: string | null,
  opts: CommerceRefundOptions = {},
): Promise<void> {
  if (!paymentIntentId) return
  if (opts.refundedCents != null) {
    const { data } = await db()
      .from('commerce_orders')
      .select('id, amount_cents')
      .eq('stripe_payment_intent_id', paymentIntentId)
      .in('status', ['paid', 'fulfilled'])
      .maybeSingle()
    const target = data as { id: string; amount_cents: number } | null
    if (!target) return // nothing settled behind this charge (not ours, or already fully refunded)
    if (opts.refundedCents < target.amount_cents) {
      await recordPartialCommerceRefund(target.id, paymentIntentId, opts.refundedCents, opts.releaseBooking === true)
      return
    }
  }
  await recordFullCommerceRefund(paymentIntentId)
}

/** Flip a refunded order + reverse the ledger entry (idempotent; paid → refunded). */
async function recordFullCommerceRefund(paymentIntentId: string): Promise<void> {
  const { data: updated } = await db()
    .from('commerce_orders')
    .update({ status: 'refunded', refunded_at: new Date().toISOString() })
    .eq('stripe_payment_intent_id', paymentIntentId)
    .in('status', ['paid', 'fulfilled'])
    .select(REFUND_ROW_COLS)
  const rows = (updated ?? []) as RefundedOrderRow[]
  for (const row of rows) {
    const revenue = recordedRevenueCents(row)
    // A partial refund recorded earlier already reversed part of this revenue (L6-08); reverse the rest.
    const partial = (row.metadata?.refund ?? null) as Partial<PartialRefundRecord> | null
    const alreadyReversed = partial?.kind === 'partial' ? Math.max(0, Number(partial.revenue_reversed_cents) || 0) : 0
    await recordFinancialTransaction({
      entityId: row.entity_id,
      revenueType: 'refund',
      amountCents: -Math.max(0, revenue - alreadyReversed),
      profileId: row.buyer_profile_id,
      currency: row.currency,
      stripePaymentIntentId: paymentIntentId,
      sourceTable: 'commerce_orders',
      sourceId: row.id,
      idempotencyKey: `commerce_order-refund:${row.id}`,
    }).catch(() => {})

    // Bookable services (Phase 4, ADR-596): release the slot behind a refunded service order. Fail-soft.
    await cancelBookingByOrder(row.id)

    // L6-16 (2026-09-05): give the goods back to the shelf. Tickets free their tier on refund
    // (adjustTierSold(-qty)); commerce never re-incremented stock, so a refunded item stayed sold out.
    await restoreCommerceStock(row).catch((err) => {
      console.error('[commerce] stock restore failed', { orderId: row.id, err })
    })
  }
}

/** Record a PARTIAL refund once (L6-08): stamp refunded_at + metadata.refund under a `refunded_at is null`
 *  guard, reverse the pro-rated revenue, and release the booking when asked. Both the server action and
 *  the charge.refunded webhook arrive here for the same refund; the guard makes the second a no-op. */
async function recordPartialCommerceRefund(
  orderId: string,
  paymentIntentId: string,
  refundedCents: number,
  releaseBooking: boolean,
): Promise<void> {
  const { data } = await db().from('commerce_orders').select(REFUND_ROW_COLS).eq('id', orderId).maybeSingle()
  const row = data as RefundedOrderRow | null
  if (!row) return
  const refunded = Math.max(0, Math.min(row.amount_cents, Math.round(refundedCents)))
  const revenue = recordedRevenueCents(row)
  // Pro-rate: Stripe refunds the application fee in the same proportion on a partial refund with
  // refund_application_fee, and a platform sale's revenue IS the amount, so the share is exact there.
  const reversed = row.amount_cents > 0 ? Math.min(revenue, Math.round((revenue * refunded) / row.amount_cents)) : 0
  const record: PartialRefundRecord = {
    kind: 'partial',
    refunded_cents: refunded,
    retained_cents: row.amount_cents - refunded,
    revenue_reversed_cents: reversed,
    recorded_at: new Date().toISOString(),
  }
  const { data: stamped } = await db()
    .from('commerce_orders')
    .update({ refunded_at: record.recorded_at, metadata: { ...(row.metadata ?? {}), refund: record } })
    .eq('id', orderId)
    .in('status', ['paid', 'fulfilled'])
    .is('refunded_at', null)
    .select('id')
  if (!(stamped ?? []).length) return // already recorded (idempotent)

  await recordFinancialTransaction({
    entityId: row.entity_id,
    revenueType: 'refund',
    amountCents: -reversed,
    profileId: row.buyer_profile_id,
    currency: row.currency,
    stripePaymentIntentId: paymentIntentId,
    sourceTable: 'commerce_orders',
    sourceId: row.id,
    idempotencyKey: `commerce_order-refund:${row.id}:partial`,
  }).catch(() => {})

  if (releaseBooking) await cancelBookingByOrder(row.id)
}

/** Re-increment tracked stock for a FULLY refunded order (L6-16). Mirrors decrement_commerce_stock_atomic
 *  (migration 20261132000000): a variant-selected item restores the VARIANT's stock, a plain item the
 *  PRODUCT's, and an untracked row (stock null) is skipped. Only runs when the decrement actually
 *  happened (metadata.inventory_decremented) and once per order (metadata.inventory_restored); the
 *  status flip that calls this is itself exactly-once, so a replayed webhook never re-enters.
 *
 *  WHY compare-and-swap and not an RPC: no restore RPC exists (the decrement RPC is keyed on the order's
 *  items with a one-way marker and has no inverse) and this lane adds no migration, so the increment is
 *  a guarded single-statement update (`set stock = current + qty where id = ? and stock = current`)
 *  retried on a lost race, never an unguarded read-then-write. Lift into a `restore_commerce_stock_atomic`
 *  RPC when the next stock migration lands. */
async function restoreCommerceStock(order: Pick<RefundedOrderRow, 'id' | 'metadata'>): Promise<void> {
  const meta = order.metadata ?? {}
  if (meta.inventory_decremented !== true) return // never decremented (pre-enforcement order, or the decrement failed soft)
  if (meta.inventory_restored === true) return
  const { data } = await db()
    .from('commerce_order_items')
    .select('product_id, variant_id, qty')
    .eq('order_id', order.id)
  const items = (data ?? []) as { product_id: string | null; variant_id: string | null; qty: number }[]
  for (const it of items) {
    const qty = Math.max(0, Math.floor(Number(it.qty) || 0))
    if (!qty) continue
    if (it.variant_id) await restoreStockRow('commerce_variants', it.variant_id, qty)
    else if (it.product_id) await restoreStockRow('commerce_products', it.product_id, qty)
  }
  await db()
    .from('commerce_orders')
    .update({ metadata: { ...meta, inventory_restored: true } })
    .eq('id', order.id)
}

const STOCK_RESTORE_ATTEMPTS = 5

async function restoreStockRow(table: 'commerce_products' | 'commerce_variants', id: string, qty: number): Promise<void> {
  for (let attempt = 0; attempt < STOCK_RESTORE_ATTEMPTS; attempt++) {
    const { data } = await db().from(table).select('stock').eq('id', id).maybeSingle()
    const current = (data as { stock: number | null } | null)?.stock
    if (current == null) return // untracked: nothing was decremented, nothing to give back
    const { data: updated } = await db()
      .from(table)
      .update({ stock: current + qty })
      .eq('id', id)
      .eq('stock', current)
      .select('id')
    if ((updated ?? []).length) return
  }
  console.error('[commerce] stock restore lost the compare-and-swap race', { table, id, qty })
}

/** Resolve the refund's PaymentIntent from a charge.refunded event and reconcile.
 *  No-ops unless a matching paid commerce order exists (mirrors tickets). L6-08 (2026-09-05): a
 *  partial refund (amount_refunded < amount) is recorded AS partial, never as a full one; the ticket
 *  twin returns early instead, but commerce issues partials itself (the booking policy), so the
 *  recorder has to understand them. The status flip only happens once the charge is fully refunded. */
export async function recordCommerceRefundFromCharge(charge: Stripe.Charge): Promise<void> {
  const paymentIntentId =
    typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id ?? null
  const amount = charge.amount ?? 0
  const refunded = charge.amount_refunded ?? 0
  if (refunded < amount) {
    await recordCommerceRefund(paymentIntentId, { refundedCents: refunded })
    return
  }
  await recordCommerceRefund(paymentIntentId)
}
