// MEMBER LEADERSHIP GATES — the server-side seam for the Member/Crew line (ADR-908).
//
// The line is FIRST ONE FREE: a free Member does each act of leading ONCE (host 1 Circle, publish 1
// Journey, publish 3 Practices, run 2 active events), and Crew does it repeatedly, publicly, and for
// money. Nothing is walled; everything is metered. This module is the ONE place a server action asks
// "may this member do this", so the answer can never drift between the surfaces that ask.
//
// It is the personal-axis sibling of lib/spaces/function-access.ts (the Space plan seam): a thin,
// server-only composition of the two PURE resolvers the pricing layer already owns —
// `featureAllowed` (lib/pricing/gates.ts, the on/off ladder) and `withinAllowance`
// (lib/pricing/feature-meters.ts, the quantity ladder) — plus the one flag read they share.
//
// 🔴 OFF PRESERVES CURRENT BEHAVIOR (the ADR-370 invariant). Both underlying resolvers short-circuit
// to GRANT while `featureGatesLive()` is false, so every helper here returns true today and each call
// site behaves exactly as it does now. The gates begin to bite only when billing is live AND the beta
// grace window has ended (ADR-874). Every read is additionally FAIL-SAFE: an error grants rather than
// locks someone out of their own community.
//
// ⚠️ WHAT DOES NOT BELONG HERE: a capability already enforced on a PURE paid check that bites TODAY.
// Routing one of those through `featureAllowed` would LOOSEN it (grant-all until the grace window
// ends), which is a regression dressed as a refactor. `journey_library_list` is exactly that case:
// lib/journeys/publish-gate.ts already enforces it via `canListJourneyInLibrary({ paid })` and must
// keep doing so. Its FEATURE_GATES entry exists for the DERIVED pricing surfaces (/pricing reads the
// gate map), not for enforcement — the same split `space_full_website` uses.
//
// The tier passed in must be the caller's REAL tier (`getCallerProfile().realMembershipTier`, ADR-414),
// never the beta-overridden display tier, so a beta comp cannot silently lift a creation cap.

import type { EntitlementTier } from '@/lib/core/entitlement'
import { featureAllowed } from './gates'
import { allowanceAt, withinAllowance } from './feature-meters'
import { featureGatesLive } from './settings'

/** The ON/OFF leadership unlocks (FEATURE_GATES, tier axis). A quantity cannot express these. */
export type MemberLeadershipGate = 'event_paid_tickets' | 'personal_payouts' | 'entry_points'

/** The METERED leadership quantities (feature-meters.ts, tier axis). First one free, then Crew.
 *
 *  `practice_publish` is deliberately NOT here: `practice.create` (lib/core/capabilities.ts) already
 *  enforces it live as a paid-tier door, so its meter row exists only to DISPLAY that on /pricing.
 *  Adding a second enforcement path would either duplicate the rule or, worse, loosen it. */
export type MemberLeadershipMeter = 'circle_host' | 'event_create'

/**
 * Is this ON/OFF leadership capability allowed for a member's tier? FAIL-SAFE to allowed.
 *
 * Returns true for everyone while the gates are not live, so wiring this into an action is a NO-OP
 * today and starts enforcing on the grace date without a second change.
 */
export async function memberCanLead(
  gate: MemberLeadershipGate,
  tier: EntitlementTier | null | undefined,
): Promise<boolean> {
  try {
    return await featureAllowed(gate, { tier: tier ?? 'free' }, { gatesLive: await featureGatesLive() })
  } catch {
    // A gate we cannot resolve must never lock a member out of their own Circle.
    return true
  }
}

/**
 * Is a member still within their allowance for a metered leadership quantity? FAIL-SAFE to allowed.
 *
 * `currentCount` is how many they ALREADY have (excluding the one being created), so the check reads
 * "would this be one too many". Returns true for everyone while the gates are not live.
 */
export async function memberWithinLeadershipAllowance(
  meter: MemberLeadershipMeter,
  tier: EntitlementTier | null | undefined,
  currentCount: number,
): Promise<boolean> {
  try {
    const gatesLive = await featureGatesLive()
    // withinAllowance compares usage <= allowance, so pass the count INCLUDING the new one.
    return withinAllowance(meter, tier ?? 'free', Math.max(0, currentCount) + 1, { gatesLive })
  } catch {
    return true
  }
}

/** The allowance a tier gets on a metered leadership quantity (a cap, or null = unlimited). PURE
 *  passthrough, exposed so a surface can show "1 of 1 used" without importing the meter module. */
export function memberLeadershipAllowance(
  meter: MemberLeadershipMeter,
  tier: EntitlementTier | null | undefined,
): number | null {
  return allowanceAt(meter, tier ?? 'free')
}

// ── The upsell copy (docs/CONTENT-VOICE.md: plain, warm, no em dashes, no urgency) ──────────────────
// Crew is the people who run the place, so every line names what Crew DOES and what the member has
// already done. None of these narrate the reader's feelings, and none imply the member is locked out
// of Frequency: they are only at the end of a free allowance.

export const CIRCLE_HOST_CAP_MESSAGE =
  'You are hosting the Circle your free membership includes. Join Crew to host more.'

export const EVENT_CREATE_CAP_MESSAGE =
  'You have as many events running as your free membership includes. Join Crew to run more, and to set up a series.'

export const EVENT_PAID_TICKETS_MESSAGE =
  'Free and RSVP events are yours to run. Charging for one is part of Crew.'

export const PERSONAL_PAYOUTS_MESSAGE =
  'Taking payments for what you run is part of Crew. Join Crew to connect a payout account.'

export const ENTRY_POINTS_MESSAGE =
  'Entry points, the QR codes and flyers for the thing you run, are part of Crew.'
