// Stripe checkout + billing-portal session creation (P2.2). Server-only. No-ops
// (return null) when billing isn't configured, so callers degrade gracefully.

import { stripe, priceFor, appUrl } from './stripe'
import { createAdminClient } from '@/lib/supabase/admin'
import type { EntitlementTier } from '@/lib/core/entitlement'

/** Create a subscription Checkout session for a membership tier; returns the URL. */
export async function createMembershipCheckout(opts: {
  profileId: string
  email?: string | null
  tier: Exclude<EntitlementTier, 'free'>
}): Promise<string | null> {
  if (!stripe) return null
  const price = priceFor(opts.tier)
  if (!price) return null

  // Reuse the profile's Stripe customer if we've seen one (keeps one customer per member).
  const { data: profile } = await createAdminClient()
    .from('profiles')
    .select('stripe_customer_id')
    .eq('id', opts.profileId)
    .maybeSingle()
  const customer = profile?.stripe_customer_id ?? undefined

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price, quantity: 1 }],
    ...(customer ? { customer } : { customer_email: opts.email ?? undefined }),
    client_reference_id: opts.profileId,
    metadata: { profile_id: opts.profileId, tier: opts.tier },
    subscription_data: { metadata: { profile_id: opts.profileId, tier: opts.tier } },
    success_url: `${appUrl()}/settings/billing?upgraded=1`,
    cancel_url: `${appUrl()}/upgrade`,
    allow_promotion_codes: true,
  })
  return session.url
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
