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
 *  ~0.65° ≈ 45 mi at mid-latitudes — a metro-sized window, wide enough for a suburb's
 *  venues, tight enough to keep a far-flung same-named street out of the local pass. */
const LOCAL_BOX_HALF_DEG = 0.65

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

/** Map a raw Nominatim array → PlaceResult[], deduped by label, distance-guarded when a
 *  bias + max is given, and sorted closest-first when a bias is present. */
function mapResults(
  raw: unknown[],
  bias: VenueBias | null,
  maxKm: number | null,
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
  if (bias) {
    out.sort(
      (a, b) =>
        distanceKm(bias.lat, bias.lng, a.lat, a.lng) -
        distanceKm(bias.lat, bias.lng, b.lat, b.lng),
    )
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

/**
 * Venue / address autocomplete. Nominatim free-text `q` matches BUSINESSES/POIs AND
 * street addresses in one query. Runs the local-first cascade described at the top of
 * this file and returns PlaceResult[] closest-first (when biased). Fail-safe to `[]`.
 *
 *   Pass 1 — LOCAL (hard): viewbox+bounded around the bias. If it returns, use it.
 *   Pass 2 — NATIONAL: countrycodes for the bias's country. If it returns, use it.
 *   Pass 3 — WORLDWIDE: unbounded last resort (still bias-sorted).
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

  // Pass 1 — LOCAL (hard viewbox + bounded=1).
  if (b) {
    const west = clampLng(b.lng - LOCAL_BOX_HALF_DEG)
    const east = clampLng(b.lng + LOCAL_BOX_HALF_DEG)
    const south = clampLat(b.lat - LOCAL_BOX_HALF_DEG)
    const north = clampLat(b.lat + LOCAL_BOX_HALF_DEG)
    const raw = await nominatimSearch(
      { ...BASE_PARAMS, q, viewbox: `${west},${south},${east},${north}`, bounded: '1' },
      signal,
    )
    const local = mapResults(raw ?? [], b, LOCAL_MAX_KM)
    if (local.length > 0) return local
  }

  // Pass 2 — NATIONAL (country-scoped fallback).
  const cc = countryCodeForBias(b)
  if (cc) {
    const raw = await nominatimSearch({ ...BASE_PARAMS, q, countrycodes: cc }, signal)
    const national = mapResults(raw ?? [], b, NATIONAL_MAX_KM)
    if (national.length > 0) return national
  }

  // Pass 3 — WORLDWIDE (unbounded last resort; still bias-sorted when we have one).
  const raw = await nominatimSearch({ ...BASE_PARAMS, q }, signal)
  return mapResults(raw ?? [], b, null)
}
