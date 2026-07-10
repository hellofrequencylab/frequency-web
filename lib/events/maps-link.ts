// Build a Google Maps search link for an event's venue. One https URL works
// everywhere: desktop web opens the map site, iOS/Android hand it to the native
// Maps app. Pure string helper — safe to import from server or client.

/** A Maps search URL for a free-form address/venue query, or null for blank input. */
export function mapsSearchUrl(query: string | null | undefined): string | null {
  const q = query?.trim()
  if (!q) return null
  return `https://maps.google.com/?q=${encodeURIComponent(q)}`
}

/** Compose the best available venue query: the structured address parts when the
 *  event has them, else the free-text location line. */
export function eventMapsQuery(parts: {
  venueName?: string | null
  street?: string | null
  city?: string | null
  region?: string | null
  postalCode?: string | null
  location?: string | null
}): string | null {
  const structured = [parts.venueName, parts.street, parts.city, parts.region, parts.postalCode]
    .map((p) => p?.trim())
    .filter(Boolean)
    .join(', ')
  return structured || parts.location?.trim() || null
}
