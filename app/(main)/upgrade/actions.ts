'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createMembershipCheckout, recordCrewCheckoutFromSessionId } from '@/lib/billing/checkout'
import { onPageCheckoutAvailable } from '@/lib/billing/stripe-browser'
import { billingLive } from '@/lib/pricing/settings'
import { loadCatalogConfig, isValidPwywAmount } from '@/lib/pricing/catalog-config'
import { formatCents } from '@/lib/pricing/display'
import { yearlyFromMonthly } from '@/lib/billing/pricing-keys'
import { rateLimitOk } from '@/lib/rate-limit'
import { type ActionResult, ok, fail } from '@/lib/action-result'

// Membership is the ENTITLEMENT axis (profiles.membership_tier), orthogonal to the
// community role (ADR-163 §11.2). Upgrading no longer touches community_role — Crew is
// a pure stewardship role now. During beta this is a free self-serve toggle; the real
// upgrade (free → crew) routes through billing (P2.2).
export async function toggleMembership(): Promise<ActionResult<{ tier: string }>> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return fail('Not signed in')

  // ── THE GATE (LIVE-090). Identity is not authorization. Everything above this line
  //    establishes WHO is asking; this line is the only thing that asks WHETHER the beta
  //    toggle is still open. Once billing is live, free ↔ crew is a PURCHASE and belongs to
  //    Stripe, so the beta shortcut has to close on the same date the checkout opens.
  //
  //    Why a server-side gate and not the render. `page.tsx` already picks PwywPicker over
  //    UpgradeToggle when billing is live — but `upgrade-toggle.tsx` statically imports this
  //    action and `page.tsx` statically imports that component, so Next registers the action id
  //    at build time and it stays POST-able whichever branch renders. A server action is a POST
  //    endpoint, not a button (see the Next data-security guide, §"Server Actions"), and the
  //    tier it writes is what BOTH payout paths read to pick the take-rate rung
  //    (lib/billing/tickets.ts, lib/commerce/checkout.ts via memberNetworkTakeRateBps).
  //    Its sibling startSupporterContribution carried this same gate until LIVE-361 retired it.
  if (await billingLive()) return fail('Manage your membership in billing.')

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('id, membership_tier')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (!profile) return fail('Profile not found')

  // Beta toggle: free ↔ crew (the paid membership). The only two rungs on the member ladder.
  const current = (profile.membership_tier ?? 'free') as string
  const next = current === 'free' ? 'crew' : 'free'

  const { error } = await admin
    .from('profiles')
    .update({ membership_tier: next })
    .eq('id', profile.id)

  if (error) return fail(error.message)

  revalidatePath('/', 'layout')
  return ok({ tier: next })
}

/**
 * PAY-WHAT-YOU-WANT Crew checkout (ADR-908/ADR-919). The member picks their own recurring amount and
 * every amount buys IDENTICAL access; the number only decides what they contribute.
 *
 * 🔴 THE AMOUNT IS REQUIRED, NOT OPTIONAL, and there is no second no-amount seam. An optional amount
 * means a fallback price, and a fallback price for an offer that has no price is exactly how a $9
 * charge shipped for a $4.99 offer: `createMembershipCheckout` had accepted `amountCents` since the
 * membership rework, this action never passed one, and every member fell through to the fixed
 * `crew_monthly` catalog price while the whole PWYW system sat unused behind a hardcoded number.
 *
 * The floor is enforced HERE, server-side, against the OPERATOR's config, because a client that posts
 * its own amount is the obvious way to buy Crew for a cent. `isValidPwywAmount` is the one policy
 * seam; the checkout deliberately is not (it only refuses non-positive amounts).
 *
 * ANNUAL is computed here too, never trusted from the client, so the figure charged always matches the
 * interval the member chose. `yearlyFromMonthly` is THE annual math (two months free = 10x), shared
 * with the space catalog, so Crew's annual can never drift from the convention the rest of pricing uses.
 *
 * There is deliberately no upper bound: `maxCents` is a SOFT ceiling the picker uses to ask for
 * confirmation, not a rule. Refusing a large gift at the server would be the opposite of
 * pay-what-you-want.
 */
export async function startMembershipCheckout(
  amountCents: number,
  period: 'monthly' | 'annual' = 'monthly',
  opts: { forceHosted?: boolean } = {},
): Promise<ActionResult<{ url?: string; clientSecret?: string; sessionId?: string }>> {
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

  const monthly = Number.isFinite(amountCents) ? Math.round(amountCents) : NaN
  const { pwyw } = await loadCatalogConfig()
  if (!isValidPwywAmount(monthly, pwyw)) {
    return fail(`Choose ${formatCents(pwyw.minCents)} a month or more.`)
  }
  const charged = period === 'annual' ? yearlyFromMonthly(monthly) : monthly

  // Decided on the SERVER, before a session exists, so a deployment with no publishable key never
  // mints an elements session nothing could render (docs/CHECKOUT.md §3). `forceHosted` is the
  // control's last line of defence and is load-bearing: without it a failed mount asks for the same
  // elements session again, finds no url, and dead-ends the buyer.
  const ui = opts.forceHosted ? 'hosted' : onPageCheckoutAvailable() ? 'elements' : 'hosted'
  const result = await createMembershipCheckout({
    profileId: profile.id,
    email: user.email,
    tier: 'crew',
    period,
    amountCents: charged,
    ui,
  })
  if (!result) return fail('Billing isn’t available right now.')
  if (result.clientSecret) return ok({ clientSecret: result.clientSecret, sessionId: result.sessionId })
  if (result.url) return ok({ url: result.url, sessionId: result.sessionId })
  return fail('Could not start checkout.')
}

// Settle an on-page Crew join from its checkout session id (docs/CHECKOUT.md §3).
// authz-ok: a session gate is impossible here, because the id is the only thing the buyer's tab
// holds and Stripe is the authority. recordCrewCheckoutFromSessionId re-fetches the session from
// STRIPE and refuses anything that is not a kind-less subscription (SCAN-541) that confirmCheckout
// would grant, so the most any caller can do with someone else's id is grant Crew that genuinely
// happened, which the webhook does unprompted seconds later.
export async function settleMembershipCheckoutAction(
  sessionId: string,
): Promise<ActionResult<{ settled: boolean }>> {
  if (!sessionId || !sessionId.startsWith('cs_')) return fail('Not a checkout session.')

  const ip = (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  if (!(await rateLimitOk('settle_membership_checkout', ip, 30, '1 m', { whenUnconfigured: 'allow' }))) {
    return fail('Too many attempts. Try again in a minute.')
  }

  try {
    const settled = await recordCrewCheckoutFromSessionId(sessionId)
    return ok({ settled })
  } catch (e) {
    // NEVER fatal. The member already paid; an error here must not send them to pay twice. The
    // webhook remains the guarantee.
    console.error('[membership] on-page settle failed; the webhook is now the only path', e)
    return ok({ settled: false })
  }
}

// PWYW SUPPORTER BADGE (Pricing ladder Phase C, ADR-463 / ADR-495). Supporter is retired as a tier and
// becomes an opt-in pay-what-you-want badge on Crew (profiles.is_supporter).
//
// 🔴 THERE IS NO STANDALONE `toggleSupporterBadge` ANY MORE (ADR-1030). One existed here and never
// acquired a caller: nothing in app/ or components/ imported it, and no test covered it. In a
// 'use server' module that is not dead code — every export is a POST endpoint the framework wires up
// and serves, so an orphan action is an untested, unreviewed write path onto `profiles` that stays
// reachable precisely because nobody is looking at it.
//
// The badge write it performed is not lost, and LIVE-361 changed where it lives: the badge is
// earned by what a member PAYS for Crew (`earnsSupporterMark`, applied in lib/billing/checkout.ts),
// which is the owner-locked answer ("Supporter -> PWYW badge", ADR-463). It is a consequence of the
// one choice rather than a second purchase. If a member-facing "turn the badge off again" control
// is ever built, it should be added THEN, with its caller and its test in the same change.


// ── THE SUPPORTER CONTRIBUTION IS RETIRED (LIVE-361) ────────────────────────────────────────────
// `startSupporterContribution` and `confirmSupporterContribution` lived here and are gone.
//
// WHY, and it is a ruling rather than a cleanup: Supporter is a PWYW BADGE ON CREW, not a second
// purchase. ADR-463 dropped the retired Supporter TIER from this page and replaced it with the
// badge, and the owner-locked answer in the pricing rulings reads "Supporter -> PWYW badge". The
// badge is earned by what a member pays for Crew (`earnsSupporterMark`, applied in
// lib/billing/checkout.ts), so a separate contribution charge re-splits one offer into two -- the
// exact thing ./page.tsx says was removed because it taught the page to read as "a $9 tier, and
// also a donation".
//
// It was found by LIVE-361 as a money-handling server action with NO CALLER anywhere except its
// own test, while /upgrade still read `?supporter=success` and had a thanks panel ready. The whole
// back half was live and reachable by a redirect nothing could produce, which is worse than either
// having the feature or not having it: every reading of the code suggested a working purchase.
//
// Verified empty before deleting, not assumed: production held 0 supporter_contributions (0
// settled), 0 profiles with the badge, and 0 charge events, so nothing was in flight and no refund
// can ever be owed against a contribution that never happened.
