// BUYING A DOMAIN INSIDE FREQUENCY (LIVE-781). The server half of the Domain section's "Buy a new domain"
// method: quote a name, take the Space's payment through the checkout contract (docs/CHECKOUT.md), and
// only after Stripe confirms the payment, buy the domain on Frequency's Vercel team, attach it to the
// project and bind it to the Space. A domain bought on the team uses Vercel DNS, so there is no DNS step.
// Server-only (service role, Stripe, the Vercel token).
//
// THE MONEY, per the owner ruling of 2026-10-06: the Space pays Vercel's at-cost price plus a small
// operator-set markup (lib/sites/domain-pricing.ts, the `domain_markup` setting), shown as ONE yearly
// price before purchase, and the Space pays renewals. It is a platform charge (no Connect transfer):
// Frequency pays Vercel for the domain, so Frequency is paid.
//
// OFF BY DEFAULT. Nothing here sells unless domainPurchaseOpen(): billing is live AND the operator has
// turned `domain_purchase_enabled` on AND the Vercel config is present. The switch waits on Vercel
// confirming that buying domains for customers is allowed.
//
// IDEMPOTENT. One `space_domain_purchases` row per checkout, written `pending` before the session is
// handed back. The settle CLAIMS it with one conditional update (`pending` -> `purchasing`, returning
// the row); only the delivery that wins the claim calls Vercel. A retried webhook, the on-page settle
// and the success redirect can all run: whichever arrives second claims nothing and buys nothing.
//
// IF VERCEL REFUSES after the Space has paid (the name was taken in the meantime, the price moved), the
// row is marked `failed` and the payment is refunded in full under a fixed idempotency key, so a paid
// Space is never left holding nothing. A row stuck in `purchasing` (a crash between claim and order) is
// left for the follow-up reconcile (LIVE-786) rather than retried blind, because a blind retry is the one
// way to buy twice.
//
// RENEWALS. Each row records `renews_at` and the renewal price. Vercel auto-renew is turned on at
// purchase only when the Space has a saved payment method Frequency can charge for the renewal;
// otherwise it stays off and the row is what the renewal charge loop (LIVE-786) picks up.
//
// authz-delegated: every caller authorizes first. The checkout creator runs only behind the Space editor
// gate in app/(main)/spaces/[slug]/manage/layout/domain-purchase-actions.ts and writes rows bound to that
// Space; the settle, abandon and reconcile paths are keyed on a Stripe Checkout Session that Stripe
// itself reports as a paid `domain_purchase`, the same authority the webhook uses.

import type Stripe from 'stripe'
import type { SupabaseClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'
import { stripe, appUrl } from '@/lib/billing/stripe'
import { checkoutReturnFields, resolveCheckoutSession, type CheckoutUi } from '@/lib/billing/checkout-ui'
import { receiptEmailFor } from '@/lib/billing/receipt-address'
import { createAdminClient } from '@/lib/supabase/admin'
import { domainPurchaseEnabled, getDomainMarkupCents } from '@/lib/pricing/settings'
import { quoteDomain, type DomainSearch } from './domain-pricing'
import {
  buyDomain,
  getDomainAvailability,
  getDomainOrder,
  getDomainPrice,
  registrarConfigured,
  type RegistrantContact,
} from './registrar'
import { addSiteDomain } from './vercel-domains'

const DOMAIN_PURCHASE_KIND = 'domain_purchase'
const TABLE = 'space_domain_purchases'
const START_FAILED = 'Could not start checkout for this domain. Try again.'

function db(): SupabaseClient {
  return createAdminClient()
}

/** May a Space buy a domain right now? The operator switch with billing live, and the Vercel config. */
export async function domainPurchaseOpen(): Promise<boolean> {
  if (!registrarConfigured()) return false
  return domainPurchaseEnabled()
}

export type { DomainSearch }

/** Search one name: is it free, and what does a year cost the Space. Never throws. */
export async function searchDomain(domain: string): Promise<{ ok: true; data: DomainSearch } | { ok: false; error: string }> {
  const [availability, price, markupCents] = await Promise.all([
    getDomainAvailability(domain),
    getDomainPrice(domain),
    getDomainMarkupCents(),
  ])
  if (!availability.ok) {
    if (availability.error === 'invalid-domain' || availability.error === 'unsupported') {
      return { ok: true, data: { domain, available: false, reason: 'unsupported' } }
    }
    return { ok: false, error: 'Could not check that domain just now. Try again in a minute.' }
  }
  if (!availability.data.available) return { ok: true, data: { domain, available: false, reason: 'taken' } }
  if (!price.ok) {
    if (price.error === 'unsupported') return { ok: true, data: { domain, available: false, reason: 'unsupported' } }
    return { ok: false, error: 'Could not get a price for that domain just now. Try again in a minute.' }
  }
  return {
    ok: true,
    data: { domain, available: true, quote: quoteDomain(price.data.purchaseCents, markupCents, price.data.renewalCents) },
  }
}

interface DomainCheckoutResult {
  url?: string
  clientSecret?: string
  sessionId?: string
  error?: string
}

/**
 * Start the Space's checkout for `domain`. The price is RE-QUOTED here, never taken from the browser:
 * if it no longer matches the yearly price the owner was shown (`shownTotalCents`), nothing is charged
 * and the owner is asked to search again.
 *
 * authz-delegated: the caller (startDomainPurchaseCheckout in the Space's layout actions) has already
 * authorized the caller as an editor of `spaceId`, checked the custom_domain plan gate and that the
 * Space has no domain yet. Every write here is bound to that `spaceId`.
 */
export async function createDomainPurchaseCheckout(opts: {
  spaceId: string
  domain: string
  shownTotalCents: number
  contact: RegistrantContact
  ui?: CheckoutUi
}): Promise<DomainCheckoutResult> {
  if (!stripe || !(await domainPurchaseOpen())) return { error: 'Buying a domain is coming soon.' }
  const ui: CheckoutUi = opts.ui === 'elements' ? 'elements' : 'hosted'

  const search = await searchDomain(opts.domain)
  if (!search.ok) return { error: search.error }
  if (!search.data.available) return { error: 'That domain is not available. Search for another.' }
  const quote = search.data.quote
  if (quote.totalCents !== Math.round(opts.shownTotalCents)) {
    return { error: 'The price for this domain just changed. Search again to see the new price.' }
  }

  try {
    const { data: spaceData, error: spaceErr } = await db()
      .from('spaces')
      .select('id, slug, owner_profile_id, stripe_customer_id')
      .eq('id', opts.spaceId)
      .maybeSingle()
    // Fail closed on an unreadable row: guessing "no customer yet" would mint a second Stripe customer
    // for a Space that already has one (docs/CHECKOUT.md section 5).
    if (spaceErr || !spaceData) return { error: START_FAILED }
    const space = spaceData as { id: string; slug: string | null; owner_profile_id: string | null; stripe_customer_id: string | null }

    const purchaseId = randomUUID()
    const backHref = `${appUrl()}/spaces/${space.slug ?? space.id}/settings`
    const metadata: Record<string, string> = {
      kind: DOMAIN_PURCHASE_KIND,
      space_id: space.id,
      purchase_id: purchaseId,
      domain: opts.domain,
    }
    const receiptEmail = await receiptEmailFor(space.owner_profile_id)
    // The card is saved for the renewal: against the Space's customer when it has one, else Stripe mints
    // exactly one and the settle writes it back to the Space.
    const customerParams: Record<string, string> = space.stripe_customer_id
      ? { customer: space.stripe_customer_id }
      : { customer_creation: 'always', ...(receiptEmail ? { customer_email: receiptEmail } : {}) }

    const intent = { metadata, ...(receiptEmail ? { receipt_email: receiptEmail } : {}) }
    const client = stripe
    // `saveCard` asks Stripe to keep the card for the renewal. The stripe package has no types, so a
    // rejected saving parameter is a runtime failure: on one, retry without it. Drop the convenience,
    // never the sale (docs/CHECKOUT.md section 3).
    const createSession = (saveCard: boolean): Promise<Stripe.Checkout.Session> =>
      client.checkout.sessions.create({
        mode: 'payment',
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: 'usd',
              unit_amount: quote.totalCents,
              product_data: { name: `${opts.domain} (1 year)`, description: 'Domain registration for your website' },
            },
          },
        ],
        metadata,
        client_reference_id: space.id,
        ...(saveCard ? customerParams : space.stripe_customer_id ? { customer: space.stripe_customer_id } : {}),
        payment_intent_data: saveCard ? { ...intent, setup_future_usage: 'off_session' } : intent,
        ...checkoutReturnFields(ui, {
          successUrl: `${backHref}?domain=bought&session_id={CHECKOUT_SESSION_ID}`,
          cancelUrl: backHref,
        }),
      })
    let session: Stripe.Checkout.Session
    try {
      session = await createSession(true)
    } catch (err) {
      console.error('[domain-purchase] session with a saved card was refused; retrying without it', err instanceof Error ? err.message : '')
      session = await createSession(false)
    }

    const { error: insertErr } = await db()
      .from(TABLE)
      .insert({
        id: purchaseId,
        space_id: space.id,
        domain: opts.domain,
        years: 1,
        vercel_price_cents: quote.vercelCents,
        markup_cents: quote.markupCents,
        price_cents: quote.totalCents,
        renewal_price_cents: quote.renewalCents,
        currency: 'usd',
        status: 'pending',
        registrant: opts.contact,
        stripe_checkout_session_id: session.id,
        stripe_customer_id: space.stripe_customer_id,
      })
    if (insertErr) {
      // A payable session with no row behind it would take the money and buy nothing. Expire it.
      console.error('[domain-purchase] pending insert failed', insertErr.message)
      try {
        await stripe.checkout.sessions.expire(session.id)
      } catch {
        // It lapses on its own; the URL is refused either way.
      }
      return { error: START_FAILED }
    }

    const handed = resolveCheckoutSession(session, ui, 'domain-purchase')
    return handed.error ? { error: START_FAILED } : handed
  } catch (err) {
    console.error('[domain-purchase] checkout failed', err instanceof Error ? err.message : String(err))
    return { error: START_FAILED }
  }
}

interface ClaimedRow {
  id: string
  space_id: string
  domain: string
  vercel_price_cents: number
  years: number | null
  registrant: RegistrantContact | null
  stripe_customer_id: string | null
}

async function hasSavedPaymentMethod(customerId: string | null): Promise<boolean> {
  if (!stripe || !customerId) return false
  try {
    const list = await stripe.paymentMethods.list({ customer: customerId, limit: 1 })
    return Array.isArray(list?.data) && list.data.length > 0
  } catch {
    return false
  }
}

async function refund(paymentIntentId: string | null, purchaseId: string): Promise<boolean> {
  if (!stripe || !paymentIntentId) return false
  try {
    await stripe.refunds.create(
      { payment_intent: paymentIntentId, metadata: { domain_purchase_id: purchaseId } },
      { idempotencyKey: `domain-purchase-refund:${purchaseId}` },
    )
    return true
  } catch (err) {
    console.error('[domain-purchase] refund failed', { purchaseId, message: err instanceof Error ? err.message : '' })
    return false
  }
}

/** One year on from `from`, as an ISO string. */
export function renewalDate(from: Date, years = 1): string {
  const d = new Date(from.getTime())
  d.setUTCFullYear(d.getUTCFullYear() + Math.max(1, years))
  return d.toISOString()
}

/**
 * Settle a paid domain checkout: claim the row, buy the domain at Vercel, record the order and renewal
 * date, then attach the domain to the project and bind it to the Space. No-ops on a session that is not
 * a domain purchase, is not paid, or has already been claimed, so it is safe to run for every checkout
 * and on every redelivery. Returns the purchase status it left the row in, or null when it did nothing.
 */
export async function recordDomainPurchaseFromSession(session: Stripe.Checkout.Session): Promise<string | null> {
  if (session.metadata?.kind !== DOMAIN_PURCHASE_KIND) return null
  if (session.payment_status !== 'paid') return null
  const paymentIntentId =
    typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id ?? null
  const sessionCustomer = typeof session.customer === 'string' ? session.customer : session.customer?.id ?? null

  // THE CLAIM. One conditional update; only the delivery that flips `pending` gets a row back.
  const { data: claimed, error } = await db()
    .from(TABLE)
    .update({
      status: 'purchasing',
      paid_at: new Date().toISOString(),
      stripe_payment_intent_id: paymentIntentId,
      stripe_customer_id: sessionCustomer,
      updated_at: new Date().toISOString(),
    })
    .eq('stripe_checkout_session_id', session.id)
    .eq('status', 'pending')
    .select('id, space_id, domain, vercel_price_cents, years, registrant, stripe_customer_id')
  // A paid session the database refused to claim must not be acked: throwing makes Stripe redeliver.
  if (error) throw new Error(`[domain-purchase] claim failed (session=${session.id}): ${error.message}`)
  const row = ((claimed ?? []) as ClaimedRow[])[0]
  if (!row) return null

  const customerId = row.stripe_customer_id ?? sessionCustomer
  if (customerId) {
    // Fill the Space's customer only where it is empty, so a renewal charges the same customer.
    await db().from('spaces').update({ stripe_customer_id: customerId }).eq('id', row.space_id).is('stripe_customer_id', null)
  }

  const autoRenew = await hasSavedPaymentMethod(customerId)
  const bought = row.registrant
    ? await buyDomain(row.domain, { expectedPriceCents: row.vercel_price_cents, autoRenew, contact: row.registrant })
    : ({ ok: false, error: 'contact-invalid' } as const)

  if (!bought.ok) {
    const refunded = await refund(paymentIntentId, row.id)
    await db()
      .from(TABLE)
      .update({
        status: refunded ? 'refunded' : 'failed',
        failure_reason: bought.error,
        refunded_at: refunded ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', row.id)
    return refunded ? 'refunded' : 'failed'
  }

  // Registration is asynchronous at Vercel; one read tells us whether it already completed.
  const order = await getDomainOrder(bought.data.orderId)
  const status = order.ok && order.data.status === 'completed' ? 'registered' : 'ordered'
  const now = new Date()
  await db()
    .from(TABLE)
    .update({
      status,
      vercel_order_id: bought.data.orderId,
      auto_renew: autoRenew,
      purchased_at: now.toISOString(),
      renews_at: renewalDate(now, row.years ?? 1),
      // The registry holds the registrant now; Frequency keeps no copy it does not need.
      registrant: null,
      updated_at: now.toISOString(),
    })
    .eq('id', row.id)

  // The existing connect path: bind the Space's domain (only when it has none) and attach it to the
  // project. A failed attach is retried by the Domain section's Check again, which re-attaches.
  await db().from('spaces').update({ domain: row.domain }).eq('id', row.space_id).is('domain', null)
  await addSiteDomain(row.domain).catch(() => null)
  return status
}

/** Webhook-independent settle: fetch the session from Stripe and settle it. Mirrors the donation one. */
export async function recordDomainPurchaseFromSessionId(sessionId: string): Promise<string | null> {
  if (!stripe) return null
  let session: Stripe.Checkout.Session
  try {
    session = await stripe.checkout.sessions.retrieve(sessionId)
  } catch {
    return null
  }
  if (session.metadata?.kind !== DOMAIN_PURCHASE_KIND || session.payment_status !== 'paid') return null
  return recordDomainPurchaseFromSession(session)
}

/** Release a domain checkout that expired or whose delayed payment failed (pending -> abandoned only). */
export async function abandonDomainPurchaseFromSession(session: Stripe.Checkout.Session): Promise<void> {
  if (session.metadata?.kind !== DOMAIN_PURCHASE_KIND) return
  await db()
    .from(TABLE)
    .update({ status: 'abandoned', registrant: null, updated_at: new Date().toISOString() })
    .eq('stripe_checkout_session_id', session.id)
    .eq('status', 'pending')
}
