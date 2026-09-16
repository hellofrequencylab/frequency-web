'use server'

// THE CLIENT-CALLABLE SERVER ACTIONS for memberships (ENTITY-SPACES-SYSTEM §2.5, memberships v1).
//
// A 'use server' module may export ONLY async functions, so it cannot also hold the pure tier
// helpers or the shared types. Those live in lib/spaces/memberships.ts (no directive: pure helpers +
// IO + the action implementations + types, all unit-testable). This thin file is the seam the CLIENT
// surfaces import, so the mutations cross the network boundary as proper Server Actions:
//   membership-tier-form.tsx  -> setMembershipTiers
//   membership-join.tsx       -> joinTier
//   membership-cancel-button.tsx -> cancelMembership
//
// SERVER components (membership-join surface, the owner member list, the pages) import the READ
// actions (listMembershipTiers / listAllMembershipTiers / getMyMembership / listSpaceMemberships)
// directly from lib/spaces/memberships.ts: they never cross a client boundary, so they need no
// wrapper. The authorization + validation all live in the implementations; these wrappers just
// re-expose them.

import {
  setMembershipTiers as setMembershipTiersImpl,
  joinTier as joinTierImpl,
  cancelMembership as cancelMembershipImpl,
  promoteMembership as promoteMembershipImpl,
  type MembershipTier,
} from '@/lib/spaces/memberships'
import { type BillingInterval } from '@/lib/spaces/membership-pricing'
import { getMyProfileId } from '@/lib/auth'
import { setTierCircle as setTierCircleImpl } from '@/lib/spaces/tier-circle'
import {
  createSpaceMembershipCheckout,
  recordMembershipFromSessionId,
} from '@/lib/billing/space-membership-checkout'
import { onPageCheckoutAvailable } from '@/lib/billing/stripe-browser'
import { rateLimitOk } from '@/lib/rate-limit'
import { headers } from 'next/headers'
import { type ActionResult, ok, fail } from '@/lib/action-result'

/** Replace a Space's membership tiers. Gated on canEditProfile (see the implementation). */
export async function setMembershipTiers(
  spaceId: string,
  tiers: MembershipTier[],
): Promise<ActionResult> {
  return setMembershipTiersImpl(spaceId, tiers)
}

/** Join a tier. Any authenticated member; v1 records the membership and takes no charge. A FULL
 *  tier with the waitlist on records a waitlist spot instead ({ waitlisted: true }, ADR-824).
 *  `interval` is the cadence the member picked on the join surface (ADR-1374); the implementation
 *  resolves it against the tier before it records anything. */
export async function joinTier(
  spaceId: string,
  tierId: string,
  interval: BillingInterval = 'month',
): Promise<ActionResult<{ waitlisted: boolean }>> {
  return joinTierImpl(spaceId, tierId, interval)
}

/** Cancel a membership (or leave a waitlist). The member who joined or a space admin only. */
export async function cancelMembership(membershipId: string): Promise<ActionResult> {
  return cancelMembershipImpl(membershipId)
}

/** Promote a waitlist spot to an active membership (space admin only; ADR-824). */
export async function promoteMembership(membershipId: string): Promise<ActionResult> {
  return promoteMembershipImpl(membershipId)
}

/** Start a PAID space-membership checkout (Pricing P3). GATED inside createSpaceMembershipCheckout
 *  on billingLive() + the owner being Connect-ready; it returns a reason (never a charge) when not
 *  payable, so the caller falls back to the existing display-only joinTier path. Resolves the member
 *  from the session (the member never passes their own id). On success returns the Stripe URL.
 *  `interval` is the cadence the member picked (ADR-1374); a yearly request on a tier with no yearly
 *  price comes back as 'no_annual_price' and is NOT a fallback case. */
export async function startSpaceMembershipCheckout(
  spaceId: string,
  tierId: string,
  interval: BillingInterval = 'month',
  opts: { forceHosted?: boolean } = {},
): Promise<ActionResult<{ url?: string; clientSecret?: string; sessionId?: string }>> {
  const memberId = await getMyProfileId()
  if (!memberId) return fail('Not signed in')
  // Decided on the SERVER, before a session exists, so a deployment with no publishable key never
  // mints an elements session nothing could render (CHECKOUT-HANDOFF §3). `forceHosted` is the
  // control's last line of defence and is load-bearing: without it a failed mount asks for the same
  // elements session again, finds no url, and dead-ends the buyer.
  const ui = opts.forceHosted ? 'hosted' : onPageCheckoutAvailable() ? 'elements' : 'hosted'
  const result = await createSpaceMembershipCheckout(spaceId, tierId, memberId, interval, { ui })
  if (result.clientSecret) return ok({ clientSecret: result.clientSecret, sessionId: result.sessionId })
  if (result.url) return ok({ url: result.url, sessionId: result.sessionId })
  // 'billing_off' / 'free_tier' / 'no_owner_payouts' etc. — the caller decides whether to fall back
  // to the free join path; a clean error keeps this from ever being a broken button.
  return fail(result.reason ?? 'error')
}

/**
 * Settle an on-page membership join from its checkout session id (CHECKOUT-HANDOFF §6).
 *
 * authz-ok: a session gate is impossible here, because the id is the only thing the buyer's tab
 * holds and the recorder is the authority. recordMembershipFromSessionId re-fetches the session from
 * STRIPE and refuses anything that is not kind='space_membership', status='complete' and
 * payment_status='paid', so the most any caller can do with someone else's id is grant a membership
 * that genuinely happened, which the webhook does unprompted seconds later.
 */
export async function settleSpaceMembershipAction(
  sessionId: string,
): Promise<ActionResult<{ settled: boolean }>> {
  if (!sessionId || !sessionId.startsWith('cs_')) return fail('Not a checkout session.')

  // Per-IP limiter, failing OPEN on purpose: this runs AFTER a successful charge, so denying it
  // protects nothing (the webhook settles anyway) and only deletes the fast path.
  const ip = (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  if (!(await rateLimitOk('settle_space_membership', ip, 30, '1 m', { whenUnconfigured: 'allow' }))) {
    return fail('Too many attempts. Try again in a minute.')
  }

  try {
    const settled = await recordMembershipFromSessionId(sessionId)
    return ok({ settled })
  } catch (e) {
    // NEVER fatal. The member already paid; an error here must not send them to pay twice. The
    // webhook remains the guarantee.
    console.error('[space_membership] on-page settle failed; the webhook is now the only path', e)
    return ok({ settled: false })
  }
}

/** Link a membership tier to one of the Space's circles, or unlink with null (ADR-859). The
 *  implementation gates on canEditProfile and validates both objects belong to this Space; the
 *  caller identity resolves HERE so the client never names the actor. Linking sweeps current
 *  active tier members into the circle; the result reports how many were granted and how many
 *  missed because the circle is full. */
export async function setTierCircleAction(
  spaceId: string,
  tierId: string,
  circleId: string | null,
): Promise<ActionResult<{ granted: number; full: number }>> {
  const actorId = await getMyProfileId()
  if (!actorId) return fail('Not signed in')
  return setTierCircleImpl(spaceId, tierId, circleId, actorId)
}
