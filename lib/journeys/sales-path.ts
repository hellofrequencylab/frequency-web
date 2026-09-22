// THE JOURNEY SALES URL (ADR-1404).
//
// One offer, many doors, one pitch. Market cards, Space Shop cards, share links and the leftover
// `/market/<product uuid>` all resolve to the Journey slug. `/learn` is the course, not a listing.
//
// Signed-out visitors hitting the member path are handed the public twin by TWIN_RULES
// (`/discover/journeys/<slug>`), which is already the canonical URL. Signed-in visitors stay on
// `/journeys/<slug>`, which is the till (ADR-1400). A public page must never link at `/market/<id>`
// for a Journey: that route now redirects here, and a loop would be the listing bug coming back.

export function journeyMemberPath(slug: string): string {
  return `/journeys/${slug}`
}

export function journeyPublicPath(slug: string): string {
  return `/discover/journeys/${slug}`
}

export function journeyLearnPath(slug: string): string {
  return `/journeys/${slug}/learn`
}

/** Where a signed-out visitor goes to buy: sign in, then the till. */
export function journeyBuySignInPath(slug: string): string {
  return `/sign-in?next=${encodeURIComponent(journeyMemberPath(slug))}`
}

// ── THE WELCOME (PROG-GD5) ───────────────────────────────────────────────────────────────────────
//
// The page a buyer lands on once the Journey is theirs: it shows what they bought and opens onto
// the rest of Frequency. `journeyWelcomePath` is the member page itself. `journeyWelcomeDoor` is
// how a STRANGER reaches it: the sign-in page with the welcome as `next`, because the magic-link
// tap is the proof that the address that paid is the address that signs in (ADR-854, and the
// doctrine written out in lib/events/guest-ticket-email.ts). It is the same shape the guest ticket
// receipt already builds, `/sign-in?next=<path>&email=<address>`, and it is what the guest's Stripe
// success_url and the receipt's button both point at, so the two doors cannot drift apart.
//
// 🔴 `next` IS NOT URL-ENCODED HERE, unlike journeyBuySignInPath. Stripe substitutes the literal
// `{CHECKOUT_SESSION_ID}` in success_url; encoded braces (%7B…%7D) are not substituted and the
// settle backstop would receive the placeholder as a session id. A slug is [a-z0-9-] and a Checkout
// Session id is [A-Za-z0-9_], so the bare value is safe in a query string, and the sign-in page
// only ever accepts a `next` that starts with a single `/`.

/** The Checkout Session placeholder Stripe fills in on the success redirect. */
export const CHECKOUT_SESSION_PLACEHOLDER = '{CHECKOUT_SESSION_ID}'

/** The member welcome for a Journey, carrying the Checkout Session id when there is one so the
 *  page can settle the order itself if the webhook has not landed yet. */
export function journeyWelcomePath(slug: string, sessionId?: string | null): string {
  const base = `${journeyMemberPath(slug)}/welcome`
  return sessionId ? `${base}?session_id=${sessionId}` : base
}

/** The one step between a paid stranger and their Journey: sign in with the address that paid. */
export function journeyWelcomeDoor(
  slug: string,
  opts: { sessionId?: string | null; email?: string | null } = {},
): string {
  const email = opts.email ? `&email=${encodeURIComponent(opts.email)}` : ''
  return `/sign-in?next=${journeyWelcomePath(slug, opts.sessionId)}${email}`
}

/** True when `path` is a Journey welcome, so a caller can recognise the destination it built. */
export function isJourneyWelcomePath(path: string | null | undefined): boolean {
  return typeof path === 'string' && /^\/journeys\/[^/?]+\/welcome(?:\?|$)/.test(path)
}
