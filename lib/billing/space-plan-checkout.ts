// SPACE PLAN CHECKOUT (Pricing P2, ADR-363). A subscription Checkout for a Space OWNER to buy a plan
// (practitioner/business/organization/white-label). The customer is the space owner; the resolved
// Stripe Price comes from pricing_stripe_prices (the synced public price for the plan+period). The
// webhook reconciles the subscription back to setSpacePlan(space_id, plan) once it is active.
//
// GATED: returns null (a no-op) unless billingLive() AND the per-plan `*_enabled` switch is on — so
// nothing charges and no Stripe session is created while billing is OFF (the P1 invariant holds).
// Server-only. Mirrors the existing member checkout (lib/billing/checkout.ts) shape.

import { stripe, appUrl } from './stripe'
import { createAdminClient } from '@/lib/supabase/admin'
import { billingLive, getPricingValues, loadPricingFlags } from '@/lib/pricing/settings'
import { type SpacePlan } from '@/lib/pricing/plans'
import { resolveStripePriceId } from './pricing-prices'
import { asSpacePlanKey, offersPeriod, priceKey, type BillingPeriod, type SpacePlanKey } from './pricing-keys'

/** The per-plan enable flag for a space plan (must be ON, with billing live, to sell it). */
const PLAN_FLAG: Record<SpacePlanKey, 'plan_practitioner_enabled' | 'plan_business_enabled' | 'plan_nonprofit_enabled' | 'plan_organization_enabled' | 'plan_whitelabel_enabled'> = {
  practitioner: 'plan_practitioner_enabled',
  business: 'plan_business_enabled',
  nonprofit: 'plan_nonprofit_enabled',
  organization: 'plan_organization_enabled',
  whitelabel: 'plan_whitelabel_enabled',
}

/** Is this plan sellable right now? billingLive() AND the per-plan switch. GATED. */
export async function spacePlanSellable(plan: SpacePlan | string): Promise<boolean> {
  const key = asSpacePlanKey(plan)
  if (!key) return false
  if (!(await billingLive())) return false
  const flags = await loadPricingFlags()
  return flags[PLAN_FLAG[key]] === true
}

/** Create a subscription Checkout session for a Space owner to buy a plan; returns the URL, or null
 *  when the plan isn't sellable / not synced / the space has no owner. GATED on spacePlanSellable.
 *  authz-delegated: caller-trusted operator/owner action authorizes the space; this binds the customer
 *  to the resolved space OWNER and stamps the space_id in metadata so the webhook reconciles correctly. */
export async function createSpacePlanCheckout(
  spaceId: string,
  plan: SpacePlan | string,
  billingPeriod: BillingPeriod = 'monthly',
): Promise<string | null> {
  if (!stripe) return null
  const planKey = asSpacePlanKey(plan)
  if (!planKey) return null
  if (!offersPeriod(planKey, billingPeriod)) return null // e.g. no annual for organization/whitelabel
  if (!(await spacePlanSellable(planKey))) return null

  // Resolve the synced public Price for this plan+period.
  const priceId = await resolveStripePriceId(priceKey(planKey, billingPeriod))
  if (!priceId) return null // not synced to Stripe yet → no-op (never an inline-price fallback for plans)

  // The customer is the Space owner; reuse their Stripe customer id if the space already has one.
  const db = createAdminClient()
  const { data: space } = (await db
    .from('spaces')
    .select('id, owner_profile_id, slug, stripe_customer_id')
    .eq('id', spaceId)
    .maybeSingle()) as {
    data: { id?: string; owner_profile_id?: string | null; slug?: string | null; stripe_customer_id?: string | null } | null
  }
  if (!space?.id || !space.owner_profile_id) return null

  let customer = space.stripe_customer_id ?? undefined
  let ownerEmail: string | undefined
  if (!customer) {
    const { data: owner } = await db
      .from('profiles')
      .select('email, stripe_customer_id')
      .eq('id', space.owner_profile_id)
      .maybeSingle()
    const ownerRow = owner as { email?: string | null; stripe_customer_id?: string | null } | null
    customer = ownerRow?.stripe_customer_id ?? undefined
    ownerEmail = ownerRow?.email ?? undefined
  }

  const metadata = { kind: 'space_plan', space_id: spaceId, plan: planKey, billing_period: billingPeriod }
  // Free trial on Space plans (card upfront; days are operator-editable via pricing settings, default 14).
  // Stripe starts the subscription in `trialing`, which the reconciler treats as active
  // (lib/billing/space-subscriptions.ts), so the plan is granted during the trial and auto-converts when
  // it ends. Members have no trial (their checkout never reads this).
  const trialDays = (await getPricingValues()).trial.days
  const subscriptionData: { metadata: typeof metadata; trial_period_days?: number } =
    trialDays > 0 ? { metadata, trial_period_days: trialDays } : { metadata }
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    ...(customer ? { customer } : { customer_email: ownerEmail }),
    client_reference_id: spaceId,
    metadata,
    subscription_data: subscriptionData,
    success_url: `${appUrl()}/spaces/${space.slug ?? spaceId}/settings/billing?plan=upgraded&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl()}/spaces/${space.slug ?? spaceId}/settings/billing`,
    allow_promotion_codes: true,
  })
  return session.url
}
