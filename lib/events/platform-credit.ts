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

/** A hosting Space as an embed reads it: `host_space:spaces!host_space_id ( name, brand_name, status )`. */
export type HostSpaceEmbed = { name: string | null; brand_name: string | null; status?: string | null } | null

/**
 * The ONE short host label a card or a share image prints.
 *
 * Owner, 2026-10-16: *"Attribute all event hosting from the group events to the appropriate group or
 * subgroup. Right now it says Frequency is the host on all of them."* A seeded Space's events carry
 * the house account as `host_id` and the chapter as `host_space_id`; the detail page already credits
 * the Space, but the cards printed the person. So: an active hosting Space leads (its brand name
 * first, as the detail page reads it), then the person host, and never the house account.
 */
export function eventHostLabel(
  host: { display_name: string | null; handle?: string | null } | null | undefined,
  hostSpace: HostSpaceEmbed | undefined,
): string | null {
  if (hostSpace && (hostSpace.status == null || hostSpace.status === 'active')) {
    const name = (hostSpace.brand_name ?? hostSpace.name ?? '').trim()
    if (name) return name
  }
  if (!host || isPlatformAccount(host.handle)) return null
  return host.display_name?.trim() || null
}
