'use server'

import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { resolveSpaceManageAccess } from '@/lib/spaces/entitlements'
import { createSpacePlanCheckout, createSpaceLoadoutCheckout } from '@/lib/billing/space-plan-checkout'
import { asSpacePlanKey, type BillingInterval, type BillingPeriod } from '@/lib/billing/pricing-keys'
import { asAddonKey } from '@/lib/pricing/plans'
import { type ActionResult, ok, fail } from '@/lib/action-result'

// SPACE PLAN BILLING ACTIONS (Pricing P3, ADR-363; collapsed ADR-552). The client-callable seams for
// the space owner billing surface:
//   startSpacePlanCheckout / startSpaceLoadoutCheckout — begin a Stripe Checkout to buy/upgrade a space
//     plan (GATED on billingLive() + the per-plan switch inside the checkout; returns a clean error while
//     billing is OFF, so the CTA never fires a broken checkout).
//
// Both re-resolve the space + gate on canManage (the owner/admin/editor write authority) so a
// non-owner cannot start a checkout for someone else's space. No em dashes. The retired white-label lead
// capture was removed with the multi-tier UI (ADR-552).

/** Authorize the caller as a manager of `slug`'s space; returns { spaceId, brandName } or null. */
async function authorizeOwner(slug: string): Promise<{ spaceId: string; brandName: string } | null> {
  const caller = await getCallerProfile()
  const space = await getVisibleSpaceBySlug(slug, caller?.id ?? null)
  if (!space) return null
  const { canManage } = await resolveSpaceManageAccess(space, caller?.id ?? null, caller?.webRole)
  if (!canManage) return null
  return { spaceId: space.id, brandName: space.brandName ?? space.name }
}

/** Begin a Stripe Checkout for a space plan. GATED: createSpacePlanCheckout returns null unless
 *  billing is live AND the per-plan switch is on, so this returns a clean error (not a broken URL)
 *  while billing is OFF. Only the sold plans (business/nonprofit) resolve; retired names fail cleanly. */
export async function startSpacePlanCheckout(
  slug: string,
  plan: string,
  period: BillingPeriod = 'monthly',
): Promise<ActionResult<{ url: string }>> {
  const auth = await authorizeOwner(slug)
  if (!auth) return fail('You do not have access to manage this space.')
  const planKey = asSpacePlanKey(plan)
  if (!planKey) {
    return fail('That plan is not available to buy here.')
  }
  const url = await createSpacePlanCheckout(auth.spaceId, planKey, period)
  if (!url) return fail('Plan checkout is not available yet.')
  return ok({ url })
}

/** The base tiers the multi-item loadout checkout sells (ADR-552): Business runs on the Business base +
 *  the optional AI add-on; Nonprofit is the per-seat item. Both go through the SAME
 *  createSpaceLoadoutCheckout, so interval + seat count thread identically. */
const LOADOUT_PLANS = ['business', 'nonprofit'] as const
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
  const url = await createSpaceLoadoutCheckout(auth.spaceId, {
    plan: asLoadoutPlan(input.plan),
    addons,
    interval,
    seatQuantity: input.seatQuantity,
  })
  if (!url) return fail('Plan checkout is not available yet.')
  return ok({ url })
}
