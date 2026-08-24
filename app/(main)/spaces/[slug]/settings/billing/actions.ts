'use server'

import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { createSpaceLoadoutCheckout, createSpaceBillingPortal } from '@/lib/billing/space-plan-checkout'
import { updateOperatorSeats } from '@/lib/billing/operator-seats'
import { type BillingInterval } from '@/lib/billing/pricing-keys'
import { asAddonKey } from '@/lib/pricing/plans'
import { viaStripe } from '@/lib/billing/via-stripe'
import { type ActionResult, ok, fail } from '@/lib/action-result'

// SPACE PLAN BILLING ACTIONS (Pricing P3, ADR-363; collapsed ADR-552). The client-callable seams for
// the space owner billing surface:
//   startSpaceLoadoutCheckout — begin a Stripe Checkout to buy/upgrade a space plan (GATED on
//     billingLive() + the per-plan switch inside the checkout; returns a clean error while billing is
//     OFF, so the CTA never fires a broken checkout).
//
// Every action re-resolves the space + gates on the billing function's floor (ADMIN, matching
// functions.ts defaultMinRole 'admin' and the billing page render's spaceFunctionAccess gate). These
// actions mutate the OWNER's live Stripe subscription (checkout, portal, seats), so an EDITOR (the
// canManage/canEditProfile level) must NOT reach them. No em dashes. The retired white-label lead
// capture was removed with the multi-tier UI (ADR-552). startSpacePlanCheckout (the single-item plan
// checkout action) was DELETED by OWNER RULING (LIVE-062 batch 6, 2026-08-20): the ADR-811 loadout
// checkout superseded it and no UI called it; git history keeps the implementation.

/** Authorize the caller as an ADMIN (or owner) of `slug`'s space — the billing floor. Returns
 *  { spaceId, brandName } or null. Billing is not an editor-level action (it changes the owner's bill). */
async function authorizeOwner(slug: string): Promise<{ spaceId: string; brandName: string } | null> {
  const caller = await getCallerProfile()
  const space = await getVisibleSpaceBySlug(slug, caller?.id ?? null)
  if (!space) return null
  const caps = await getSpaceCapabilities(space, caller?.id ?? null)
  if (!caps.isAdmin) return null
  return { spaceId: space.id, brandName: space.brandName ?? space.name }
}

/** Open the Stripe billing portal for a Space owner to MANAGE the Space's subscription (payment method,
 *  plan change/cancel, seats where the portal allows). Owner-gated; returns a clean error when the Space
 *  has no Stripe customer yet (nothing to manage) so the button never routes to a broken URL. */
export async function openSpaceBillingPortal(slug: string): Promise<ActionResult<{ url: string }>> {
  const auth = await authorizeOwner(slug)
  if (!auth) return fail('You do not have access to manage this space.')
  const portal = await viaStripe('spaces/billing openSpaceBillingPortal', () =>
    createSpaceBillingPortal(auth.spaceId),
  )
  if ('error' in portal) return fail(portal.error)
  if (!portal.value) return fail('There is no subscription to manage yet.')
  return ok({ url: portal.value })
}

/** Set the Space's licensed operator-seat count directly on the live subscription (add / change / remove
 *  the operator_seat item with proration). Owner-gated; GATED inside updateOperatorSeats on billingLive()
 *  + seats-sellable + a live subscription, so this returns a clean error (never a broken charge) while
 *  billing is OFF or seats are inactive. */
export async function setOperatorSeats(slug: string, seats: number): Promise<ActionResult<{ seats: number }>> {
  const auth = await authorizeOwner(slug)
  if (!auth) return fail('You do not have access to manage this space.')
  const seatChange = await viaStripe('spaces/billing setOperatorSeats', () =>
    updateOperatorSeats(auth.spaceId, seats),
  )
  if ('error' in seatChange) return fail(seatChange.error)
  const res = seatChange.value
  if (!res.ok) return fail(res.error)
  return ok({ seats: res.seats })
}

/** The base tiers the multi-item loadout checkout sells (ADR-811): Business + Collective run on their
 *  base plus the optional AI add-on; Independent is the flat standalone white-label base; Nonprofit is
 *  the flat per-mission item. All go through the SAME createSpaceLoadoutCheckout, so interval + seat
 *  count thread identically, and each gates on its own per-plan switch inside the checkout. */
const LOADOUT_PLANS = ['business', 'collective', 'nonprofit', 'independent'] as const
type LoadoutPlan = (typeof LOADOUT_PLANS)[number]
function asLoadoutPlan(plan: string | undefined): LoadoutPlan {
  return (LOADOUT_PLANS as readonly string[]).includes(plan ?? '') ? (plan as LoadoutPlan) : 'business'
}

/** Begin a Stripe Checkout for a multi-item LOADOUT (ADR-460/463). Defaults to the Pro base plus its
 *  active add-ons; `plan` also selects the Nonprofit (per-seat) or Organization (flat) checkout, which
 *  ride the SAME createSpaceLoadoutCheckout so the monthly/yearly interval + seat count thread the same
 *  way (no parallel path). DOUBLE-GATED: authorizeOwner re-resolves the space + checks canManage
 *  server-side, then createSpaceLoadoutCheckout itself gates on billingLive() AND the per-plan switch, so
 *  this returns a clean error (never a broken URL) while billing is OFF. The charged price is the
 *  FOUNDING price, or the space's grandfathered locked price when it holds one (the lock is honored
 *  inside createSpaceLoadoutCheckout). */
export async function startSpaceLoadoutCheckout(
  slug: string,
  input: { plan?: string; addons?: string[]; interval?: BillingInterval; seatQuantity?: number },
): Promise<ActionResult<{ url: string }>> {
  const auth = await authorizeOwner(slug)
  if (!auth) return fail('You do not have access to manage this space.')
  const addons = (input.addons ?? []).map((a) => asAddonKey(a)).filter((a): a is NonNullable<typeof a> => a !== null)
  const interval: BillingInterval = input.interval === 'year' ? 'year' : 'month'
  const checkout = await viaStripe('spaces/billing startSpaceLoadoutCheckout', () =>
    createSpaceLoadoutCheckout(auth.spaceId, {
      plan: asLoadoutPlan(input.plan),
      addons,
      interval,
      seatQuantity: input.seatQuantity,
    }),
  )
  if ('error' in checkout) return fail(checkout.error)
  if (!checkout.value) return fail('Plan checkout is not available yet.')
  return ok({ url: checkout.value })
}
