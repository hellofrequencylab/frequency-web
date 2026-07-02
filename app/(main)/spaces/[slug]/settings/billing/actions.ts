'use server'

import type { Json } from '@/lib/database.types'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { resolveSpaceManageAccess, getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { createSpacePlanCheckout, createSpaceLoadoutCheckout } from '@/lib/billing/space-plan-checkout'
import { asSpacePlanKey, type BillingInterval, type BillingPeriod } from '@/lib/billing/pricing-keys'
import { asAddonKey } from '@/lib/pricing/plans'
import { setSpaceSeatQuantity } from '@/lib/spaces/seats'
import { type ActionResult, ok, fail } from '@/lib/action-result'

// SPACE PLAN BILLING ACTIONS (Pricing P3, ADR-363/364). Two client-callable seams for the space
// owner billing surface:
//   startSpacePlanCheckout — begin a Stripe Checkout to buy/upgrade a space plan (GATED on
//     billingLive() + the per-plan switch inside createSpacePlanCheckout; returns a clean error while
//     billing is OFF, so the picker never fires a broken checkout).
//   requestWhitelabel — a high-touch LEAD capture (NOT a Stripe checkout). White-label is the
//     deliberately-expensive door ($2,000 setup + $299/mo); per the network-effect strategy it is
//     sold by a human, so a request writes a `contacts` lead an operator follows up on (ADR-364).
//
// Both re-resolve the space + gate on canManage (the owner/admin/editor write authority) so a
// non-owner cannot start a checkout or open a lead for someone else's space. No em dashes.

/** Authorize the caller as a manager of `slug`'s space; returns { spaceId, ownerEmail } or null. */
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
 *  while billing is OFF. White-label is NOT sold here (it is a lead flow, requestWhitelabel). */
export async function startSpacePlanCheckout(
  slug: string,
  plan: string,
  period: BillingPeriod = 'monthly',
): Promise<ActionResult<{ url: string }>> {
  const auth = await authorizeOwner(slug)
  if (!auth) return fail('You do not have access to manage this space.')
  const planKey = asSpacePlanKey(plan)
  if (!planKey || planKey === 'whitelabel') {
    return fail('That plan is not available to buy here.')
  }
  const url = await createSpacePlanCheckout(auth.spaceId, planKey, period)
  if (!url) return fail('Plan checkout is not available yet.')
  return ok({ url })
}

/** The base tiers the multi-item loadout checkout sells (ADR-460/472): Pro + Business run on the Pro
 *  base + add-ons framing; Nonprofit is the per-seat item; Organization is the flat org item. All four
 *  go through the SAME createSpaceLoadoutCheckout, so interval + seat count thread identically. */
const LOADOUT_PLANS = ['pro', 'business', 'nonprofit', 'organization'] as const
type LoadoutPlan = (typeof LOADOUT_PLANS)[number]
function asLoadoutPlan(plan: string | undefined): LoadoutPlan {
  return (LOADOUT_PLANS as readonly string[]).includes(plan ?? '') ? (plan as LoadoutPlan) : 'pro'
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

/** Set a Space's LICENSED seat count (spaces.seat_quantity), the figure the Team add-on / Nonprofit
 *  seat item bills (Phase D, ADR-465). DOUBLE-GATED server-side: it re-resolves the Space and requires
 *  the caller be a space ADMIN (canManageMembers, owner / admin) — seats are money config, so editors
 *  who can edit content cannot change the bill. The raw setter (setSpaceSeatQuantity) clamps to >= 0;
 *  the base allowance (the owner's seat) is added on read. Returns the saved licensed count. */
export async function setSeatQuantity(slug: string, seatQuantity: number): Promise<ActionResult<{ seatQuantity: number }>> {
  const caller = await getCallerProfile()
  const space = await getVisibleSpaceBySlug(slug, caller?.id ?? null)
  if (!space) return fail('You do not have access to manage this space.')
  // Space-admin gate (owner / admin), not merely canManage (editor+): seats are billing config.
  const caps = await getSpaceCapabilities(space, caller?.id ?? null)
  if (!caps.canManageMembers) return fail('Only a space admin can change the seat count.')

  const n = typeof seatQuantity === 'number' && Number.isFinite(seatQuantity) ? Math.max(0, Math.floor(seatQuantity)) : 0
  const okWrite = await setSpaceSeatQuantity(space.id, n)
  if (!okWrite) return fail('Could not save the seat count. Try again.')
  return ok({ seatQuantity: n })
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

/** Capture a white-label interest LEAD (ADR-364). Writes a `contacts` row tagged
 *  source='whitelabel_request' with the space context in meta, the same seam the beta waitlist uses
 *  (app/(marketing)/beta/actions.ts). NO Stripe call, NO charge: white-label is sold high-touch by a
 *  human. consent_state stays 'unknown' (they have not opted into marketing). FAIL-SAFE: any DB error
 *  returns a clean error. */
export async function requestWhitelabel(
  slug: string,
  input: { email: string; note?: string },
): Promise<ActionResult<void>> {
  const auth = await authorizeOwner(slug)
  if (!auth) return fail('You do not have access to manage this space.')

  const email = (input.email || '').trim().toLowerCase()
  const note = (input.note || '').trim() || null
  if (!EMAIL_RE.test(email)) return fail('Please enter a valid email address.')

  const admin = createAdminClient()
  const nowIso = new Date().toISOString()

  // `contacts` is reached untyped (not in the generated DB types yet, ADR-246), mirroring the beta
  // waitlist + lib/studio/contacts.ts.
  try {
    const { data: existing } = await admin
      .from('contacts')
      .select('id, meta')
      .ilike('email', email)
      .maybeSingle()

    const existingMeta = (existing?.meta && typeof existing.meta === 'object' ? existing.meta : {}) as Record<string, unknown>
    const meta = {
      ...existingMeta,
      whitelabel_request: true,
      whitelabel_space_id: auth.spaceId,
      whitelabel_space_name: auth.brandName,
      whitelabel_note: note,
      whitelabel_requested_at: nowIso,
    } as unknown as Json

    if (existing?.id) {
      await admin
        .from('contacts')
        .update({ source: 'whitelabel_request', meta, updated_at: nowIso })
        .eq('id', existing.id)
    } else {
      await admin.from('contacts').insert({
        email,
        consent_state: 'unknown',
        source: 'whitelabel_request',
        meta,
      })
    }
  } catch (err) {
    console.error('[whitelabel] failed to record request:', err)
    return fail('Something went wrong. Please try again.')
  }

  return ok()
}
