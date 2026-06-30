'use server'

import { getCallerProfile } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createBillingPortal } from '@/lib/billing/checkout'
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
