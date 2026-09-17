// A JOURNEY THAT COSTS MONEY (ADR-1397): the read side, plus the pure rules the sales page renders.
//
// One canonical product per Journey (`commerce_products.journey_plan_id`, unique where not archived),
// because every platform that sells one program through several storefronts keeps ONE record and ONE
// seat pool. A storefront is presentation and attribution, never a copy — duplicate the product and
// you duplicate the seat counter, which on a 12-seat cohort is an oversell.
//
// 🔴 SCARCITY IS DERIVED, NEVER AUTHORED. `seatsRemaining` counts real enrolments against the
// author's real `enroll_cap`; nothing here reads a number a host typed. The FTC's 2022 dark-patterns
// report names false urgency specifically — "only 1 left" when supply is ample, timers that reset —
// and a platform hosting other people's offers is the party that carries that risk. Making the
// number underivable-by-hand is the design that cannot be misused, which beats a policy asking
// people not to.

import { createAdminClient } from '@/lib/supabase/admin'

/** Below this many seats left, a sales page may say how many. */
export const SEATS_VISIBLE_AT = 5

/** The sellable face of a Journey, or null when it is free. */
export interface JourneyOffer {
  productId: string
  priceCents: number
  currency: string
  /** `journey_plans.enroll_cap`, the ONE seat pool. Null = uncapped. */
  enrollCap: number | null
  /** Live enrolments counted against that pool. */
  enrolled: number
}

/** Seats left, or null when the Journey is uncapped. Never negative. PURE. */
export function seatsRemaining(offer: { enrollCap: number | null; enrolled: number }): number | null {
  if (offer.enrollCap == null || offer.enrollCap <= 0) return null
  return Math.max(0, offer.enrollCap - Math.max(0, offer.enrolled))
}

/** Is the Journey sold out? Uncapped is never sold out. PURE. */
export function isSoldOut(offer: { enrollCap: number | null; enrolled: number }): boolean {
  const left = seatsRemaining(offer)
  return left !== null && left === 0
}

/**
 * The seat line a sales page shows, or null to say nothing.
 *
 * ⚠️ IT STAYS QUIET WHILE THERE IS PLENTY, and that is the decision worth stating. "2 of 12 taken"
 * early in an enrolment window reads as *nobody wants this*, so a count shown from seat one
 * discourages exactly the buyers it is meant to move. It surfaces only at SEATS_VISIBLE_AT, where it
 * is true, useful and encouraging at once. PURE.
 */
export function seatLine(offer: { enrollCap: number | null; enrolled: number }): string | null {
  const left = seatsRemaining(offer)
  if (left === null) return null
  if (left === 0) return 'Full'
  if (left > SEATS_VISIBLE_AT) return null
  return left === 1 ? '1 spot left' : `${left} spots left`
}

/** The offer attached to a Journey, or null when nothing sells it. FAIL-SAFE: any read error reads
 *  as free, because a broken lookup must never turn a working free Journey into a paywall. */
export async function getJourneyOffer(planId: string): Promise<JourneyOffer | null> {
  const admin = createAdminClient()
  try {
    // Typed: journey_plan_id landed in lib/database.types.ts with this change, so the ADR-246
    // untyped seam this module was born with never had to survive a single commit.
    const { data: row } = await admin
      .from('commerce_products')
      .select('id, price_cents, currency')
      .eq('journey_plan_id', planId)
      .eq('status', 'active')
      .maybeSingle()
    if (!row) return null

    const [{ data: plan }, { count }] = await Promise.all([
      admin.from('journey_plans').select('enroll_cap').eq('id', planId).maybeSingle(),
      admin
        .from('journey_enrollments')
        .select('id', { count: 'exact', head: true })
        .eq('plan_id', planId)
        .is('completed_at', null),
    ])

    return {
      productId: row.id,
      priceCents: row.price_cents,
      currency: row.currency ?? 'usd',
      enrollCap: (plan as { enroll_cap: number | null } | null)?.enroll_cap ?? null,
      enrolled: count ?? 0,
    }
  } catch (error) {
    console.error('[journeys] offer lookup failed', { planId, error })
    return null
  }
}
