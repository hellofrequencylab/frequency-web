// Stripe checkout + billing-portal session creation (P2.2). Server-only. No-ops
// (return null) when billing isn't configured, so callers degrade gracefully.
//
// Works with JUST the Stripe connector (STRIPE_SECRET_KEY): if no explicit price id is
// set, checkout builds an inline subscription price, and `confirmCheckout` flips the
// member's tier on the success redirect — so the upgrade works even before a webhook
// is wired (the webhook then handles async events + cancellation).

import type Stripe from 'stripe'
import { stripe, priceFor, membershipAmount, appUrl } from './stripe'
import { createAdminClient } from '@/lib/supabase/admin'
import { recordFinancialTransaction, ENTITY_ID } from '@/lib/finance/record'
import type { EntitlementTier } from '@/lib/core/entitlement'
import { resolveStripePriceId } from './pricing-prices'
import { asMemberTierKey, memberCheckoutPriceKey, offersPeriod, type BillingPeriod } from './pricing-keys'

type PaidTier = Exclude<EntitlementTier, 'free'>

/** Resolve the Stripe price id for a member checkout, HONORING the founder lock (Pricing P2, ADR-363):
 *  a founding member with an explicit profiles.locked_price_id is charged at that exact price; else a
 *  founding member is charged at the synced FOUNDER variant; else the current PUBLIC synced price. Falls
 *  back to the env price id (priceFor) only when nothing is synced (pre-P2 compatibility). Returns null
 *  to signal "use the inline-price fallback" (no synced or env price at all). */
export async function resolveMemberPriceId(opts: {
  tier: PaidTier
  period: BillingPeriod
  isFoundingMember: boolean
  lockedPriceId: string | null
}): Promise<string | null> {
  // An explicit locked price always wins for a founding member (their grandfathered price object).
  if (opts.isFoundingMember && opts.lockedPriceId) return opts.lockedPriceId
  const base = asMemberTierKey(opts.tier)
  if (base && offersPeriod(base, opts.period)) {
    const key = memberCheckoutPriceKey({ base, period: opts.period, isFoundingMember: opts.isFoundingMember })
    const synced = await resolveStripePriceId(key)
    // A founder with no founder-variant synced falls back to the public synced price.
    const resolved = synced ?? (opts.isFoundingMember ? await resolveStripePriceId(`${base}_${opts.period}`) : null)
    if (resolved) return resolved
  }
  // Pre-P2 compatibility: the env-configured price id (lib/billing/stripe.ts).
  return priceFor(opts.tier)
}

/** Create a subscription Checkout session for a membership tier; returns the URL. Honors the founder
 *  lock (Pricing P2): a founding member is charged at their locked / founder price. */
export async function createMembershipCheckout(opts: {
  profileId: string
  email?: string | null
  tier: PaidTier
  period?: BillingPeriod
}): Promise<string | null> {
  if (!stripe) return null

  const period: BillingPeriod = opts.period ?? 'monthly'
  const { data: profile } = await createAdminClient()
    .from('profiles')
    .select('stripe_customer_id, is_founding_member, locked_price_id')
    .eq('id', opts.profileId)
    .maybeSingle()
  const profileRow = profile as
    | { stripe_customer_id?: string | null; is_founding_member?: boolean | null; locked_price_id?: string | null }
    | null

  const priceId = await resolveMemberPriceId({
    tier: opts.tier,
    period,
    isFoundingMember: profileRow?.is_founding_member === true,
    lockedPriceId: profileRow?.locked_price_id ?? null,
  })
  const lineItem: Stripe.Checkout.SessionCreateParams.LineItem = priceId
    ? { price: priceId, quantity: 1 }
    : {
        quantity: 1,
        price_data: {
          currency: 'usd',
          product_data: { name: opts.tier === 'supporter' ? 'Frequency Supporter' : 'Frequency Membership (Crew)' },
          unit_amount: membershipAmount(opts.tier),
          recurring: { interval: period === 'annual' ? 'year' : 'month' },
        },
      }

  const customer = profileRow?.stripe_customer_id ?? undefined

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [lineItem],
    ...(customer ? { customer } : { customer_email: opts.email ?? undefined }),
    client_reference_id: opts.profileId,
    metadata: { profile_id: opts.profileId, tier: opts.tier, billing_period: period },
    subscription_data: { metadata: { profile_id: opts.profileId, tier: opts.tier, billing_period: period } },
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

  const tier: EntitlementTier = session.metadata?.tier === 'supporter' ? 'supporter' : 'crew'
  const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id
  await createAdminClient()
    .from('profiles')
    .update({ membership_tier: tier, ...(customerId ? { stripe_customer_id: customerId } : {}) })
    .eq('id', profileId)
  return tier
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
