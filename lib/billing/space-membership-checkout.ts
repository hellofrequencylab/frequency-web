// SPACE MEMBERSHIP CHECKOUT (Pricing P2, ADR-363). A subscription Checkout for a MEMBER joining a
// PAID space membership tier (space_membership_tiers). Money moves as a Stripe Connect destination
// charge: the platform keeps an application fee = the take-rate SET BY THE SPACE'S PLAN (8/5/3% per
// pricing_settings), the rest transfers to the SPACE OWNER's connected account. The webhook upserts
// space_memberships.stripe_subscription_id + payment_status once active.
//
// TWO CADENCES, ONE TIER (ADR-1374): the caller passes the cadence the member picked. 'month' bills
// price_cents, 'year' bills annual_price_cents on a yearly subscription, and a yearly request on a
// tier that has no yearly price is REFUSED ('no_annual_price') rather than quietly billed monthly.
// The take-rate math and the billingLive() gate are unchanged: they read the resolved amount.
//
// GATED: returns null (a no-op) unless billingLive() — so v1 display-only "join" behavior is unchanged
// and no Stripe session is created while billing is OFF (the P1 invariant holds). The space owner must
// also have a Connect account that is payout-ready (mirrors tips/tickets). Server-only.

import { stripe, appUrl } from './stripe'
import { createAdminClient } from '@/lib/supabase/admin'
import { billingLive } from '@/lib/pricing/settings'
import { asSpacePlan } from '@/lib/pricing/plans'
import { getConnectStatus } from './connect'
import { spaceTakeRateCents } from './fees'
import { classifyOrderSource } from '@/lib/commerce/order-source'
import { effectiveOrderSource } from '@/lib/pricing/network-world'
import { receiptEmailFor } from './receipt-address'
import { checkoutReturnFields, resolveCheckoutSession, type CheckoutUi } from './checkout-ui'
import { checkoutGaMetadata } from '@/lib/analytics/ga-client-id'
import { routeSpaceSubscription } from './space-subscriptions'
import type { BillingInterval } from '@/lib/spaces/membership-pricing'

export interface SpaceMembershipCheckoutResult {
  url?: string
  /** An on-page (elements) session's secret. EXACTLY ONE of this and `url` is ever set: an elements
   *  session has no url, and a hosted one has no secret. Branch on what came back, never on what was
   *  asked for (docs/CHECKOUT.md §3). */
  clientSecret?: string
  /** The session id, so the control can settle from its success handler rather than waiting on the
   *  webhook. Handed back for BOTH shapes. */
  sessionId?: string
  /** Why no URL (when checkout didn't start). 'billing_off' | 'not_payable' | 'no_owner_payouts' |
   *  'tier_not_found' | 'free_tier' | 'no_annual_price' | 'error'. */
  reason?:
    | 'billing_off'
    | 'not_payable'
    | 'no_owner_payouts'
    | 'tier_not_found'
    | 'free_tier'
    | 'no_annual_price'
    | 'error'
}

/** Create a subscription Checkout for a member joining a paid space tier. Connect destination charge:
 *  the application fee is the SPACE plan's take-rate; the rest transfers to the space owner. Returns a
 *  URL, or a reason when it no-ops. GATED on billingLive().
 *
 *  authz-delegated: the caller-trusted join action authorizes the member; this binds the charge to the
 *  resolved tier + the space OWNER's Connect account and stamps space_id/tier_id/member_id in metadata
 *  so the webhook reconciles to the right membership row. */
export async function createSpaceMembershipCheckout(
  spaceId: string,
  tierId: string,
  memberId: string,
  selected: BillingInterval = 'month',
  opts: { ui?: CheckoutUi } = {},
): Promise<SpaceMembershipCheckoutResult> {
  if (!stripe) return { reason: 'billing_off' }
  if (!(await billingLive())) return { reason: 'billing_off' }

  // Defaults to hosted, which is what makes this rollout safe surface by surface: every caller that
  // does not ask for the on-page form keeps today's redirect exactly (docs/CHECKOUT.md §2).
  const ui: CheckoutUi = opts.ui === 'elements' ? 'elements' : 'hosted'

  try {
    const db = createAdminClient()

    // Resolve the space (its plan drives the take-rate) and its owner (the payout recipient).
    const { data: space } = (await db
      .from('spaces')
      .select('id, owner_profile_id, plan, slug, network_connected')
      .eq('id', spaceId)
      .maybeSingle()) as {
      data: {
        id?: string
        owner_profile_id?: string | null
        plan?: string | null
        slug?: string | null
        network_connected?: boolean | null
      } | null
    }
    if (!space?.id || !space.owner_profile_id) return { reason: 'tier_not_found' }

    // The owner must be able to receive money (Connect ready), like tips/tickets.
    const ownerStatus = await getConnectStatus(space.owner_profile_id)
    if (!ownerStatus.accountId || !ownerStatus.ready) return { reason: 'no_owner_payouts' }

    // Resolve the tier the member is joining (its price drives the charge). annual_price_cents is
    // newer than the generated DB types (ADR-246 seam; migration 20270345005000 applies at merge),
    // so the row is narrowed here rather than read off the generated Row type.
    const { data: tier } = (await db
      .from('space_membership_tiers')
      .select('id, name, price_cents, annual_price_cents, interval, is_active')
      .eq('id', tierId)
      .eq('space_id', spaceId)
      .maybeSingle()) as {
      data: {
        id?: string
        name?: string | null
        price_cents?: number | null
        annual_price_cents?: number | null
        interval?: string | null
        is_active?: boolean | null
      } | null
    }
    if (!tier?.id || tier.is_active === false) return { reason: 'tier_not_found' }

    // WHICH CADENCE IS BEING BOUGHT (ADR-1374). A yearly request bills annual_price_cents on a
    // yearly Stripe interval. It FAILS CLOSED when the tier has no yearly price: billing the
    // monthly amount because the yearly one is missing would charge a member a twelfth of what the
    // card said, on a subscription they believe is annual. The monthly request is byte-for-byte the
    // old behavior, including a tier published before this column whose own `interval` is 'year'.
    const monthlyAmount = Math.round(tier.price_cents ?? 0)
    const annualAmount = Math.round(tier.annual_price_cents ?? 0)
    const wantsYear = selected === 'year'
    if (wantsYear && !(Number.isFinite(annualAmount) && annualAmount > 0)) {
      return { reason: 'no_annual_price' }
    }
    const amount = wantsYear ? annualAmount : monthlyAmount
    if (!Number.isFinite(amount) || amount <= 0) return { reason: 'free_tier' } // a $0 tier takes no charge (v1 join path)

    // Differential take-rate (ADR-811 §A): a membership the space brings itself is 0% (the hard promise);
    // one the collective sourced (referral / discovery) pays the space plan's NETWORK rate. Fail-safe:
    // ambiguity classifies as self, so we never bill a network rate on an own booking.
    const { source } = await classifyOrderSource({
      buyerProfileId: memberId,
      sellerProfileId: space.owner_profile_id,
      sellerSpaceId: space.id, // enables the relationship check (ADR-913)
    })
    // A standalone (disconnected) Space has left the graph → no network-sourced revenue (ADR-811 §3), so
    // the source collapses to self and the fee is 0 regardless of any referral signal.
    const effective = effectiveOrderSource(source, space.network_connected)
    const fee = await spaceTakeRateCents(amount, asSpacePlan(space.plan), effective) // self → 0, network → tier bps
    const interval: 'month' | 'year' = wantsYear ? 'year' : tier.interval === 'year' ? 'year' : 'month'

    // The cadence rides in the metadata so the webhook's membership row can record it even if the
    // subscription is read before its items are expanded (lib/billing/space-subscriptions.ts).
    const metadata = {
      kind: 'space_membership',
      space_id: spaceId,
      tier_id: tierId,
      member_id: memberId,
      billing_interval: interval,
      ...(await checkoutGaMetadata()),
    }
    // STRIPE'S OWN RECEIPT, AS A BACKSTOP (LIVE-344). `receipt_email` is a payment-intent parameter
    // and Stripe rejects it in `mode: 'subscription'`, so on a subscription the equivalent is the
    // CUSTOMER's address: it is what every invoice receipt is sent to. This session set NEITHER a
    // customer nor a customer_email, so a member who started paying monthly here was unreachable by
    // Stripe as well as by us. See ./receipt-address.ts for the whole rule.
    const receiptEmail = await receiptEmailFor(memberId)
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'usd',
            unit_amount: amount,
            recurring: { interval },
            product_data: { name: `${tier.name ?? 'Membership'} (Space membership)` },
          },
        },
      ],
      // Connect destination charge on the subscription: fee stays with the platform, the rest
      // transfers to the space owner's connected account on every invoice.
      subscription_data: {
        // `amount > 0` is guaranteed by the free_tier guard above, so divide directly.
        application_fee_percent: round2((fee / amount) * 100),
        transfer_data: { destination: ownerStatus.accountId },
        metadata,
      },
      ...(receiptEmail ? { customer_email: receiptEmail } : {}),
      client_reference_id: memberId,
      metadata,
      // Hosted takes success_url + cancel_url; an elements session REJECTS both and takes a single
      // return_url. Hand-writing either pair fails at RUNTIME, in a money path, because the stripe
      // package ships no type declarations (docs/CHECKOUT.md §3).
      ...checkoutReturnFields(ui, {
        successUrl: `${appUrl()}/spaces/${space.slug ?? spaceId}?membership=joined&session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: `${appUrl()}/spaces/${space.slug ?? spaceId}`,
      }),
    })

    // 🔴 TRAP 1 (docs/CHECKOUT.md §3), and it was live in this file: `!session.url` is TRUE FOR
    // EVERY ELEMENTS SESSION, so the guard that used to sit here would have failed every on-page
    // join while type-checking perfectly. Ask the resolver, never the URL. The resolver also owns
    // the degrade: an elements request Stripe will not honour comes back as the hosted URL rather
    // than an error, so the buyer always has a way to pay.
    const handed = resolveCheckoutSession(session, ui, 'space_membership')
    if (handed.error) return { reason: 'error' }
    return { url: handed.url, clientSecret: handed.clientSecret, sessionId: session.id }
  } catch {
    return { reason: 'error' }
  }
}

/**
 * THE SETTLE'S RECORDER (docs/CHECKOUT.md §3). Grant entitlement for an on-page membership join from
 * its checkout session id, in the buyer's own tab, rather than waiting on the webhook.
 *
 * WHY THIS EXISTS AT ALL. `confirm({ redirect: 'if_required' })` is what keeps the buyer on the page,
 * and it means the common card path NEVER navigates. So the session's `return_url` -- written as the
 * webhook's backstop -- is visited only on a redirect (3DS, a bank app). Without this, an on-page
 * join has exactly ONE way to become real, behind a confirmation panel that already promised it.
 *
 * WHY IT NEEDS NO SESSION GATE. It re-fetches the session FROM STRIPE and refuses anything that is
 * not `metadata.kind === 'space_membership'` and not actually paid. The most a caller can do with
 * someone else's id is grant a membership that genuinely happened, which is exactly what the webhook
 * does unprompted seconds later. Stripe is the authority, not the caller.
 *
 * 🔴 IT REUSES THE WEBHOOK'S OWN RECONCILER, deliberately. `routeSpaceSubscription` is the function
 * the webhook calls, it dispatches on the same metadata this session stamped, and it documents
 * itself as idempotent. A second implementation here is how the two paths come to disagree about
 * what a paid membership means.
 */
export async function recordMembershipFromSessionId(sessionId: string): Promise<boolean> {
  if (!stripe) return false
  if (!sessionId.startsWith('cs_')) return false

  // Expanding the subscription costs one call and saves a second round trip; the reconciler wants
  // the subscription OBJECT, because that is where subscription_data.metadata lives.
  const session = await stripe.checkout.sessions.retrieve(sessionId, { expand: ['subscription'] })

  if (session.metadata?.kind !== 'space_membership') return false
  // A subscription session reads `complete` once its first invoice is paid; `payment_status` is
  // checked too rather than instead, because an unpaid session can reach `complete` on a trial and
  // this path must never grant on one.
  if (session.status !== 'complete') return false
  if (session.payment_status !== 'paid') return false

  const sub = session.subscription
  if (!sub || typeof sub === 'string') return false

  await routeSpaceSubscription(sub)
  return true
}

/** Round to 2 dp (Stripe's application_fee_percent precision). Pure. */
function round2(n: number): number {
  return Math.round(n * 100) / 100
}
