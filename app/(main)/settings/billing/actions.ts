'use server'

import { getCallerProfile } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createBillingPortal } from '@/lib/billing/checkout'
import { createBundleCheckout } from '@/lib/billing/bundle-checkout'
import { createOnboardingLink, createDashboardLink, canReceivePayouts } from '@/lib/billing/connect'
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

  const url = await createBillingPortal(profile.id)
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

  const url = await createBundleCheckout({
    profileId: profile.id,
    email: user.email,
    period,
    seatProfileIds,
  })
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

  const url = await createOnboardingLink(me.id)
  if (!url) return fail('Payouts aren’t turned on yet.')
  return ok({ url })
}

// Open the connected host's Express dashboard (manage bank, payouts, details).
export async function openPayoutDashboard(): Promise<ActionResult<{ url: string }>> {
  const me = await getCallerProfile()
  if (!me) return fail('Not signed in')

  const url = await createDashboardLink(me.id)
  if (!url) return fail('No payout account to manage yet.')
  return ok({ url })
}
