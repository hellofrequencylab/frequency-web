// SPACE MEMBERSHIP DUNNING DISPLAY (LIVE-429 / ADR-1478).
//
// The webhook already writes space_memberships.payment_status (lib/billing/space-subscriptions.ts).
// Access still ignores that column on purpose (private.is_space_paid_member, isSpacePaidMember,
// ADR-1092): a past_due member stays a member while Stripe retries, and a free join is often
// status=active with payment_status=pending. What was missing is the SHOWING: Crew has
// PastDueBanner on Settings, and Space dues had nowhere to appear.
//
// PURE only. The reader lives in lib/spaces/memberships.ts so this file does not grow
// the admin-client ratchet (ADR-923). Display only: it does not revoke Circle access,
// Journey enrol, or member tickets. pending is never past due.

export type SpaceMembershipPayment = 'pending' | 'active' | 'past_due' | 'canceled'

export type PastDueSpaceMembership = {
  membershipId: string
  spaceId: string
  spaceName: string
  spaceSlug: string
  tierName: string
}

/** PURE. Only Stripe's past_due recovery state. pending is the free-join default. */
export function isPastDueSpaceMembership(paymentStatus: string | null | undefined): boolean {
  return paymentStatus === 'past_due'
}

export function spacePastDueMemberTitle(): string {
  return 'Your last payment did not go through'
}

export function spacePastDueMemberBody(spaceName: string): string {
  return `We could not charge your card for ${spaceName}. You are still a member. Update the card Stripe emailed you about, or leave from the Space.`
}

export function spacePastDueOwnerLabel(): string {
  return 'Payment failed'
}
