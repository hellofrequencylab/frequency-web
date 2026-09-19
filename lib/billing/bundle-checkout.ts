// HOUSEHOLD / CIRCLE BUNDLE CHECKOUT (ADR-370, REMAINING-WORK #6). A subscription Checkout for a member
// to buy the multi-seat bundle. The buyer becomes the bundle OWNER (payer); the seats themselves
// (profiles.household_bundle_id + the granted tier) are written by the webhook seating branch,
// lib/billing/bundle-seats.ts, once the subscription is active — exactly like the space-plan /
// space-membership reconcilers.
//
// 🔴 THIS FILE AND lib/billing/bundle-seats.ts SHIP TOGETHER, ALWAYS. A checkout with no seating branch
// takes real money and seats nobody. If either half is ever removed, remove both.
//
// GATED: returns null (a no-op) unless bundleSellable() (billingLive() AND bundle_household_enabled) —
// so nothing charges and no Stripe session is created while billing is OFF (the ABSOLUTE INVARIANT
// holds). Server-only. Mirrors lib/billing/space-plan-checkout.ts.
//
// THE TERMS ARE STAMPED, NOT LOOKED UP LATER. The seat count and the granted tier ride the session and
// subscription metadata, so the webhook seats what the buyer actually paid for even if an operator
// edits the bundle config the next day. Same reason the Space path stamps its plan.

import { stripe, appUrl } from './stripe'
import { createAdminClient } from '@/lib/supabase/admin'
import { bundleSellable, getHouseholdBundle } from '@/lib/pricing/settings'
import { householdBundlePriceKey } from '@/lib/pricing/bundle'
import { resolveStripePriceId } from './pricing-prices'
import { receiptEmailFor } from './receipt-address'
import { checkoutGaMetadata } from '@/lib/analytics/ga-client-id'
import { BUNDLE_KIND, BUNDLE_SEAT_IDS_KEY, bundleRoster, reconcileBundleSubscription } from './bundle-seats'
import { checkoutReturnFields, resolveCheckoutSession, type CheckoutUi } from './checkout-ui'
import type { BillingPeriod } from './pricing-keys'

/** Stripe caps a metadata VALUE at 500 characters. A uuid plus its separator is 37, so this ceiling is
 *  reached at 13 co-seats — far beyond any household — but it is enforced rather than trusted, because
 *  the failure mode is a truncated roster: money taken for seats the webhook can never read back. */
const METADATA_VALUE_MAX = 500

export interface BundleCheckoutResult {
  url?: string
  /** An on-page (elements) session's secret. EXACTLY ONE of this and `url` is ever set. */
  clientSecret?: string
  /** The session id, so the control can settle from its success handler rather than waiting on the
   *  webhook. Handed back for BOTH shapes. */
  sessionId?: string
}

/** Create a subscription Checkout session for a member to buy the Household / Circle bundle; returns
 *  a hosted URL, an on-page client secret, or null when the bundle isn't sellable / not synced to
 *  Stripe / the requested seats don't fit. GATED on bundleSellable.
 *
 *  `seatProfileIds` are the OTHER members this bundle seats (the buyer is always seated and never needs
 *  to be listed). They are stamped into the metadata so the webhook seats exactly them; passing none is
 *  valid and seats the buyer alone, leaving the rest of the bundle's seats open.
 *
 *  DEFAULT-DENY on the seat list: an id that is not a real profile, or one seat too many for the bundle
 *  the operator configured, refuses the whole checkout rather than quietly charging for a seat that
 *  would never be filled.
 *
 *  authz-delegated: a caller-trusted member action authorizes the buyer; this binds the customer to
 *  THIS profile and stamps the bundle metadata so the webhook seats the bundle correctly. */
export async function createBundleCheckout(opts: {
  profileId: string
  email?: string | null
  period?: BillingPeriod
  seatProfileIds?: readonly string[]
  ui?: CheckoutUi
}): Promise<BundleCheckoutResult | null> {
  if (!stripe) return null
  // Defaults to hosted, which is what makes this rollout safe surface by surface: every caller that
  // does not ask for the on-page form keeps today's redirect exactly (docs/CHECKOUT.md §2).
  const ui: CheckoutUi = opts.ui === 'elements' ? 'elements' : 'hosted'
  const period: BillingPeriod = opts.period ?? 'monthly'
  if (!(await bundleSellable())) return null

  // Resolve the synced Price for the bundle at this period (no inline fallback — a bundle must be synced).
  const priceId = await resolveStripePriceId(householdBundlePriceKey(period))
  if (!priceId) return null

  const config = await getHouseholdBundle()
  const requested = (opts.seatProfileIds ?? []).filter((id) => id && id !== opts.profileId)
  // The buyer occupies a seat, so the co-seats have to fit in what is left.
  if (requested.length + 1 > config.seats) return null

  const db = createAdminClient()
  // DIRECTION — FAIL CLOSED (SCAN-539), matching the seat-roster read below, which already returns null
  // on `error`. A PostgREST error arrives in `error`, not as a throw, so an unchecked read reads exactly
  // like "this buyer has no customer yet" and makes Stripe mint a DUPLICATE customer, splitting the
  // payer's bundle subscription off from the rest of their billing for good. Refusing costs one
  // retryable checkout; a buyer with genuinely no customer row still proceeds on customer_email.
  const { data: profile, error: profileErr } = await db
    .from('profiles')
    .select('stripe_customer_id')
    .eq('id', opts.profileId)
    .maybeSingle()
  if (profileErr) {
    console.error('[bundle-checkout] stripe_customer_id unreadable, refusing checkout:', profileErr.message)
    return null
  }
  const customer = (profile as { stripe_customer_id?: string | null } | null)?.stripe_customer_id ?? undefined

  // Every co-seat must be a real profile before any money moves: the seating RPC drops ids it cannot
  // find, so an unchecked typo here becomes a bundle that silently seats fewer people than it charged for.
  let seatIds: string[] = []
  if (requested.length > 0) {
    const { data: seatRows, error } = await db.from('profiles').select('id').in('id', requested as string[])
    if (error) return null
    const found = new Set((seatRows ?? []).map((r) => (r as { id: string }).id))
    if (requested.some((id) => !found.has(id))) return null
    seatIds = bundleRoster(opts.profileId, requested, config.seats).slice(1)
  }
  const seatList = seatIds.join(',')
  if (seatList.length > METADATA_VALUE_MAX) return null

  const metadata: Record<string, string> = {
    kind: BUNDLE_KIND,
    owner_id: opts.profileId,
    billing_period: period,
    // The TERMS this bundle was bought on. The webhook prefers these over the live config.
    bundle_seats: String(config.seats),
    bundle_tier: config.tier,
    ...(seatList ? { [BUNDLE_SEAT_IDS_KEY]: seatList } : {}),
  }
  // STRIPE'S OWN RECEIPT, AS A BACKSTOP (LIVE-344). A subscription takes no `receipt_email` (it is a
  // payment-intent parameter), so the CUSTOMER's address is the equivalent: it is where every invoice
  // receipt goes. The caller's `email` is whatever the surface happened to hold, so fall back to the
  // buyer's proven account address rather than minting a customer Stripe can never write to.
  const receiptEmail = opts.email ?? (await receiptEmailFor(opts.profileId))
  Object.assign(metadata, await checkoutGaMetadata())
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    ...(customer ? { customer } : { customer_email: receiptEmail ?? undefined }),
    client_reference_id: opts.profileId,
    metadata,
    // The SUBSCRIPTION carries the same metadata, because seating runs off the subscription events
    // (created / updated / deleted), never off the session.
    subscription_data: { metadata },
    // Hosted takes success_url + cancel_url; an elements session REJECTS both and takes a single
    // return_url. Hand-writing either pair fails at RUNTIME, in a money path, because the stripe
    // package ships no type declarations (docs/CHECKOUT.md §3).
    ...checkoutReturnFields(ui, {
      successUrl: `${appUrl()}/settings/billing?bundle=1&session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${appUrl()}/upgrade`,
    }),
    allow_promotion_codes: true,
  })
  // 🔴 TRAP 1 (docs/CHECKOUT.md §3): `!session.url` is TRUE FOR EVERY ELEMENTS SESSION. Ask the
  // resolver, never the URL.
  const handed = resolveCheckoutSession(session, ui, 'household_bundle')
  if (handed.error) return null
  return { url: handed.url, clientSecret: handed.clientSecret, sessionId: session.id }
}

/**
 * THE SETTLE'S RECORDER (docs/CHECKOUT.md §3). Seat the household from an on-page checkout session
 * id, in the buyer's own tab, rather than waiting on the webhook.
 *
 * 🔴 IT REUSES THE WEBHOOK'S OWN RECONCILER. `reconcileBundleSubscription` is the function the
 * webhook calls. A second implementation here is how the two paths come to disagree about who a
 * paid bundle seats.
 */
export async function recordBundleFromSessionId(sessionId: string): Promise<boolean> {
  if (!stripe) return false
  if (!sessionId.startsWith('cs_')) return false

  const session = await stripe.checkout.sessions.retrieve(sessionId, { expand: ['subscription'] })
  if (session.metadata?.kind !== BUNDLE_KIND) return false
  if (session.status !== 'complete') return false
  // A trial-free bundle is `paid`. `no_payment_required` is the trial shape other subscription
  // creators use; refuse nothing Stripe already marked complete.
  if (session.payment_status !== 'paid' && session.payment_status !== 'no_payment_required') return false

  const sub = session.subscription
  if (!sub || typeof sub === 'string') return false

  const result = await reconcileBundleSubscription(sub, session.created)
  return result.handled === true
}
