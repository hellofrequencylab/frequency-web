// Stripe checkout + billing-portal session creation (P2.2). Server-only. No-ops
// (return null) when billing isn't configured, so callers degrade gracefully.
//
// Works with JUST the Stripe connector (STRIPE_SECRET_KEY): if no explicit price id is
// set, checkout builds an inline subscription price, and `confirmCheckout` flips the
// member's tier on the success redirect — so the upgrade works even before a webhook
// is wired (the webhook then handles async events + cancellation).

import type Stripe from 'stripe'
import { stripe, appUrl } from './stripe'
import { createAdminClient } from '@/lib/supabase/admin'
import { recordFinancialTransaction, ENTITY_ID } from '@/lib/finance/record'
import type { EntitlementTier } from '@/lib/core/entitlement'
import type { BillingPeriod } from './pricing-keys'

/** The member tier a checkout may be opened for. Crew, and only Crew: the sellable member ladder is
 *  Member (free) and Crew (ADR-878). Narrowing this here is what makes a Supporter purchase
 *  unrepresentable rather than merely unreachable. */
type PaidTier = 'crew'

/** Create a subscription Checkout session for Crew; returns the URL.
 *
 *  🔴 CREW IS PAY WHAT YOU WANT, so `amountCents` is REQUIRED. The session always bills an INLINE
 *  recurring price at exactly the amount the member picked. There is no catalog price to resolve, no
 *  founder variant, and no grandfathered `locked_price_id` lookup, because all three are answers to
 *  "what is the price of Crew" and Crew has no price: the member sets it and can change it.
 *
 *  THE FOUNDER LOCK IS GONE FROM THIS PATH ON PURPOSE (owner directive, 2026-07-30: "forget the founding
 *  member purchase path"). It used to run first, so a profile carrying `locked_price_id` would have been
 *  charged that old fixed price and the amount they had just chosen on the picker would have been
 *  silently discarded. Making the amount required rather than optional is what makes that unrepresentable
 *  instead of merely unreached: there is no longer a code path through this function that charges a
 *  member anything other than what they picked.
 *
 *  The amount MUST already be validated against the operator PWYW floor by the caller
 *  (lib/pricing/catalog-config.ts isValidPwywAmount); this function refuses a non-positive amount but is
 *  not the policy seam. ANNUAL is 10x the chosen monthly (two months free, the house convention), which
 *  the caller computes so the member sees the annual figure before they commit to it. */
export async function createMembershipCheckout(opts: {
  profileId: string
  email?: string | null
  tier: PaidTier
  period?: BillingPeriod
  /** The member's chosen PWYW amount in cents (already validated against the operator floor). */
  amountCents: number
}): Promise<string | null> {
  if (!stripe) return null

  const period: BillingPeriod = opts.period ?? 'monthly'
  const chosen =
    Number.isFinite(opts.amountCents) && opts.amountCents > 0 ? Math.round(opts.amountCents) : null
  // Default-deny: an unusable amount is a caller bug, and minting a session at some fallback price is
  // exactly the "charged a number they never chose" failure this path exists to prevent.
  if (chosen === null) return null

  const { data: profile } = await createAdminClient()
    .from('profiles')
    .select('stripe_customer_id')
    .eq('id', opts.profileId)
    .maybeSingle()
  const profileRow = profile as { stripe_customer_id?: string | null } | null

  // The stable Crew Product, so the ad-hoc PWYW prices every checkout mints roll up under ONE product
  // in Stripe instead of littering the dashboard with a product per subscriber. Falls back to inline
  // product_data when it is unset, which keeps a bare-connector install working.
  const crewProductId = process.env.STRIPE_PRODUCT_CREW || null
  const lineItem: Stripe.Checkout.SessionCreateParams.LineItem = {
    quantity: 1,
    price_data: {
      currency: 'usd',
      ...(crewProductId
        ? { product: crewProductId }
        : { product_data: { name: 'Frequency Membership (Crew)' } }),
      unit_amount: chosen,
      recurring: { interval: period === 'annual' ? 'year' : 'month' },
    },
  }

  const customer = profileRow?.stripe_customer_id ?? undefined

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [lineItem],
    ...(customer ? { customer } : { customer_email: opts.email ?? undefined }),
    client_reference_id: opts.profileId,
    // The chosen amount rides the metadata so the success redirect + the webhook can resolve the
    // Supporter mark from what the member actually picked, without re-reading the Stripe price.
    metadata: {
      profile_id: opts.profileId,
      tier: opts.tier,
      billing_period: period,
      pwyw_amount_cents: String(chosen),
    },
    subscription_data: {
      metadata: {
        profile_id: opts.profileId,
        tier: opts.tier,
        billing_period: period,
        pwyw_amount_cents: String(chosen),
      },
    },
    success_url: `${appUrl()}/settings/billing?upgraded=1&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl()}/upgrade`,
    allow_promotion_codes: true,
  })
  return session.url
}

/**
 * Confirm a completed checkout on the success redirect and flip the member's tier
 * (a webhook-independent fallback). Verifies the session is paid AND belongs to this
 * profile before writing. Returns the new tier, or null if not applicable.
 */
export async function confirmCheckout(sessionId: string, profileId: string): Promise<EntitlementTier | null> {
  if (!stripe) return null
  let session: Stripe.Checkout.Session
  try {
    session = await stripe.checkout.sessions.retrieve(sessionId)
  } catch {
    return null
  }
  if (session.payment_status !== 'paid') return null
  if ((session.metadata?.profile_id ?? session.client_reference_id) !== profileId) return null

  // Only a member Crew/Supporter subscription grants a membership tier here. A one-time
  // Founders payment (mode:'payment', kind:'founders') and Space subscriptions
  // (kind:'space_plan'/'space_membership') are ALSO 'paid' sessions for this profile —
  // without this guard, opening /settings/billing?session_id=<founders session> would
  // flip the member to Crew for a one-time payment. Mirrors the webhook's routing.
  if (session.mode !== 'subscription' || session.metadata?.kind) return null

  // READ TOLERANCE, not a sell path. Nothing opens a Supporter checkout any more (ADR-878), but a
  // session minted before this change could still land here: honor it as 'crew' + the is_supporter
  // PWYW badge, never 'supporter' (which the membership_tier CHECK rejects). Access-preserving, the
  // same direction as the `supporter -> crew` read mapping in lib/core/entitlement.ts (ADR-458).
  //
  // PWYW: a member who chose at or above the suggested amount also earns the Supporter mark. The mark is
  // RECOGNITION ONLY — every Crew amount buys identical access — so a failure to resolve it must never
  // block the upgrade, hence the best-effort try/catch that degrades to "no mark".
  let isSupporter = session.metadata?.tier === 'supporter'
  const pwywAmount = Number(session.metadata?.pwyw_amount_cents)
  if (!isSupporter && Number.isFinite(pwywAmount) && pwywAmount > 0) {
    try {
      const { loadCatalogConfig, earnsSupporterMark } = await import('@/lib/pricing/catalog-config')
      isSupporter = earnsSupporterMark(pwywAmount, (await loadCatalogConfig()).pwyw)
    } catch {
      isSupporter = false
    }
  }
  const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id
  const { error } = await createAdminClient()
    .from('profiles')
    .update({
      membership_tier: 'crew',
      ...(isSupporter ? { is_supporter: true } : {}),
      ...(customerId ? { stripe_customer_id: customerId } : {}),
    })
    .eq('id', profileId)
  // Surface a failed entitlement write instead of returning a false "upgraded" banner.
  if (error) throw new Error(`confirmCheckout(${profileId}) failed: ${error.message}`)
  return 'crew'
}

/**
 * Record a paid membership invoice as Foundation DUES on the entity-partitioned ledger
 * (ADR-037/246). Driven by the `invoice.paid` webhook, so it captures the first payment
 * AND every renewal. Idempotent per invoice. Membership is a direct platform subscription
 * (not a Connect charge), so the full amount is the Foundation's revenue.
 *
 * The dues-vs-donation split above the membership floor is an open legal decision
 * (ADR-037); the whole amount is recorded as 'dues' until counsel sets that line.
 */
export async function recordMembershipDuesFromInvoice(invoice: Stripe.Invoice): Promise<void> {
  const amount = invoice.amount_paid ?? 0
  if (amount <= 0) return
  // Memberships are the only subscriptions; a non-subscription invoice isn't dues.
  // Stripe 22 carries the subscription (and a snapshot of its metadata) under
  // invoice.parent.subscription_details — so profile_id is on the invoice, no retrieve.
  const subDetails = invoice.parent?.subscription_details
  if (!subDetails) return

  // Space plan / Space membership invoices are NOT personal Foundation membership dues — those
  // subscriptions are reconciled by lib/billing/space-subscriptions.ts and their revenue is booked
  // elsewhere (a Connect/space charge, not Foundation dues at full gross). Booking them here would
  // double-count them as Foundation dues, so skip anything carrying a Space kind (ADR-363/246).
  const kind = subDetails.metadata?.kind
  if (kind === 'space_plan' || kind === 'space_membership') return

  // Resolve the member: the subscription metadata snapshot (authoritative), else by customer.
  let profileId: string | null = (subDetails.metadata?.profile_id as string | undefined) ?? null
  if (!profileId) {
    const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id ?? null
    if (customerId) {
      const { data } = await createAdminClient()
        .from('profiles')
        .select('id')
        .eq('stripe_customer_id', customerId)
        .maybeSingle()
      profileId = (data as { id: string } | null)?.id ?? null
    }
  }

  await recordFinancialTransaction({
    entityId: ENTITY_ID.foundation,
    revenueType: 'dues',
    amountCents: amount,
    profileId,
    currency: invoice.currency ?? 'usd',
    sourceTable: 'memberships',
    sourceId: invoice.id ?? null,
    idempotencyKey: invoice.id ? `invoice:${invoice.id}` : undefined,
  })
}

/** Open the Stripe billing portal for a member to manage/cancel; returns the URL. */
export async function createBillingPortal(profileId: string): Promise<string | null> {
  if (!stripe) return null
  const { data: profile } = await createAdminClient()
    .from('profiles')
    .select('stripe_customer_id')
    .eq('id', profileId)
    .maybeSingle()
  if (!profile?.stripe_customer_id) return null

  const session = await stripe.billingPortal.sessions.create({
    customer: profile.stripe_customer_id,
    return_url: `${appUrl()}/settings/billing`,
  })
  return session.url
}
