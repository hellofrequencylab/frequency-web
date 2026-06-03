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

// Metres → a friendly distance string for circle results.
export function formatDistance(meters: number): string {
  const miles = meters / 1609.344
  if (miles < 0.2) return 'right here'
  if (miles < 10) return `${miles.toFixed(1)} mi away`
  return `${Math.round(miles)} mi away`
}
