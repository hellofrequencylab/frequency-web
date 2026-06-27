// Keyless geocoder provider for the events foundation (EVENTS-REWORK B1).
//
// Implements the foundation's `Geocoder` interface (lib/events/geocode.ts) against
// OpenStreetMap Nominatim — a keyless provider that matches our deliberately
// key-free map stack (OpenFreeMap tiles + Photon autocomplete, ADR-065). No
// account, key, or billing; we can swap to a keyed provider later behind this same
// signature without touching any save path.
//
// SERVER-SIDE ONLY. saveEventLocation runs in server actions, so this fetch never
// leaves the server: the CSP `connect-src` allowlist (a browser policy) does not
// gate it, and the contact User-Agent Nominatim's usage policy requires is never
// exposed to a client. Do not import this into a client component.
//
// GRACEFUL FALLBACK is the contract: no result, a transport error, a non-OK
// response, a rate-limit, or a missing/invalid payload all resolve to `null`. The
// foundation's saveEventLocation treats a null point as "save the event, leave geog
// NULL" — a geocode miss must never throw or block a save (Law: the catalog simply
// can't place this event until a later save resolves it).

import type { EventAddress, GeoPoint, Geocoder } from '@/lib/events/geocode'

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search'

// Nominatim's usage policy asks for a descriptive identifier (app + contact) so
// they can reach us before blocking. Sourced from env when set, with a sane
// project default so it's never empty.
const CONTACT =
  process.env.GEOCODER_CONTACT_EMAIL ??
  process.env.NEXT_PUBLIC_APP_URL ??
  'https://frequencylocal.com'
const USER_AGENT = `Frequency/1.0 (${CONTACT})`

// Nominatim's free usage tier is capped at ~1 request/second. Geocoding only ever
// happens on an event save (low volume, never in a tight loop), but two saves
// landing together could still trip the cap. A tiny in-process serialiser spaces
// our own calls at least MIN_INTERVAL_MS apart so we stay polite by construction.
const MIN_INTERVAL_MS = 1100
const REQUEST_TIMEOUT_MS = 5000

let lastRequestAt = 0
let queue: Promise<unknown> = Promise.resolve()

/** Run `fn` no sooner than MIN_INTERVAL_MS after the previous geocode call.
 *  Serialised through a single promise chain so concurrent saves don't all fire at
 *  once. Each task's own failure is isolated — it never poisons the chain. */
function rateLimited<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const wait = MIN_INTERVAL_MS - (Date.now() - lastRequestAt)
    if (wait > 0) await new Promise((r) => setTimeout(r, wait))
    lastRequestAt = Date.now()
    return fn()
  })
  // Keep the chain alive regardless of this task's outcome.
  queue = run.then(
    () => undefined,
    () => undefined,
  )
  return run
}

/** Compose the structured address into a single free-form Nominatim query.
 *  Nominatim's `q` handles partial addresses well, so we just join whatever the
 *  host gave us (venue first, postal last) and let the provider do the matching. */
function toQuery(address: EventAddress): string {
  const structured = [
    address.venueName,
    address.street,
    address.city,
    address.region,
    address.postalCode,
    address.country,
  ]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(', ')
  // Fall back to the free-text location line (Vera scan / onboarding) when there are no
  // structured fields, so a one-line address still resolves to a point.
  return structured || (address.query?.trim() ?? '')
}

type NominatimResult = {
  lat?: string
  lon?: string
}

/**
 * The keyless geocoder. Resolves a structured address to a WGS-84 point via
 * Nominatim, or `null` on any miss/failure. Wire this as the `geocoder` argument to
 * the foundation's saveEventLocation; never call a provider inline in a save path.
 */
export const nominatimGeocoder: Geocoder = async (
  address: EventAddress,
): Promise<GeoPoint | null> => {
  const q = toQuery(address)
  if (!q) return null

  return rateLimited(async () => {
    // Build from a CONSTANT base URL so the (user-supplied) address can only ever
    // land in the query string via searchParams — it can never influence the host or
    // path, so the request is pinned to nominatim.openstreetmap.org by construction.
    // This is the standard remediation for request-forgery: no tainted data reaches
    // the request destination, only its query.
    const url = new URL(NOMINATIM_URL)
    url.searchParams.set('q', q)
    url.searchParams.set('format', 'jsonv2')
    url.searchParams.set('limit', '1')
    url.searchParams.set('addressdetails', '0')

    let res: Response
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    try {
      res = await fetch(url, {
        method: 'GET',
        headers: {
          // Required by the Nominatim usage policy + helps them reach us before
          // rate-limiting. Accept-Language keeps place names in English.
          'User-Agent': USER_AGENT,
          'Accept-Language': 'en',
          Accept: 'application/json',
        },
        signal: controller.signal,
        // Don't let Next cache a geocode lookup — addresses are one-shot on save.
        cache: 'no-store',
      })
    } catch {
      // Network error, abort, or timeout — fall back to "no point".
      return null
    } finally {
      clearTimeout(timer)
    }

    // 429 (rate-limited), 5xx, or any non-OK → graceful miss, the event still saves.
    if (!res.ok) return null

    let data: unknown
    try {
      data = await res.json()
    } catch {
      return null
    }

    const first = Array.isArray(data) ? (data[0] as NominatimResult | undefined) : undefined
    if (!first) return null

    const lat = Number(first.lat)
    const lng = Number(first.lon)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null

    return { lat, lng }
  })
}
