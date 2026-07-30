'use server'

import { revalidatePath } from 'next/cache'
import type Stripe from 'stripe'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createMembershipCheckout } from '@/lib/billing/checkout'
import { stripe, appUrl } from '@/lib/billing/stripe'
import { billingLive } from '@/lib/pricing/settings'
import { loadCatalogConfig, isValidPwywAmount } from '@/lib/pricing/catalog-config'
import { formatCents } from '@/lib/pricing/display'
import { yearlyFromMonthly } from '@/lib/billing/pricing-keys'
import {
  SUPPORTER_CONTRIBUTION_KIND,
  isValidContributionAmount,
  insertPendingContribution,
  recordSupporterContributionFromSession,
} from '@/lib/billing/supporter'
import { type ActionResult, ok, fail } from '@/lib/action-result'

// Membership is the ENTITLEMENT axis (profiles.membership_tier), orthogonal to the
// community role (ADR-163 §11.2). Upgrading no longer touches community_role — Crew is
// a pure stewardship role now. During beta this is a free self-serve toggle; the real
// upgrade (free → crew) routes through billing (P2.2).
export async function toggleMembership(): Promise<ActionResult<{ tier: string }>> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return fail('Not signed in')

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

// Real membership purchase — a Stripe Checkout session for CREW, the one sellable member tier
// (ADR-878). It takes no tier argument on purpose: there is nothing else on the member ladder to buy,
// so there is no parameter a caller could pass to open a Supporter purchase. Returns the hosted-checkout
// URL; the webhook (and the success-redirect fallback) flip membership_tier on completion. Only
// reachable when billing is configured.
export async function startMembershipCheckout(): Promise<ActionResult<{ url: string }>> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return fail('Not signed in')

  const { data: profile } = await createAdminClient()
    .from('profiles')
    .select('id')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  if (!profile) return fail('Profile not found')

  const url = await createMembershipCheckout({ profileId: profile.id, email: user.email, tier: 'crew' })
  if (!url) return fail('Billing isn’t available right now.')
  return ok({ url })
}

/**
 * PAY-WHAT-YOU-WANT Crew checkout (ADR-908). The member picks their own recurring amount and every
 * amount buys IDENTICAL access; the number only decides what they contribute.
 *
 * The amount is validated SERVER-SIDE against the operator floor (`isValidPwywAmount`), because the
 * picker is a client component and a floor enforced only in the browser is not a floor. Annual is
 * 10x the chosen monthly (two months free, the house convention) and is computed HERE rather than
 * trusted from the client, so the amount charged always matches the interval the member chose.
 *
 * There is deliberately no upper bound in this action: `maxCents` is a SOFT ceiling the picker uses
 * to ask for confirmation, not a rule, and refusing a large gift at the server would be the opposite
 * of pay-what-you-want.
 */
export async function startPwywMembershipCheckout(
  amountCents: number,
  period: 'monthly' | 'annual' = 'monthly',
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

  const { pwyw } = await loadCatalogConfig()
  const monthly = Math.round(Number(amountCents))
  if (!isValidPwywAmount(monthly, pwyw)) {
    return fail(`Please choose ${formatCents(pwyw.minCents)} a month or more.`)
  }

  // yearlyFromMonthly is THE annual math (two months free = 10x), shared with the space catalog so
  // Crew's annual can never drift from the convention the rest of pricing uses.
  const charged = period === 'annual' ? yearlyFromMonthly(monthly) : monthly
  const url = await createMembershipCheckout({
    profileId: profile.id,
    email: user.email,
    tier: 'crew',
    period,
    amountCents: charged,
  })
  if (!url) return fail('Billing isn’t available right now.')
  return ok({ url })
}

// PWYW SUPPORTER BADGE (Pricing ladder Phase C, ADR-463 / ADR-495). Supporter is retired as a tier and
// becomes an opt-in pay-what-you-want badge on Crew (profiles.is_supporter). This writes the badge flag
// only: the actual PWYW CONTRIBUTION CHARGE + `supporter_contributions` ledger live in
// startSupporterContribution below, DORMANT behind billing_live. A member can turn the badge on or off
// freely. Writes the caller's OWN profile only (re-resolved from the session), never another member's.
export async function toggleSupporterBadge(on: boolean): Promise<ActionResult<{ isSupporter: boolean }>> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return fail('Not signed in')

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('id')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  if (!profile) return fail('Profile not found')

  const { error } = await admin.from('profiles').update({ is_supporter: on }).eq('id', profile.id)
  if (error) return fail(error.message)

  revalidatePath('/upgrade')
  return ok({ isSupporter: on })
}

/** The signed-in caller's profile id (session-derived), or null when not signed in. Never trust a
 *  client-supplied id; resolve it from the auth session (mirrors the founders checkout action). */
async function getMyProfileId(): Promise<string | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await createAdminClient()
    .from('profiles')
    .select('id')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  return data?.id ?? null
}

export type SupporterContributionResult =
  // billing_live is OFF (today): the badge was turned on, but NO charge was started. No session,
  // no card. This is the dormant path — identical to toggleSupporterBadge's behavior.
  | { ok: true; dormant: true; isSupporter: boolean }
  // Live + authorized: the hosted Stripe Checkout URL for the one-time PWYW contribution.
  | { ok: true; url: string }
  // A real, validated failure (not signed in, bad amount, Stripe could not start the session).
  | { ok: false; error: string }

/**
 * Start a pay-what-you-want Supporter CONTRIBUTION (Pricing ladder Phase C, ADR-495). The contribution
 * is a ONE-TIME Stripe charge (mode:'payment'); a `supporter_contributions` ledger row records it and a
 * successful payment turns the Supporter badge on + books a Foundation donation (lib/billing/supporter.ts).
 *
 * THE GATE (no-charge invariant): while billingLive() is false this NEVER touches Stripe. It simply turns
 * the badge on (profiles.is_supporter) exactly like toggleSupporterBadge and returns { dormant:true }. The
 * charge machinery only runs once the operator flips `billing_live`.
 *
 * When live: validate the chosen amount against the operator PWYW floor (catalog.pwyw.minCents) + the
 * ceiling, create a mode:'payment' Checkout session tagged metadata { kind:'supporter_contribution',
 * profile_id }, record the `pending` ledger row (refusing the URL + expiring the session if the row never
 * lands, mirroring tips), and return the hosted URL. The grant (badge on + ledger `succeeded` + Foundation
 * donation) happens on success via the webhook / confirm, not here.
 */
export async function startSupporterContribution(amountCents: number): Promise<SupporterContributionResult> {
  const profileId = await getMyProfileId()
  if (!profileId) return { ok: false, error: 'Not signed in' }

  // ── THE GATE. While billing is OFF this stays badge-only: no Stripe, no charge, no card. ──
  if (!(await billingLive()) || !stripe) {
    const { error } = await createAdminClient().from('profiles').update({ is_supporter: true }).eq('id', profileId)
    if (error) return { ok: false, error: error.message }
    revalidatePath('/upgrade')
    return { ok: true, dormant: true, isSupporter: true }
  }

  // Validate the PWYW amount against the operator floor + the ceiling (default-deny on a bad amount).
  const { pwyw } = await loadCatalogConfig()
  if (!isValidContributionAmount(amountCents, pwyw.minCents)) {
    return { ok: false, error: 'Please choose a valid contribution amount.' }
  }
  const amount = Math.round(amountCents)

  let session: Stripe.Checkout.Session
  try {
    session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'usd',
            unit_amount: amount,
            product_data: { name: 'Frequency Supporter contribution' },
          },
        },
      ],
      client_reference_id: profileId,
      // The webhook + the success-page confirm read these to record the contribution + grant the badge.
      metadata: { kind: SUPPORTER_CONTRIBUTION_KIND, profile_id: profileId },
      payment_intent_data: { metadata: { kind: SUPPORTER_CONTRIBUTION_KIND, profile_id: profileId } },
      success_url: `${appUrl()}/upgrade?supporter=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl()}/upgrade`,
    })
  } catch (err) {
    console.error('[supporter-contribution] failed to create session:', err)
    return { ok: false, error: 'Could not start checkout. Please try again.' }
  }

  // Record the `pending` ledger row the recorder flips to `succeeded`. If it never lands, refuse the URL
  // and expire the just-created session so the member can't pay into a contribution we never recorded.
  const pendingErr = await insertPendingContribution({ profileId, amountCents: amount, checkoutSessionId: session.id })
  if (pendingErr) {
    console.error('[supporter-contribution] pending row insert failed:', pendingErr)
    try {
      await stripe.checkout.sessions.expire(session.id)
    } catch {
      // best-effort — if expiry fails the session lapses on its own; we still refuse the URL
    }
    return { ok: false, error: 'Could not start checkout. Please try again.' }
  }

  if (!session.url) return { ok: false, error: 'Could not start checkout. Please try again.' }
  return { ok: true, url: session.url }
}

export type ConfirmSupporterContributionResult =
  | { ok: true; amountCents: number }
  | { ok: false; notOpen?: true; pending?: true; error?: string }

/**
 * Webhook-independent confirm on the success redirect: retrieve the session, verify it is a PAID
 * supporter-contribution session that belongs to THIS signed-in caller, then record it (idempotent; the
 * same recorder the webhook runs). Guarantees the contribution + badge land even if the webhook is not
 * wired yet, mirroring confirmFounderCheckout. Still gated: never calls Stripe while billing is OFF.
 */
export async function confirmSupporterContribution(sessionId: string): Promise<ConfirmSupporterContributionResult> {
  if (!(await billingLive()) || !stripe) return { ok: false, notOpen: true }
  if (!sessionId) return { ok: false, error: 'Missing session.' }

  const profileId = await getMyProfileId()
  if (!profileId) return { ok: false, error: 'Please sign in to confirm your contribution.' }

  let session: Stripe.Checkout.Session
  try {
    session = await stripe.checkout.sessions.retrieve(sessionId)
  } catch {
    return { ok: false, error: 'We could not find that checkout.' }
  }

  // Only confirm a session that belongs to this caller (defense against a guessed session id).
  const sessionProfileId = session.metadata?.profile_id ?? session.client_reference_id ?? null
  if (sessionProfileId !== profileId) return { ok: false, error: 'That checkout is not yours.' }
  if (session.payment_status !== 'paid') return { ok: false, pending: true }

  const res = await recordSupporterContributionFromSession(session)
  if (!res) return { ok: false, error: 'That checkout is not a supporter contribution.' }
  revalidatePath('/upgrade')
  return { ok: true, amountCents: res.amountCents }
}
