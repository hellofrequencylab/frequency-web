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
import { confirmBookingByOrder, cancelBookingByOrder } from '@/lib/spaces/booking'
import { spaceIsPaying } from '@/lib/billing/space-subscription-items'
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

export interface CommerceCheckoutResult {
  url?: string
  error?: string
  /** The pending order's id (Phase 4: lets a service booking link its hold to the order it will settle). */
  orderId?: string
}

type ResolvedCharge =
  | { platformFeeCents: number; sellerStripeAccountId: string | null }
  | { error: string }

async function resolveCharge(seller: ProductRow, grossCents: number): Promise<ResolvedCharge> {
  if (seller.owner_kind === 'platform') {
    return { platformFeeCents: 0, sellerStripeAccountId: null }
  }
  if (seller.owner_kind === 'profile') {
    const status = await getConnectStatus(seller.owner_profile_id ?? '')
    if (!status.accountId || !status.ready) return { error: 'This seller can’t take payment yet.' }
    // An individual paid-member seller pays the Market listing ladder rate (member_bps, 8% — ADR-596),
    // not a space plan rate. Upgrading to a Business Space buys the fee down (the space branch below).
    return { platformFeeCents: await memberTakeRateCents(grossCents), sellerStripeAccountId: status.accountId }
  }
  const { data } = await db()
    .from('spaces')
    .select('owner_profile_id, plan')
    .eq('id', seller.owner_space_id ?? '')
    .maybeSingle()
  const owner = (data as { owner_profile_id?: string | null; plan?: string | null } | null) ?? null
  if (!owner?.owner_profile_id) return { error: 'This storefront has no owner to pay.' }
  const status = await getConnectStatus(owner.owner_profile_id)
  if (!status.accountId || !status.ready) return { error: 'This storefront can’t take payment yet.' }
  return {
    // A space store's take-rate keys on paying-state (ADR-552): a free space pays the higher free rate,
    // a paying Business the lower rate. Resolve isPaying from its live subscription items.
    platformFeeCents: await spaceTakeRateCents(
      grossCents,
      owner.plan ?? 'free',
      await spaceIsPaying(seller.owner_space_id),
    ),
    sellerStripeAccountId: status.accountId,
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

  const charge = await resolveCharge(seller, gross)
  if ('error' in charge) return charge
  if (charge.sellerStripeAccountId && !(await payoutsLive())) {
    return { error: 'Payments aren’t turned on yet.' }
  }

  const session = await stripe.checkout.sessions.create({
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
            metadata: { kind: 'commerce_order', buyer_profile_id: input.buyerProfileId },
          },
        }
      : {}),
    client_reference_id: input.buyerProfileId,
    metadata: { kind: 'commerce_order', buyer_profile_id: input.buyerProfileId },
    success_url: `${appUrl()}/orders?ok=1&session_id={CHECKOUT_SESSION_ID}`,
    // Cancel back to the surface the buyer was purchasing from, never the free peer board
    // (`/marketplace` redirects to Classifieds). Frequency Store → /store; Market + Space
    // shops both browse under the Market umbrella.
    cancel_url: `${appUrl()}${seller.owner_kind === 'platform' ? '/store' : '/market'}`,
  })

  const { data: orderRow } = await db()
    .from('commerce_orders')
    .insert({
      buyer_profile_id: input.buyerProfileId,
      owner_kind: seller.owner_kind,
      owner_profile_id: seller.owner_profile_id,
      owner_space_id: seller.owner_space_id,
      entity_id: seller.entity_id,
      amount_cents: gross,
      platform_fee_cents: charge.platformFeeCents,
      currency: seller.currency || 'usd',
      status: 'pending',
      shipping: input.shipping ?? {},
      seller_stripe_account_id: charge.sellerStripeAccountId,
      stripe_checkout_session_id: session.id,
    })
    .select('id')
    .maybeSingle()

  const orderId = (orderRow as { id?: string } | null)?.id
  if (orderId) {
    await db().from('commerce_order_items').insert(
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
  }

  if (!session.url) return { error: 'Could not start checkout.' }
  return { url: session.url, orderId }
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
    // space_bookings is not in the generated DB types (ADR-246); read it through an untyped cast,
    // the same seam lib/spaces/booking.ts uses. order_id ↔ booking is 1:1.
    const admin = createAdminClient() as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          eq: (col: string, val: string) => {
            maybeSingle: () => Promise<{ data: { starts_at: string | null; product_id: string | null } | null }>
          }
        }
      }
    }
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
    .select('id, owner_kind, status, amount_cents, stripe_payment_intent_id')
    .eq('id', orderId)
    .maybeSingle()
  const order = data as
    | { id: string; owner_kind: string; status: string; amount_cents: number; stripe_payment_intent_id: string | null }
    | null
  if (!order) return { error: 'Order not found.' }
  if (order.status === 'refunded') return { ok: true }
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
  await recordCommerceRefund(order.stripe_payment_intent_id)
  return { ok: true }
}

/** Flip a refunded order + reverse the ledger entry (idempotent; paid → refunded). */
export async function recordCommerceRefund(paymentIntentId: string | null): Promise<void> {
  if (!paymentIntentId) return
  const { data: updated } = await db()
    .from('commerce_orders')
    .update({ status: 'refunded', refunded_at: new Date().toISOString() })
    .eq('stripe_payment_intent_id', paymentIntentId)
    .in('status', ['paid', 'fulfilled'])
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
    const revenue = row.owner_kind === 'platform' ? row.amount_cents : row.platform_fee_cents
    await recordFinancialTransaction({
      entityId: row.entity_id,
      revenueType: 'refund',
      amountCents: -revenue,
      profileId: row.buyer_profile_id,
      currency: row.currency,
      stripePaymentIntentId: paymentIntentId,
      sourceTable: 'commerce_orders',
      sourceId: row.id,
      idempotencyKey: `commerce_order-refund:${row.id}`,
    }).catch(() => {})

    // Bookable services (Phase 4, ADR-596): release the slot behind a refunded service order. Fail-soft.
    await cancelBookingByOrder(row.id)
  }
}

/** Resolve the refund's PaymentIntent from a charge.refunded event and reconcile.
 *  No-ops unless a matching paid commerce order exists (mirrors tickets). */
export async function recordCommerceRefundFromCharge(charge: Stripe.Charge): Promise<void> {
  const paymentIntentId =
    typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id ?? null
  await recordCommerceRefund(paymentIntentId)
}
