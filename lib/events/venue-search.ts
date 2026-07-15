import 'server-only'

import type { PlaceResult } from '@/lib/geocode'
import { distanceKm } from '@/lib/distance'
import { nominatimSearch } from '@/lib/events/nominatim'

// Server-side venue / address autocomplete (Event settings overhaul).
//
// WHY THIS EXISTS: the browser Photon path returned fuzzy GLOBAL matches for a local
// US street ("6882 Embarcadero Ln, Carlsbad" → "Embarcadère, France") because Photon
// ignores a hard bbox and has poor US house-number coverage. Nominatim honours a HARD
// viewbox+bounded filter and has real US house numbers, but its usage policy forbids
// browser autocomplete and needs a contact User-Agent — so it runs HERE, server-side,
// behind lib/events/nominatim's shared rate-limit serialiser.
//
// LOCAL-FIRST CASCADE: people almost always post events near where they are, so with a
// bias (the device's location, the event's pin, else the viewer's home) we hard-bound
// the first pass to a metro box around it. Only if that finds nothing do we widen —
// nationally, then worldwide — so a real local address always beats a same-named place
// on another continent, and that global junk can never enter the local candidate set.

export type VenueBias = { lat: number; lng: number }

// Nominatim jsonv2 result with addressdetails=1.
type NominatimAddress = {
  house_number?: string
  road?: string
  pedestrian?: string
  neighbourhood?: string
  city?: string
  town?: string
  village?: string
  hamlet?: string
  municipality?: string
  county?: string
  state?: string
  country?: string
  country_code?: string
  postcode?: string
}
type NominatimPlace = {
  lat?: string
  lon?: string
  name?: string
  display_name?: string
  address?: NominatimAddress
}

const RESULT_LIMIT = 8

/** Half-width, in degrees, of the LOCAL viewbox drawn around the bias for pass 1.
 *  ~0.25° ≈ 17 mi at mid-latitudes — a same-metro window, tight enough that a
 *  wrong-city street with the same name (a "Fuerte Drive" one town over) can't crowd
 *  out the local one. The NATIONAL fallback (pass 2) still covers anything wider. */
const LOCAL_BOX_HALF_DEG = 0.25

/** Defense-in-depth distance guards (km). Pass 1 is already viewbox+bounded, but we
 *  still drop anything absurdly far so a stray match can NEVER lead. Pass 2 is
 *  country-scoped, so its guard is generous enough to span a large country (e.g. the
 *  contiguous US ≈ 4,500 km corner-to-corner) and only ever catches an outlier. */
const LOCAL_MAX_KM = 200
const NATIONAL_MAX_KM = 6000

/** "12 Main Street" from Nominatim's split parts, or null when there's no street. */
function toStreet(a: NominatimAddress): string | null {
  const road = a.road ?? a.pedestrian ?? null
  const line = [a.house_number, road].filter(Boolean).join(' ').trim()
  return line || null
}

/** The leading segment of a display_name ("Balboa Park, 6th Avenue, San Diego, …" →
 *  "Balboa Park"), used as a name when a plain address carries no `name`. */
function displayHead(display?: string): string | null {
  const head = display?.split(',')[0]?.trim()
  return head || null
}

/** Map one Nominatim place → our PlaceResult, or null if it has no valid point. */
function toPlaceResult(p: NominatimPlace): PlaceResult | null {
  const lat = Number(p.lat)
  const lng = Number(p.lon)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null

  const a = p.address ?? {}
  const street = toStreet(a)
  const city = a.city ?? a.town ?? a.village ?? a.hamlet ?? a.municipality ?? null
  const region = a.state ?? null
  const country = a.country ?? null
  const postalCode = a.postcode ?? null
  // A POI carries its own `name`; a plain address doesn't, so fall back to its street
  // line, then the head of the display name, so the row never collapses to just a city.
  const name = (p.name?.trim() || null) ?? street ?? displayHead(p.display_name)

  // Human label: the head (name or street) then the bits that disambiguate it, deduped.
  const head = name ?? street ?? displayHead(p.display_name) ?? undefined
  const parts = [head, city, region, country].filter(Boolean) as string[]
  const seen = new Set<string>()
  const label = parts.filter((x) => (seen.has(x) ? false : (seen.add(x), true))).join(', ')

  return {
    label: label || (name ?? ''),
    lat,
    lng,
    name,
    street,
    city,
    region,
    country,
    postalCode,
  }
}

/** A street line that leads with a digit carries a house number (toStreet puts the
 *  house_number first), so this is our proxy for "this result has a house number". */
function hasHouseNumber(r: PlaceResult): boolean {
  return /^\d/.test(r.street ?? '')
}

/** Map a raw Nominatim array → PlaceResult[], deduped by label, distance-guarded when a
 *  bias + max is given, sorted closest-first when a bias is present. When the query led
 *  with a house number, results that actually carry a house number sort ahead of
 *  street-only matches (so "7302 El Fuerte St" beats a bare "El Fuerte Street"). */
function mapResults(
  raw: unknown[],
  bias: VenueBias | null,
  maxKm: number | null,
  preferHouseNumber = false,
): PlaceResult[] {
  const seen = new Set<string>()
  const out: PlaceResult[] = []
  for (const item of raw) {
    const r = toPlaceResult(item as NominatimPlace)
    if (!r) continue
    // Defense in depth: drop a result that's absurdly far from the bias, so a stray
    // global match can never appear even if the provider slips one past the filter.
    if (bias && maxKm != null && distanceKm(bias.lat, bias.lng, r.lat, r.lng) > maxKm) continue
    if (!r.label || seen.has(r.label)) continue
    seen.add(r.label)
    out.push(r)
  }
  const dist = (r: PlaceResult) => (bias ? distanceKm(bias.lat, bias.lng, r.lat, r.lng) : 0)
  if (bias || preferHouseNumber) {
    out.sort((a, b) => {
      if (preferHouseNumber) {
        const rank = Number(hasHouseNumber(b)) - Number(hasHouseNumber(a))
        if (rank !== 0) return rank
      }
      return dist(a) - dist(b)
    })
  }
  return out
}

/** The countrycodes value for the NATIONAL pass. Deriving a precise country from a
 *  lat/lng would cost another reverse-geocode round-trip, so we use a rough box: a
 *  US-ish (or absent/unknown) bias → 'us' (Frequency is a US-first local product); a
 *  clearly-non-US bias → null, so the cascade skips straight to a bias-sorted
 *  worldwide pass rather than wrongly forcing someone's search into the US. */
function countryCodeForBias(bias: VenueBias | null): string | null {
  if (!bias) return 'us'
  // Rough box covering the contiguous US + Alaska + Hawaii.
  const inUs = bias.lat >= 18 && bias.lat <= 72 && bias.lng >= -172 && bias.lng <= -66
  return inUs ? 'us' : null
}

const clampLat = (v: number) => Math.max(-90, Math.min(90, v))
const clampLng = (v: number) => Math.max(-180, Math.min(180, v))

const BASE_PARAMS = {
  format: 'jsonv2',
  addressdetails: '1',
  limit: String(RESULT_LIMIT),
}

/** Trailing street-type tokens we treat as interchangeable. People routinely type the
 *  wrong one ("El Fuerte dr" when the street is "El Fuerte St"), so when the query-as-typed
 *  finds nothing we retry with this token stripped (see `stripStreetSuffix`). */
const STREET_SUFFIXES = new Set([
  'st', 'street',
  'dr', 'drive',
  'ave', 'avenue', 'av',
  'rd', 'road',
  'blvd', 'boulevard',
  'ln', 'lane',
  'ct', 'court',
  'way',
  'pl', 'place',
  'ter', 'terrace',
])

/** Does the query lead with a house number ("7302 El Fuerte…")? Such queries get the
 *  Nominatim STRUCTURED `street` param (much better US house-number hits) and prefer
 *  results that actually carry a house number. */
function hasLeadingHouseNumber(q: string): boolean {
  return /^\s*\d+\s+\S/.test(q)
}

/** The query with a trailing street-type token removed ("7302 El Fuerte dr" →
 *  "7302 El Fuerte"), or null when the last token isn't a street type. Lets a
 *  suffix-agnostic retry match a street stored under a different type token. */
function stripStreetSuffix(q: string): string | null {
  const tokens = q.trim().split(/\s+/)
  if (tokens.length < 2) return null
  const last = tokens[tokens.length - 1].toLowerCase().replace(/\.$/, '')
  if (!STREET_SUFFIXES.has(last)) return null
  const rest = tokens.slice(0, -1).join(' ').trim()
  return rest.length >= 2 ? rest : null
}

/**
 * Run the local-first cascade for ONE query string and return the first non-empty pass.
 *
 *   Pass 1 — LOCAL (hard): viewbox+bounded around the bias.
 *   Pass 2 — NATIONAL: countrycodes for the bias's country.
 *   Pass 3 — WORLDWIDE: unbounded last resort (still bias-sorted).
 *
 * When the query leads with a house number and the country resolves to the US, each
 * bounded pass FIRST tries Nominatim's STRUCTURED `street` param (far stronger US
 * house-number matching than free-text `q`) before falling back to the free-text query.
 */
async function runCascade(
  q: string,
  b: VenueBias | null,
  signal?: AbortSignal,
): Promise<PlaceResult[]> {
  const cc = countryCodeForBias(b)
  const houseNum = hasLeadingHouseNumber(q)
  const structuredUs = houseNum && cc === 'us'

  // Pass 1 — LOCAL (hard viewbox + bounded=1).
  if (b) {
    const west = clampLng(b.lng - LOCAL_BOX_HALF_DEG)
    const east = clampLng(b.lng + LOCAL_BOX_HALF_DEG)
    const south = clampLat(b.lat - LOCAL_BOX_HALF_DEG)
    const north = clampLat(b.lat + LOCAL_BOX_HALF_DEG)
    const viewbox = `${west},${south},${east},${north}`
    if (structuredUs) {
      const rawS = await nominatimSearch(
        { ...BASE_PARAMS, street: q, countrycodes: 'us', viewbox, bounded: '1' },
        signal,
      )
      const localS = mapResults(rawS ?? [], b, LOCAL_MAX_KM, true)
      if (localS.length > 0) return localS
    }
    const raw = await nominatimSearch({ ...BASE_PARAMS, q, viewbox, bounded: '1' }, signal)
    const local = mapResults(raw ?? [], b, LOCAL_MAX_KM, houseNum)
    if (local.length > 0) return local
  }

  // Pass 2 — NATIONAL (country-scoped fallback).
  if (cc) {
    if (structuredUs) {
      const rawS = await nominatimSearch({ ...BASE_PARAMS, street: q, countrycodes: 'us' }, signal)
      const natS = mapResults(rawS ?? [], b, NATIONAL_MAX_KM, true)
      if (natS.length > 0) return natS
    }
    const raw = await nominatimSearch({ ...BASE_PARAMS, q, countrycodes: cc }, signal)
    const national = mapResults(raw ?? [], b, NATIONAL_MAX_KM, houseNum)
    if (national.length > 0) return national
  }

  // Pass 3 — WORLDWIDE (unbounded last resort; still bias-sorted when we have one).
  const raw = await nominatimSearch({ ...BASE_PARAMS, q }, signal)
  return mapResults(raw ?? [], b, null, houseNum)
}

/**
 * Venue / address autocomplete. Nominatim free-text `q` matches BUSINESSES/POIs AND
 * street addresses in one query. Runs the local-first cascade (see `runCascade`) and
 * returns PlaceResult[] closest-first (when biased). Fail-safe to `[]`.
 *
 * SUFFIX-AGNOSTIC RETRY: if the query-as-typed finds nothing and it ends in a street-type
 * token (st/dr/ave/…), it retries once with that token stripped, so "7302 El Fuerte dr"
 * still surfaces the street stored as "El Fuerte St".
 */
export async function searchVenues(
  query: string,
  bias?: VenueBias | null,
  signal?: AbortSignal,
): Promise<PlaceResult[]> {
  const q = query.trim()
  if (q.length < 2) return []

  const b =
    bias && Number.isFinite(bias.lat) && Number.isFinite(bias.lng)
      ? { lat: bias.lat, lng: bias.lng }
      : null

  // Attempt 1 — the query exactly as typed.
  const primary = await runCascade(q, b, signal)
  if (primary.length > 0) return primary

  // Attempt 2 — suffix-agnostic retry (only when the last token is a street type).
  const stripped = stripStreetSuffix(q)
  if (stripped) {
    const retry = await runCascade(stripped, b, signal)
    if (retry.length > 0) return retry
  }

  return []
}
