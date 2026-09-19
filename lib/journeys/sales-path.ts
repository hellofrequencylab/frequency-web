// THE JOURNEY SALES URL (ADR-1402).
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
