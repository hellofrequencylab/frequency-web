// City / place autocomplete via Photon (https://photon.komoot.io) — the
// OpenStreetMap-backed geocoder. Free, no API key, CORS-enabled, so it runs
// straight from the browser and matches our key-free MapLibre/OpenFreeMap stack.
// We restrict results to populated places (city/locality/district) so "start
// typing your city and it autocompletes" returns places, not street addresses.
//
// The VENUE / ADDRESS typeahead is deliberately NOT here: it goes through our own
// server route (/api/geocode/venues → lib/events/venue-search), because Photon
// ignores a hard local filter and misses US house numbers, so a local street
// returned fuzzy GLOBAL matches. Server-side Nominatim honours a hard viewbox and
// has real US house numbers; `searchVenues` below is just the browser fetch to it.

export type PlaceSuggestion = {
  /** Human label, e.g. "Encinitas, California, United States". */
  label: string
  lat: number
  lng: number
}

/** Structured address fields Photon surfaces alongside the coordinates. Every
 *  field is optional — Photon returns what OSM knows for the matched feature, so a
 *  venue result may carry a street + postcode while a city result carries neither.
 *  Drives the venue typeahead, which fills the address inputs from a pick. */
export type PlaceResult = PlaceSuggestion & {
  /** The feature's own name (a venue, POI, or place), e.g. "Balboa Park". */
  name: string | null
  street: string | null
  city: string | null
  region: string | null // state / province
  country: string | null
  postalCode: string | null
}

const PHOTON_URL = 'https://photon.komoot.io/api/'

export async function searchPlaces(
  query: string,
  signal?: AbortSignal,
): Promise<PlaceSuggestion[]> {
  const q = query.trim()
  if (q.length < 2) return []

  const params = new URLSearchParams({ q, limit: '6', lang: 'en' })
  // Repeated `layer` params restrict to populated places (Photon convention).
  for (const layer of ['city', 'locality', 'district']) params.append('layer', layer)

  let res: Response
  try {
    res = await fetch(`${PHOTON_URL}?${params.toString()}`, { signal })
  } catch {
    return [] // network/abort — fail quietly, the UI just shows no suggestions
  }
  if (!res.ok) return []

  const data = (await res.json()) as {
    features?: Array<{
      geometry: { coordinates: [number, number] }
      properties: Record<string, string | undefined>
    }>
  }

  const seen = new Set<string>()
  const out: PlaceSuggestion[] = []
  for (const f of data.features ?? []) {
    const p = f.properties ?? {}
    const label = [p.name, p.state, p.country].filter(Boolean).join(', ')
    if (!label || seen.has(label)) continue
    seen.add(label)
    const [lng, lat] = f.geometry.coordinates
    out.push({ label, lat, lng })
  }
  return out
}

/**
 * Venue / address typeahead. Unlike searchPlaces (populated places only), this returns
 * businesses, POIs, and street addresses, with the structured parts so a pick can fill
 * venue + street + city + region + country + postal code AND drop the map pin.
 *
 * Runs entirely SERVER-SIDE via /api/geocode/venues (OpenStreetMap Nominatim with a
 * hard local-first cascade — see lib/events/venue-search). This browser function is
 * just the fetch: it forwards the typed query and an optional location `bias` (the
 * device's location, the event's pin, else the viewer's home) so a local street
 * ("6882 Embarcadero Ln, Carlsbad") surfaces the NEARBY address first and never a
 * same-named place in France or India. Same fail-quiet contract as searchPlaces:
 * network error / abort / non-OK / bad payload all resolve to [].
 */
export async function searchVenues(
  query: string,
  signal?: AbortSignal,
  bias?: { lat: number; lng: number } | null,
): Promise<PlaceResult[]> {
  const q = query.trim()
  if (q.length < 2) return []

  const params = new URLSearchParams({ q })
  if (bias && Number.isFinite(bias.lat) && Number.isFinite(bias.lng)) {
    params.set('lat', String(bias.lat))
    params.set('lng', String(bias.lng))
  }

  let res: Response
  try {
    res = await fetch(`/api/geocode/venues?${params.toString()}`, { signal })
  } catch {
    return [] // network/abort — fail quietly, the UI just shows no suggestions
  }
  if (!res.ok) return []

  try {
    const data = await res.json()
    return Array.isArray(data) ? (data as PlaceResult[]) : []
  } catch {
    return []
  }
}

// Metres → a friendly distance string for circle results.
export function formatDistance(meters: number): string {
  const miles = meters / 1609.344
  if (miles < 0.2) return 'right here'
  if (miles < 10) return `${miles.toFixed(1)} mi away`
  return `${Math.round(miles)} mi away`
}
