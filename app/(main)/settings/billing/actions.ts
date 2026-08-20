'use server'

import { getCallerProfile } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createBillingPortal } from '@/lib/billing/checkout'
import { createBundleCheckout } from '@/lib/billing/bundle-checkout'
import { createOnboardingLink, createDashboardLink, canReceivePayouts } from '@/lib/billing/connect'
import { type ActionResult, ok, fail } from '@/lib/action-result'

// STRIPE CALLS THROW, AND THIS PAGE IS ONE PAGE. Every action below reaches Stripe, and a
// StripeInvalidRequestError is an ordinary outcome of a half-finished dashboard setup, not an
// exceptional one: an incomplete Connect platform profile threw
// "You must complete your platform profile…" on 2026-08-20 and the throw escaped the action,
// tripped the error boundary, and replaced the WHOLE settings page (plan, billing, bundle seats
// and payouts) with "Something went wrong on our end". The member could no longer even read their
// plan because a payout button failed.
//
// So every Stripe reach goes through this: the real error is logged server-side (an operator needs
// the message and Stripe's request id to fix the dashboard), and the caller gets a readable
// failure that renders inline on the card that asked for it. Never let one of these throw again.
async function viaStripe<T>(label: string, run: () => Promise<T>): Promise<{ value: T } | { error: string }> {
  try {
    return { value: await run() }
  } catch (err) {
    const e = err as { message?: string; requestId?: string }
    console.error(`[settings/billing ${label}]`, e?.message ?? err, e?.requestId ? `req=${e.requestId}` : '')
    return { error: 'Stripe could not complete that just now. Try again in a moment, and if it keeps happening the platform’s Stripe setup needs a look.' }
  }
}

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

  const portal = await viaStripe('openBillingPortal', () => createBillingPortal(profile.id))
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

  const bundle = await viaStripe('startBundleCheckout', () => createBundleCheckout({
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

  const link = await viaStripe('startPayoutOnboarding', () => createOnboardingLink(me.id))
  if ('error' in link) return fail(link.error)
  const url = link.value
  if (!url) return fail('Payouts aren’t turned on yet.')
  return ok({ url })
}

// Open the connected host's Express dashboard (manage bank, payouts, details).
export async function openPayoutDashboard(): Promise<ActionResult<{ url: string }>> {
  const me = await getCallerProfile()
  if (!me) return fail('Not signed in')

  const dash = await viaStripe('openPayoutDashboard', () => createDashboardLink(me.id))
  if ('error' in dash) return fail(dash.error)
  const url = dash.value
  if (!url) return fail('No payout account to manage yet.')
  return ok({ url })
}
