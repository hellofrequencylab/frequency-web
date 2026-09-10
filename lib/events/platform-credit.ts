/**
 * THE HOUSE ACCOUNT IS NOT A BYLINE.
 *
 * Owner, 2026-09-10: *"Remove organized by Frequency and posted by Frequency from all events. Only
 * include the posted by tag if it was posted by a user and handed off to a host."*
 *
 * Frequency posts and seeds a great many events, and every one of them was carrying the platform's
 * own name back to the reader twice — once as `· organized by Frequency` on the hosted-by line and
 * the Host rail card, once as `Posted by Frequency` beneath it. Neither tells a guest anything: the
 * site they are already on is not a credit. A credit is for a PERSON who did something a reader
 * would want to know about, which is exactly the hand-off case the owner names — a member finds a
 * gathering, posts it, and a real host takes it over.
 *
 * So this module answers one question in one place: is this attribution the platform talking about
 * itself? Both readers of that answer (the identity line and the Host rail card) consult it, so the
 * page and the rail can never disagree about whose name is worth printing.
 *
 * 🔴 DISPLAY ONLY. `events.posted_by_profile_id` and `events.host_id` are untouched by anything
 * here: the send-to-host, claim and Zap-reward flows all key off those columns and must keep
 * working for a seeded listing whose credit no longer renders. Suppressing a byline is not
 * unsetting a relationship.
 */

/** The house account's handle. One spelling, matched case-insensitively at the seam. */
export const PLATFORM_HANDLE = 'frequency'

/**
 * True when this handle is the platform's own house account.
 *
 * Matched on HANDLE rather than display name: a display name is editable copy and drifts, a handle
 * is the identity. Case-folded because a handle is compared, not rendered.
 */
export function isPlatformAccount(handle: string | null | undefined): boolean {
  return typeof handle === 'string' && handle.trim().toLowerCase() === PLATFORM_HANDLE
}

/**
 * Should an "organized by <name>" credit render for this organizer?
 *
 * No for the house account, no when there is no organizer at all. The caller still decides WHERE
 * the credit goes; this only answers whether it is worth printing.
 */
export function showsOrganizerCredit(
  organizer: { handle: string } | null | undefined,
): boolean {
  return !!organizer && !isPlatformAccount(organizer.handle)
}
