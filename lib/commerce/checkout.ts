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
import { spaceTakeRateCents } from '@/lib/billing/fees'
import { createAdminClient } from '@/lib/supabase/admin'
import { recordFinancialTransaction } from '@/lib/finance/record'
import type { CheckoutInput } from './types'

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
    return { platformFeeCents: await spaceTakeRateCents(grossCents, 'maker'), sellerStripeAccountId: status.accountId }
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
    platformFeeCents: await spaceTakeRateCents(grossCents, owner.plan ?? 'free'),
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

  const gross = input.items.reduce((sum, it) => {
    const p = products.find((x) => x.id === it.productId)!
    return sum + p.price_cents * Math.max(1, Math.floor(it.qty))
  }, 0)
  if (gross <= 0) return { error: 'Nothing to charge.' }

  const charge = await resolveCharge(seller, gross)
  if ('error' in charge) return charge
  if (charge.sellerStripeAccountId && !(await payoutsLive())) {
    return { error: 'Payments aren’t turned on yet.' }
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: input.items.map((it) => {
      const p = products.find((x) => x.id === it.productId)!
      return {
        quantity: Math.max(1, Math.floor(it.qty)),
        price_data: {
          currency: (p.currency || 'usd').toLowerCase(),
          unit_amount: p.price_cents,
          product_data: { name: p.title },
        },
      }
    }),
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
    cancel_url: `${appUrl()}/marketplace`,
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
      input.items.map((it) => {
        const p = products.find((x) => x.id === it.productId)!
        const qty = Math.max(1, Math.floor(it.qty))
        return {
          order_id: orderId,
          product_id: p.id,
          variant_id: it.variantId ?? null,
          title: p.title,
          qty,
          unit_cents: p.price_cents,
          subtotal_cents: p.price_cents * qty,
        }
      }),
    )
  }

  if (!session.url) return { error: 'Could not start checkout.' }
  return { url: session.url }
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
    // Untyped handle (same pattern as lib/rewards/gifts.ts): the RPC is new and not
    // yet in the generated Database types, so widen to the un-parametrised client.
    // Drop after `supabase gen types` is re-run.
    const rpc = db() as unknown as { rpc: SupabaseClient['rpc'] }
    const { error: stockError } = await rpc.rpc('decrement_commerce_stock_atomic', { _order: row.id })
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
  }
}

/** Refund a paid order. Destination charges unwind with reverse_transfer +
 *  refund_application_fee; platform charges refund normally. */
export async function refundCommerceOrder(orderId: string): Promise<{ ok?: true; error?: string }> {
  if (!stripe) return { error: 'Payments aren’t turned on yet.' }
  const { data } = await db()
    .from('commerce_orders')
    .select('id, owner_kind, status, stripe_payment_intent_id')
    .eq('id', orderId)
    .maybeSingle()
  const order = data as { id: string; owner_kind: string; status: string; stripe_payment_intent_id: string | null } | null
  if (!order) return { error: 'Order not found.' }
  if (order.status === 'refunded') return { ok: true }
  if (order.status !== 'paid' && order.status !== 'fulfilled') return { error: 'Only a paid order can be refunded.' }
  if (!order.stripe_payment_intent_id) return { error: 'This order has no charge to refund.' }

  try {
    await stripe.refunds.create({
      payment_intent: order.stripe_payment_intent_id,
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
  }
}

/** Resolve the refund's PaymentIntent from a charge.refunded event and reconcile.
 *  No-ops unless a matching paid commerce order exists (mirrors tickets). */
export async function recordCommerceRefundFromCharge(charge: Stripe.Charge): Promise<void> {
  const paymentIntentId =
    typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id ?? null
  await recordCommerceRefund(paymentIntentId)
}
