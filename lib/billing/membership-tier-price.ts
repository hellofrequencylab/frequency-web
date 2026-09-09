// THE MEMBERSHIP TIER PRICE FLOOR (LIVE-223, the self-grant half).
//
// Under the new model a paid membership grants the member the Crew tier (lib/billing/crew-grants.ts).
// That makes the PRICE of a membership tier a platform-level number rather than purely the operator's
// business: a tier priced at a cent is not a membership, it is a switch that turns Crew on. The
// take-rate guard (LIVE-224) is what makes the ruling safe — a granted Crew never buys the network
// rate down — and this is the second, softer wall in front of it.
//
// PURE + framework-independent, like the rest of the pricing primitives, so the floor is one number
// with one test rather than a rule half-remembered at three call sites.
//
// 🔴 NOT YET WIRED INTO THE WRITE. The write is `setMembershipTiers` in lib/spaces/memberships.ts,
// which another agent owns in this change. Wiring is one call inside its normalize step, beside the
// existing plan wall:
//
//     const priceError = membershipTierPriceError(t.priceCents)
//     if (priceError) return fail(priceError)
//
// Until then this floor is advisory. Note what is NOT deferred with it: the grant path already
// refuses a zero-price tier outright, and the `entitlement_grants_no_self_grant` trigger refuses the
// row in the database, so the entitlement cannot be minted by a free tier regardless of this file.

/** A tier priced at zero is a FREE tier, which is always allowed: it grants no Crew and it is how a
 *  Space runs an open membership. The floor applies only once a tier starts charging. */
export const FREE_TIER_PRICE_CENTS = 0

/**
 * The least a PAID membership tier may charge, in cents.
 *
 * $3/month. The number is deliberately low: the ruling is "any price grants Crew", and a high floor
 * would be a second pricing policy smuggled in as a guard. It exists to stop the degenerate case (a
 * tier that costs less than the card fee on it) rather than to shape what an operator may charge.
 * A Stripe card charge costs roughly 30c + 2.9%, so anything under a dollar is mostly fee; $3 keeps
 * the smallest real membership real.
 */
export const MIN_PAID_TIER_PRICE_CENTS = 300

/** Is this a valid membership tier price: free, or at or above the paid floor? PURE. */
export function isValidTierPrice(priceCents: number | null | undefined): boolean {
  if (!Number.isFinite(priceCents ?? NaN)) return false
  const cents = Math.trunc(priceCents as number)
  if (cents < 0) return false
  return cents === FREE_TIER_PRICE_CENTS || cents >= MIN_PAID_TIER_PRICE_CENTS
}

/**
 * The member-facing reason a tier price is refused, or null when it is fine. Voice: plain, no em
 * dashes, says the number rather than the rule (docs/CONTENT-VOICE.md).
 */
export function membershipTierPriceError(priceCents: number | null | undefined): string | null {
  if (isValidTierPrice(priceCents)) return null
  const dollars = (MIN_PAID_TIER_PRICE_CENTS / 100).toFixed(2).replace(/\.00$/, '')
  return `A paid membership starts at $${dollars}. Set it to $0 to keep this tier free.`
}
