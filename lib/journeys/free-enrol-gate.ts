// MAY THIS MEMBER TAKE THE FREE DOOR INTO A JOURNEY? (ADR-1397) Server-only.
//
// 🔴 THE GUARD THAT MAKES THE PAYWALL REAL. `adoptPlanAction` enrols anybody in any non-private
// Journey for nothing, and it is reachable as a plain form POST. Without this check, attaching a
// $444 price to Heart on Fire would change the BUTTON and nothing else: the old action would still
// be there, still free, still a valid POST target. A paywall that only exists in the UI is a
// decoration, and this is the one place that turns it into a rule.
//
// It also finally makes SEATS real. `journeyHasRoom` and `journey_plans.enroll_cap` have existed
// since ADR-838 with ZERO callers, so every seat count an author set was decorative too. The cap is
// checked here, at the free door, and at checkout start for the paid one -- both BEFORE money or a
// place is committed, never after.
//
// FAIL-SAFE ON THE CAP, FAIL-CLOSED ON THE PRICE. They point opposite ways on purpose: a broken
// enrolment COUNT should not lock a free Journey (the worst case is one seat over), while a broken
// PRICE lookup must never hand away a paid program. `getJourneyOffer` already reads a failure as
// free, so the price check is only as fail-closed as that read is honest; it is a single indexed
// lookup on a unique column, which is about as honest as a read gets.

import { createAdminClient } from '@/lib/supabase/admin'
import { getJourneyOffer } from './paid'
import { journeyHasRoom, JOURNEY_FULL_MESSAGE } from './journey-access'
import { checkJourneyTier } from './tier-gate'

export type FreeEnrolCheck = { ok: true } | { ok: false; error: string }

/** Copy for a Journey that costs money. Names the next step, never the wall (CONTENT-VOICE). */
export const JOURNEY_NEEDS_PURCHASE_MESSAGE = 'This Journey is paid. Open its page to get access.'

/**
 * May `profileId` enrol in `planId` without paying?
 *
 * `isOwner` is the author-or-manager escape: they are not buying their own program, and they must be
 * able to walk it to check it. Every other viewer meets the price and the cap.
 */
export async function checkFreeEnrol(
  planId: string,
  profileId: string,
  opts: { isOwner?: boolean } = {},
): Promise<FreeEnrolCheck> {
  const offer = await getJourneyOffer(planId)

  if (offer && !opts.isOwner) return { ok: false, error: JOURNEY_NEEDS_PURCHASE_MESSAGE }

  const tier = await checkJourneyTier(planId, profileId, { isOwner: opts.isOwner })
  if (!tier.ok) return { ok: false, error: tier.error }

  // Seats bind on the free door too, and for the owner as well: a full room is full. A Run's own cap
  // is enforced separately at the Run path, which has its own roster.
  const admin = createAdminClient()
  try {
    const [{ data: plan }, { count }] = await Promise.all([
      admin.from('journey_plans').select('enroll_cap').eq('id', planId).maybeSingle(),
      admin
        .from('journey_enrollments')
        .select('id', { count: 'exact', head: true })
        .eq('plan_id', planId)
        .is('completed_at', null),
    ])
    const enrollCap = (plan as { enroll_cap: number | null } | null)?.enroll_cap ?? null

    // An ALREADY-enrolled member re-adopting must never be refused for being in the room they are
    // already in. adoptPlan is idempotent, so this only matters for the message.
    const { count: mine } = await admin
      .from('journey_enrollments')
      .select('id', { count: 'exact', head: true })
      .eq('plan_id', planId)
      .eq('profile_id', profileId)
    if ((mine ?? 0) > 0) return { ok: true }

    if (!journeyHasRoom({ enrollCap, activeEnrollmentCount: count ?? 0 })) {
      return { ok: false, error: JOURNEY_FULL_MESSAGE }
    }
  } catch (error) {
    // Fail-safe: a broken count must not close a free Journey.
    console.error('[journeys] seat check failed, admitting', { planId, error })
  }

  return { ok: true }
}
