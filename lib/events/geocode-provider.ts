// Keyless geocoder provider for the events foundation (EVENTS-REWORK B1).
//
// Implements the foundation's `Geocoder` interface (lib/events/geocode.ts) against
// OpenStreetMap Nominatim — a keyless provider that matches our deliberately
// key-free map stack (OpenFreeMap tiles + Photon city autocomplete, ADR-065). No
// account, key, or billing; we can swap to a keyed provider later behind this same
// signature without touching any save path.
//
// SERVER-SIDE ONLY. saveEventLocation runs in server actions, so this fetch never
// leaves the server. The shared Nominatim plumbing (URL, contact User-Agent, and the
// in-process rate-limit serialiser it shares with the venue autocomplete) lives in
// lib/events/nominatim. Do not import this into a client component.
//
// GRACEFUL FALLBACK is the contract: no result, a transport error, a non-OK
// response, a rate-limit, or a missing/invalid payload all resolve to `null`. The
// foundation's saveEventLocation treats a null point as "save the event, leave geog
// NULL" — a geocode miss must never throw or block a save (Law: the catalog simply
// can't place this event until a later save resolves it).

import type { EventAddress, GeoPoint, Geocoder } from '@/lib/events/geocode'
import { nominatimSearch } from '@/lib/events/nominatim'

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

  const data = await nominatimSearch({
    q,
    format: 'jsonv2',
    limit: '1',
    addressdetails: '0',
  })
  if (!data) return null

  const first = data[0] as NominatimResult | undefined
  if (!first) return null

  const lat = Number(first.lat)
  const lng = Number(first.lon)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null

  return { lat, lng }
}
