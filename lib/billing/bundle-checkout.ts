// HOUSEHOLD / CIRCLE BUNDLE CHECKOUT (ADR-370, REMAINING-WORK #6). A subscription Checkout for a member
// to buy the multi-seat bundle. The buyer becomes the bundle OWNER (payer); seating the other members
// (writing profiles.household_bundle_id + their granted tier) happens in the gated webhook once the
// subscription is active, exactly like the space-plan / space-membership reconcilers.
//
// GATED: returns null (a no-op) unless bundleSellable() (billingLive() AND bundle_household_enabled) —
// so nothing charges and no Stripe session is created while billing is OFF (the ABSOLUTE INVARIANT
// holds). Server-only. Mirrors lib/billing/space-plan-checkout.ts.

import { stripe, appUrl } from './stripe'
import { createAdminClient } from '@/lib/supabase/admin'
import { bundleSellable } from '@/lib/pricing/settings'
import { householdBundlePriceKey } from '@/lib/pricing/bundle'
import { resolveStripePriceId } from './pricing-prices'
import type { BillingPeriod } from './pricing-keys'

/** Create a subscription Checkout session for a member to buy the Household / Circle bundle; returns
 *  the URL, or null when the bundle isn't sellable / not synced to Stripe. GATED on bundleSellable.
 *  authz-delegated: a caller-trusted member action authorizes the buyer; this binds the customer to
 *  THIS profile and stamps the bundle metadata so the webhook seats the bundle correctly. */
export async function createBundleCheckout(opts: {
  profileId: string
  email?: string | null
  period?: BillingPeriod
}): Promise<string | null> {
  if (!stripe) return null
  const period: BillingPeriod = opts.period ?? 'monthly'
  if (!(await bundleSellable())) return null

  // Resolve the synced Price for the bundle at this period (no inline fallback — a bundle must be synced).
  const priceId = await resolveStripePriceId(householdBundlePriceKey(period))
  if (!priceId) return null

  const { data: profile } = await createAdminClient()
    .from('profiles')
    .select('stripe_customer_id')
    .eq('id', opts.profileId)
    .maybeSingle()
  const customer = (profile as { stripe_customer_id?: string | null } | null)?.stripe_customer_id ?? undefined

  const metadata = { kind: 'household_bundle', owner_id: opts.profileId, billing_period: period }
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    ...(customer ? { customer } : { customer_email: opts.email ?? undefined }),
    client_reference_id: opts.profileId,
    metadata,
    subscription_data: { metadata },
    success_url: `${appUrl()}/settings/billing?bundle=1&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl()}/upgrade`,
    allow_promotion_codes: true,
  })
  return session.url
}
