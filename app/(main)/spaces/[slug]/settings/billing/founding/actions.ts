'use server'

// FOUNDING BUSINESS CHECKOUT ACTIONS (ADR-804). The client-callable seams for the Space founding
// Business checkout surface:
//   startFoundingBusinessCheckout   — begin a Stripe Checkout to lock the founding Business rate. GATED
//                                     inside createFoundingBusinessCheckout on billingLive() + the
//                                     double-subscribe guard + the per-city cap, so while billing is OFF
//                                     it returns a clean { state:'not_open' } and NEVER touches Stripe.
//   confirmFoundingBusinessCheckout — webhook-independent success confirm: verify the paid session
//                                     belongs to THIS Space, then GRANT the durable founder record
//                                     (locked rate + 3% take-rate for life) via grantFoundingStatus().
//
// Both DOUBLE-GATE: authorizeOwner re-resolves the Space + checks canManage server-side (a non-owner
// cannot start/confirm a checkout for someone else's Space), then the seam re-gates on billingLive().
// No em dashes in copy (CONTENT-VOICE §10).

import type Stripe from 'stripe'
import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { resolveSpaceManageAccess } from '@/lib/spaces/entitlements'
import { stripe } from '@/lib/billing/stripe'
import { billingLive } from '@/lib/pricing/settings'
import { grantFoundingStatus } from '@/lib/founding/status'
import {
  createFoundingBusinessCheckout,
  type StartFoundingBusinessResult,
} from '@/lib/founding/business-checkout'
import type { BillingPeriod } from '@/lib/billing/pricing-keys'

/** Authorize the caller as a manager of `slug`'s Space; returns { spaceId, slug } or null. */
async function authorizeOwner(slug: string): Promise<{ spaceId: string; slug: string } | null> {
  const caller = await getCallerProfile()
  const space = await getVisibleSpaceBySlug(slug, caller?.id ?? null)
  if (!space) return null
  const { canManage } = await resolveSpaceManageAccess(space, caller?.id ?? null, caller?.webRole)
  if (!canManage) return null
  return { spaceId: space.id, slug: space.slug }
}

/** Normalize a raw period to the two we sell (monthly / annual), defaulting to monthly. */
function asPeriod(period: string | undefined): BillingPeriod {
  return period === 'annual' ? 'annual' : 'monthly'
}

/** Begin a Stripe Checkout to lock the founding Business rate for a Space. DOUBLE-GATED (owner authz +
 *  billingLive/paying/cap inside the seam). Returns the seam result so the client can route to the URL
 *  or render the matching gate state (not_open / already_active / sold_out). */
export async function startFoundingBusinessCheckout(
  slug: string,
  input: { period?: string; city?: string },
): Promise<StartFoundingBusinessResult> {
  const auth = await authorizeOwner(slug)
  if (!auth) return { ok: false, error: 'You do not have access to manage this space.' }
  return createFoundingBusinessCheckout({
    spaceId: auth.spaceId,
    slug: auth.slug,
    period: asPeriod(input.period),
    city: (input.city ?? '').trim(),
  })
}

export type ConfirmFoundingBusinessResult =
  | { ok: true; alreadyGranted: boolean }
  | { ok: false; notOpen?: true; pending?: true; error?: string }

/**
 * Confirm a founding Business checkout on the success redirect and GRANT the durable founder record.
 * Webhook-independent (mirrors confirmFounderCheckout): retrieve the session, verify it is a PAID
 * session that belongs to THIS Space, then call grantFoundingStatus({ spaceId, kind:'business' }),
 * which writes/activates the founding_members row at the LOCKED rate + 3% take-rate WITHOUT charging
 * (the charge already happened in Stripe; the grant only records the grandfathered grant). Idempotent:
 * the same grant the (future) webhook hook would run, safe to re-run on a refresh. Still GATED: while
 * billing is OFF we never call Stripe here either.
 */
export async function confirmFoundingBusinessCheckout(
  slug: string,
  sessionId: string,
): Promise<ConfirmFoundingBusinessResult> {
  if (!(await billingLive())) return { ok: false, notOpen: true }
  if (!stripe) return { ok: false, notOpen: true }
  if (!sessionId) return { ok: false, error: 'Missing session.' }

  const auth = await authorizeOwner(slug)
  if (!auth) return { ok: false, error: 'You do not have access to manage this space.' }

  let session: Stripe.Checkout.Session
  try {
    session = await stripe.checkout.sessions.retrieve(sessionId)
  } catch {
    return { ok: false, error: 'We could not find that checkout.' }
  }

  // Only confirm a session that belongs to THIS Space (defense against a guessed session id).
  const sessionSpaceId = session.metadata?.space_id ?? session.client_reference_id ?? null
  if (sessionSpaceId !== auth.spaceId) return { ok: false, error: 'That checkout is not for this space.' }
  if (session.metadata?.founding !== 'business') {
    return { ok: false, error: 'That checkout is not a founding business membership.' }
  }

  // A subscription with no trial is paid immediately; a promo-covered one reads no_payment_required.
  // Anything still unpaid is reported pending (do not grant before payment settles).
  if (session.payment_status === 'unpaid') return { ok: false, pending: true }

  const cohortCity = session.metadata?.cohort_city ?? null
  const res = await grantFoundingStatus({ spaceId: auth.spaceId, kind: 'business', cohortCity })
  if ('error' in res) return { ok: false, error: res.error }
  return { ok: true, alreadyGranted: res.data.granted === 0 }
}
