// Journey PUBLISH limits — the free-vs-paid lever on Journeys (the e-learning "program" upsell).
//
// The rule (owner decision, 2026-07-18):
//   • Anyone may DRAFT as many Journeys as they like (a draft is `visibility: 'private'`).
//   • A FREE owner may PUBLISH one Journey (live to their Space / by link). Publishing more, and
//     LISTING a Journey in the public library, requires a PAID owner.
//   • "Owner" is the Space a Journey is stamped to when it belongs to a Space, else the author
//     (a personal / root-space Journey), so the cap reads the right paid signal in both cases.
//
// PURE + framework-independent (no Supabase/Next imports), like lib/pricing/plans.ts and
// lib/journeys/rewards.ts, so it is trivially unit-testable. The IO (counting an owner's published
// Journeys, resolving the paid signal) lives at the call sites; this only decides yes/no from counts.

/** How many PUBLISHED Journeys a FREE owner may have. Paid owners are unlimited. */
export const FREE_PUBLISHED_JOURNEY_LIMIT = 1

/** The Journey visibility values (mirrors journey_plans.visibility CHECK). `private` = a draft;
 *  `unlisted` = published, reachable by the Space / a direct link but not in public discovery;
 *  `public` = listed in the public library. */
export type JourneyVisibility = 'private' | 'unlisted' | 'public'

/** Is this visibility a PUBLISHED state (anything past a private draft)? Both `unlisted` (live to
 *  the Space) and `public` (in the library) count toward the free cap. PURE. */
export function isPublishedVisibility(v: string | null | undefined): boolean {
  return v === 'unlisted' || v === 'public'
}

/** May an owner PUBLISH another Journey? Paid owners are unlimited; a free owner is capped at
 *  FREE_PUBLISHED_JOURNEY_LIMIT. `currentPublishedCount` is the count of the owner's OTHER
 *  already-published Journeys (exclude the one being published). PURE, fail-safe (a negative count
 *  reads as 0). */
export function canPublishAnotherJourney(input: { paid: boolean; currentPublishedCount: number }): boolean {
  if (input.paid) return true
  return Math.max(0, input.currentPublishedCount) < FREE_PUBLISHED_JOURNEY_LIMIT
}

/** May an owner LIST a Journey in the PUBLIC LIBRARY (visibility 'public')? Requires a paid owner.
 *  A free owner can still publish (unlisted) up to the cap, but the library is the paid lever. PURE. */
export function canListJourneyInLibrary(input: { paid: boolean }): boolean {
  return input.paid
}

/** Upsell copy for the free publish cap (CONTENT-VOICE: plain, warm, no em dashes, no narrated
 *  feelings). Shown when a free owner tries to publish past the cap. */
export const FREE_JOURNEY_CAP_MESSAGE =
  'Free spaces publish one Journey. Upgrade to publish more and list them in the library.'

/** Upsell copy for the library-listing gate (a free owner trying to go public). */
export const LIBRARY_LISTING_PAID_MESSAGE =
  'Listing a Journey in the public library is a paid feature. Upgrade to reach the whole community.'
