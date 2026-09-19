'use server'

import { getCallerProfile } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createBillingPortal } from '@/lib/billing/checkout'
import { createBundleCheckout, recordBundleFromSessionId } from '@/lib/billing/bundle-checkout'
import { createOnboardingLink, createDashboardLink, canReceivePayouts } from '@/lib/billing/connect'
import { viaStripe } from '@/lib/billing/via-stripe'
import { onPageCheckoutAvailable } from '@/lib/billing/stripe-browser'
import { rateLimitOk } from '@/lib/rate-limit'
import { headers } from 'next/headers'
import { type ActionResult, ok, fail } from '@/lib/action-result'
import { parseInput, z, uuid } from '@/lib/validation'

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
  opts: { forceHosted?: boolean } = {},
): Promise<ActionResult<{ url?: string; clientSecret?: string; sessionId?: string }>> {
  let seats: string[]
  let billingPeriod: 'monthly' | 'annual'
  try {
    const parsed = parseInput(
      z.object({
        period: z.enum(['monthly', 'annual']),
        seatProfileIds: z.array(uuid),
      }),
      { period, seatProfileIds },
    )
    billingPeriod = parsed.period
    seats = parsed.seatProfileIds
  } catch (err) {
    return fail(err instanceof Error ? err.message : 'Invalid input')
  }

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

  // Decided on the SERVER, before a session exists, so a deployment with no publishable key never
  // mints an elements session nothing could render (docs/CHECKOUT.md §3). `forceHosted` is
  // load-bearing: without it a failed mount asks for the same elements session again, finds no url,
  // and dead-ends the buyer.
  const ui = opts.forceHosted ? 'hosted' : onPageCheckoutAvailable() ? 'elements' : 'hosted'
  const bundle = await viaStripe('settings/billing startBundleCheckout', () => createBundleCheckout({
    profileId: profile.id,
    email: user.email,
    period: billingPeriod,
    seatProfileIds: seats,
    ui,
  }))
  if ('error' in bundle) return fail(bundle.error)
  const handed = bundle.value
  if (!handed) return fail('The bundle isn’t available right now.')
  if (handed.clientSecret) return ok({ clientSecret: handed.clientSecret, sessionId: handed.sessionId })
  if (handed.url) return ok({ url: handed.url, sessionId: handed.sessionId })
  return fail('Could not start checkout.')
}

// Settle an on-page bundle purchase from its checkout session id (docs/CHECKOUT.md §3).
// authz-ok: Stripe is the authority. recordBundleFromSessionId re-fetches the session FROM STRIPE
// and refuses anything that is not kind='household_bundle' and complete, so the most a caller can
// do with someone else's id is seat a bundle that genuinely happened, which the webhook does
// unprompted seconds later.
export async function settleBundleCheckoutAction(
  sessionId: string,
): Promise<ActionResult<{ settled: boolean }>> {
  if (!sessionId || !sessionId.startsWith('cs_')) return fail('Not a checkout session.')

  const ip = (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  if (!(await rateLimitOk('settle_bundle_checkout', ip, 30, '1 m', { whenUnconfigured: 'allow' }))) {
    return fail('Too many attempts. Try again in a minute.')
  }

  try {
    const settled = await recordBundleFromSessionId(sessionId)
    return ok({ settled })
  } catch (e) {
    console.error('[household_bundle] on-page settle failed; the webhook is now the only path', e)
    return ok({ settled: false })
  }
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
