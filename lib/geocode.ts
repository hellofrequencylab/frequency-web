// City / place autocomplete via Photon (https://photon.komoot.io) — the
// OpenStreetMap-backed geocoder. Free, no API key, CORS-enabled, so it runs
// straight from the browser and matches our key-free MapLibre/OpenFreeMap stack.
// We restrict results to populated places (city/locality/district) so "start
// typing your city and it autocompletes" returns places, not street addresses.

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

// A street-and-house number line from Photon's parts: "12 Main Street" / "Main
// Street". OSM splits the number (housenumber) from the way (street).
function joinStreet(p: Record<string, string | undefined>): string | null {
  const line = [p.housenumber, p.street].filter(Boolean).join(' ').trim()
  return line || null
}

// A human label for a structured result: the feature's NAME or, for a plain address with no
// name, its street line (so "8950 Villa La Jolla Dr" shows instead of collapsing to just the
// city) — then the bits that disambiguate it (city, state, country). Dedupes repeats.
function structuredLabel(p: Record<string, string | undefined>): string {
  const head = p.name ?? joinStreet(p) ?? undefined
  const parts = [head, p.city, p.state, p.country].filter(Boolean) as string[]
  const seen = new Set<string>()
  return parts.filter((x) => (seen.has(x) ? false : (seen.add(x), true))).join(', ')
}

/**
 * Address / venue typeahead. Unlike searchPlaces (populated places only), this lets
 * Photon return venues, POIs, and street addresses too, and surfaces the structured
 * address parts so a pick can fill venue + street + city + region + country + postal
 * code AND drop the map pin. Same keyless Photon endpoint, same fail-quiet contract.
 */
export async function searchAddresses(
  query: string,
  signal?: AbortSignal,
  /** Optional location bias — Photon ranks results NEAR this point first, so "8950 Villa La
   *  Jolla" surfaces the La Jolla venue instead of a same-named street on the other coast.
   *  Pass the event's current pin, or the viewer's home location. */
  bias?: { lat: number; lng: number } | null,
): Promise<PlaceResult[]> {
  const q = query.trim()
  if (q.length < 2) return []

  // No `layer` filter here — we WANT venues / streets / POIs, not just cities. A larger limit
  // gives the local-bias re-ranking more candidates to pull the right venue up from.
  const params = new URLSearchParams({ q, limit: '10', lang: 'en' })
  if (bias && Number.isFinite(bias.lat) && Number.isFinite(bias.lng)) {
    params.set('lat', String(bias.lat))
    params.set('lon', String(bias.lng))
  }

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
  const out: PlaceResult[] = []
  for (const f of data.features ?? []) {
    const p = f.properties ?? {}
    const label = structuredLabel(p)
    if (!label || seen.has(label)) continue
    seen.add(label)
    const [lng, lat] = f.geometry.coordinates
    out.push({
      label,
      lat,
      lng,
      name: p.name ?? null,
      street: joinStreet(p),
      city: p.city ?? null,
      region: p.state ?? null,
      country: p.country ?? null,
      postalCode: p.postcode ?? null,
    })
  }
  return out
}

// Metres → a friendly distance string for circle results.
export function formatDistance(meters: number): string {
  const miles = meters / 1609.344
  if (miles < 0.2) return 'right here'
  if (miles < 10) return `${miles.toFixed(1)} mi away`
  return `${Math.round(miles)} mi away`
}
