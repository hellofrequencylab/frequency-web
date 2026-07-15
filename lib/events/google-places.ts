import 'server-only'

import type { PlaceResult } from '@/lib/geocode'
import type { VenueBias } from '@/lib/events/venue-search'

// Google Places venue / address autocomplete (server-side, keyed).
//
// WHY THIS EXISTS: the keyless OSM Nominatim path is our default and has no billing,
// but its US house-number coverage and same-metro disambiguation are weak ("7302 El
// Fuerte dr" in Carlsbad surfaced a street-only "Fuerte Drive" in La Mesa). When a
// GOOGLE_MAPS_API_KEY is present we prefer Google Places, which nails US house numbers
// and honours a location bias, and fall back to Nominatim on ANY Google failure.
//
// SERVER-SIDE ONLY. The key is secret — it is read from process.env here and never
// leaves the server. The /api/geocode/venues route is the sole caller; the browser
// only ever sees the mapped PlaceResult[] it returns.
//
// FAIL-SAFE contract: no key, a transport error, a non-OK response, a REQUEST_DENIED /
// OVER_QUERY_LIMIT status, or an unparseable body all resolve to `null` — the signal to
// the caller to fall back to Nominatim. A successful call with no matches resolves to
// `[]`. This function NEVER throws.

const AUTOCOMPLETE_URL = 'https://maps.googleapis.com/maps/api/place/autocomplete/json'
const DETAILS_URL = 'https://maps.googleapis.com/maps/api/place/details/json'

// Place Details is billed per call, so we only resolve coordinates for the top few
// predictions rather than every one Autocomplete returns.
const MAX_DETAILS = 6
const REQUEST_TIMEOUT_MS = 5000

// A Google Places status that means "the request itself is fine, there just are no
// matches" — a legitimate empty result, NOT a provider failure, so it does NOT fall back.
const EMPTY_STATUSES = new Set(['ZERO_RESULTS', 'NOT_FOUND'])

type AutocompletePrediction = { place_id?: string }
type AutocompleteResponse = { status?: string; predictions?: AutocompletePrediction[] }

type AddressComponent = { long_name?: string; short_name?: string; types?: string[] }
type PlaceDetails = {
  geometry?: { location?: { lat?: number; lng?: number } }
  formatted_address?: string
  name?: string
  address_components?: AddressComponent[]
}
type DetailsResponse = { status?: string; result?: PlaceDetails }

/** GET `url` with a timeout and the caller's abort signal, parsed as JSON. Throws on
 *  any transport error, timeout, abort, or non-OK response (the caller catches → null). */
async function getJson(url: URL, signal?: AbortSignal): Promise<unknown> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  const onAbort = () => controller.abort()
  signal?.addEventListener('abort', onAbort)
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
      cache: 'no-store',
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.json()
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onAbort)
  }
}

/** Pull the first address_component whose `types` include `type`. */
function pick(components: AddressComponent[], type: string): AddressComponent | undefined {
  return components.find((c) => c.types?.includes(type))
}

/** Map one resolved Place Details payload → our PlaceResult, or null if it has no point. */
function toPlaceResult(d: PlaceDetails): PlaceResult | null {
  const lat = Number(d.geometry?.location?.lat)
  const lng = Number(d.geometry?.location?.lng)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null

  const comps = d.address_components ?? []
  const houseNumber = pick(comps, 'street_number')?.long_name ?? null
  const route = pick(comps, 'route')?.long_name ?? null
  const street = [houseNumber, route].filter(Boolean).join(' ').trim() || null
  const city =
    pick(comps, 'locality')?.long_name ??
    pick(comps, 'postal_town')?.long_name ??
    pick(comps, 'sublocality')?.long_name ??
    null
  const region = pick(comps, 'administrative_area_level_1')?.long_name ?? null
  const country = pick(comps, 'country')?.long_name ?? null
  const postalCode = pick(comps, 'postal_code')?.long_name ?? null

  // A POI carries its own name; a plain street address's `name` from Google is usually the
  // street line, so fall back to the parsed street so the row never collapses to a city.
  const name = d.name?.trim() || street || null
  // Prefer Google's human formatted_address for the display label; else construct one.
  const constructed = [name ?? street, city, region, country]
    .filter(Boolean)
    .filter((x, i, arr) => arr.indexOf(x) === i)
    .join(', ')
  const label = d.formatted_address?.trim() || constructed || name || ''

  return { label, lat, lng, name, street, city, region, country, postalCode }
}

/**
 * Google Places venue / address autocomplete → PlaceResult[] (the SAME shape the
 * Nominatim `searchVenues` returns), or `null` on any failure so the caller can fall
 * back to Nominatim. Two-step: Autocomplete for predictions, then Place Details on the
 * top few to resolve coordinates + structured address parts. Never throws.
 *
 * The key is read from GOOGLE_MAPS_API_KEY here (server only); when it is unset this
 * returns `null` immediately so the route uses the keyless path.
 */
export async function googlePlacesSearch(
  query: string,
  bias?: VenueBias | null,
  signal?: AbortSignal,
): Promise<PlaceResult[] | null> {
  const key = process.env.GOOGLE_MAPS_API_KEY
  if (!key) return null

  const q = query.trim()
  if (q.length < 2) return []

  try {
    // 1) Autocomplete — US-scoped, biased to a 30km circle around the bias when we have one.
    const acUrl = new URL(AUTOCOMPLETE_URL)
    acUrl.searchParams.set('input', q)
    acUrl.searchParams.set('key', key)
    acUrl.searchParams.set('components', 'country:us')
    if (bias && Number.isFinite(bias.lat) && Number.isFinite(bias.lng)) {
      acUrl.searchParams.set('locationbias', `circle:30000@${bias.lat},${bias.lng}`)
    }
    const ac = (await getJson(acUrl, signal)) as AutocompleteResponse
    const status = ac.status ?? 'UNKNOWN'
    if (EMPTY_STATUSES.has(status)) return []
    if (status !== 'OK') return null // REQUEST_DENIED / OVER_QUERY_LIMIT / … → fall back

    const placeIds = (ac.predictions ?? [])
      .map((p) => p.place_id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0)
      .slice(0, MAX_DETAILS)
    if (placeIds.length === 0) return []

    // 2) Place Details for each prediction (parallel) to resolve coordinates + address parts.
    const details = await Promise.all(
      placeIds.map(async (placeId) => {
        const dUrl = new URL(DETAILS_URL)
        dUrl.searchParams.set('place_id', placeId)
        dUrl.searchParams.set('key', key)
        dUrl.searchParams.set('fields', 'geometry,formatted_address,name,address_components')
        try {
          const d = (await getJson(dUrl, signal)) as DetailsResponse
          return d.status === 'OK' && d.result ? d.result : null
        } catch {
          return null // one detail miss must not sink the whole result set
        }
      }),
    )

    const seen = new Set<string>()
    const out: PlaceResult[] = []
    for (const d of details) {
      if (!d) continue
      const r = toPlaceResult(d)
      if (!r || !r.label || seen.has(r.label)) continue
      seen.add(r.label)
      out.push(r)
    }
    return out
  } catch {
    // Any transport error / timeout / abort / bad payload → fall back to Nominatim.
    return null
  }
}
