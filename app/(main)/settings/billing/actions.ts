'use server'

import { getCallerProfile } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createBillingPortal } from '@/lib/billing/checkout'
import { createBundleCheckout } from '@/lib/billing/bundle-checkout'
import { createOnboardingLink, createDashboardLink, canReceivePayouts } from '@/lib/billing/connect'
import { viaStripe } from '@/lib/billing/via-stripe'
import { type ActionResult, ok, fail } from '@/lib/action-result'

// Open the Stripe billing portal so a member can update or cancel their subscription.
export async function openBillingPortal(): Promise<ActionResult<{ url: string }>> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return fail('Not signed in')

  const { data: profile } = await createAdminClient()
    .from('profiles')
    .select('id')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  if (!profile) return fail('Profile not found')

  const portal = await viaStripe('settings/billing openBillingPortal', () => createBillingPortal(profile.id))
  if ('error' in portal) return fail(portal.error)
  const url = portal.value
  if (!url) return fail('No subscription to manage yet.')
  return ok({ url })
}

/**
 * Start a Household / Circle bundle checkout: one subscription that covers several members
 * (ADR-370). The caller is re-resolved from the session and becomes the bundle OWNER, so a posted id
 * can never buy someone else a bundle or seat the buyer into a stranger's household.
 *
 * `seatProfileIds` are the OTHER members the bundle seats. Passing none is valid and buys the bundle
 * with the buyer seated and the rest of the seats open.
 *
 * GATED end to end: createBundleCheckout returns null unless billing is live AND the operator has
 * turned the bundle on, so this action cannot charge anyone while the platform ships with billing off.
 * The seats themselves are written by the webhook (lib/billing/bundle-seats.ts) once the subscription
 * is active, never here: a redirect the browser may never follow is not where money-backed access
 * gets granted.
 */
export async function startBundleCheckout(
  period: 'monthly' | 'annual' = 'monthly',
  seatProfileIds: string[] = [],
): Promise<ActionResult<{ url: string }>> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return fail('Not signed in')

  const { data: profile } = await createAdminClient()
    .from('profiles')
    .select('id')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  if (!profile) return fail('Profile not found')

  const bundle = await viaStripe('settings/billing startBundleCheckout', () => createBundleCheckout({
    profileId: profile.id,
    email: user.email,
    period,
    seatProfileIds,
  }))
  if ('error' in bundle) return fail(bundle.error)
  const url = bundle.value
  if (!url) return fail('The bundle isn’t available right now.')
  return ok({ url })
}

// ── Connect payouts (ADR-175) ────────────────────────────────────────────────
// `canReceivePayouts` is a pure capability predicate, so it lives in the
// server-only plumbing (lib/billing/connect) rather than this `'use server'`
// module — exporting it here would have made it a public RPC (AUTHZ-4).

// Send a host into Stripe-hosted Express onboarding; returns the link URL to redirect to.
export async function startPayoutOnboarding(): Promise<ActionResult<{ url: string }>> {
  const me = await getCallerProfile()
  if (!me) return fail('Not signed in')
  if (!(await canReceivePayouts(me.id, me.community_role))) return fail('Payouts aren’t available for your account yet.')

  const link = await viaStripe('settings/billing startPayoutOnboarding', () => createOnboardingLink(me.id))
  if ('error' in link) return fail(link.error)
  const url = link.value
  if (!url) return fail('Payouts aren’t turned on yet.')
  return ok({ url })
}

// Open the connected host's Express dashboard (manage bank, payouts, details).
export async function openPayoutDashboard(): Promise<ActionResult<{ url: string }>> {
  const me = await getCallerProfile()
  if (!me) return fail('Not signed in')

  const dash = await viaStripe('settings/billing openPayoutDashboard', () => createDashboardLink(me.id))
  if ('error' in dash) return fail(dash.error)
  const url = dash.value
  if (!url) return fail('No payout account to manage yet.')
  return ok({ url })
}
