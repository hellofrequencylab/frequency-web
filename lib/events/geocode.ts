import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import { createAdminClient } from '@/lib/supabase/admin'

// Event geolocation data layer (EVENTS-REWORK B1).
//
// Two concerns:
//   • geocode-on-save: turn a structured address into a point and persist it on
//     the event (events.geog) so the catalog can do real "near me".
//   • nearby query: a typed wrapper over the hardened, RLS-respecting
//     public.nearby_events RPC (20260625000000_event_geolocation).
//
// The geo columns + the set_event_geog / nearby_events RPCs are in
// lib/database.types.ts now, so writes/RPC use the typed clients directly.

/** A structured address as the create/edit form collects it. All optional: an
 *  online event has no address; a sparse address still geocodes if it has enough. */
export interface EventAddress {
  venueName?: string | null
  street?: string | null
  city?: string | null
  region?: string | null
  country?: string | null
  postalCode?: string | null
}

/** A resolved point. lng/lat in WGS-84 (SRID 4326). */
export interface GeoPoint {
  lat: number
  lng: number
}

export type AttendanceMode = 'in_person' | 'online' | 'hybrid'

/**
 * Pluggable geocoder. The actual provider (Mapbox / Google / Nominatim) is wired
 * in later behind this signature; the data layer only depends on the shape, so a
 * provider swap never touches save logic. Returns null when the address can't be
 * resolved (online events, too-sparse input) — callers must treat geog as
 * optional and never block a save on a geocode miss.
 */
export type Geocoder = (address: EventAddress) => Promise<GeoPoint | null>

/** Is there enough in this address to even attempt a geocode? Avoids calling the
 *  provider for empty/online events. */
export function hasGeocodableAddress(address: EventAddress): boolean {
  return Boolean(
    address.street?.trim() ||
      address.city?.trim() ||
      address.postalCode?.trim() ||
      address.venueName?.trim(),
  )
}

/**
 * Geocode-on-save hook. Persists the structured address columns and, when a
 * geocoder is supplied and resolves a point, the events.geog column (written as a
 * PostGIS point via the set_event_geog RPC so we never hand-build WKT in JS).
 *
 * Backward-compatible and best-effort: in_person with no resolvable point still
 * saves the address; a geocode failure leaves geog NULL (the event is simply not
 * "near me"-discoverable until re-saved). online/hybrid events skip geocoding.
 *
 * Returns the point it persisted, or null when none was set.
 */
export async function saveEventLocation(
  eventId: string,
  args: {
    address: EventAddress
    attendanceMode: AttendanceMode
    onlineUrl?: string | null
    geocoder?: Geocoder
  },
): Promise<GeoPoint | null> {
  const admin = createAdminClient()
  const { address, attendanceMode, onlineUrl, geocoder } = args

  // Always persist the structured address + mode (additive columns).
  await admin
    .from('events')
    .update({
      venue_name: address.venueName ?? null,
      street: address.street ?? null,
      city: address.city ?? null,
      region: address.region ?? null,
      country: address.country ?? null,
      postal_code: address.postalCode ?? null,
      attendance_mode: attendanceMode,
      online_url: onlineUrl ?? null,
    })
    .eq('id', eventId)

  // Online-only events carry no point. Hybrid + in_person geocode if we can.
  if (attendanceMode === 'online') return null
  if (!geocoder || !hasGeocodableAddress(address)) return null

  let point: GeoPoint | null = null
  try {
    point = await geocoder(address)
  } catch {
    // A provider hiccup must never fail the save; geog stays NULL.
    point = null
  }
  if (!point) return null

  // Persist the point through the RPC so the WKT/SRID stays in SQL.
  await admin.rpc('set_event_geog', {
    _event_id: eventId,
    _lat: point.lat,
    _long: point.lng,
  })
  return point
}

/** A row from public.nearby_events. */
export interface NearbyEvent {
  id: string
  slug: string
  title: string
  description: string | null
  startsAt: string
  endsAt: string | null
  venueName: string | null
  city: string | null
  region: string | null
  country: string | null
  attendanceMode: AttendanceMode
  distanceM: number
}

/**
 * Events within `radiusM` metres of (lat, lng), nearest first, via the hardened
 * public.nearby_events RPC. The RPC is SECURITY INVOKER, so the events visibility
 * RLS still applies — pass a request-scoped client (e.g. the SSR client) to honour
 * the caller's session; an admin client would bypass RLS and surface everything.
 */
export async function nearbyEvents(
  client: SupabaseClient<Database>,
  args: { lat: number; lng: number; radiusM?: number; limit?: number },
): Promise<NearbyEvent[]> {
  const { data, error } = await client.rpc('nearby_events', {
    _lat: args.lat,
    _long: args.lng,
    _radius_m: args.radiusM ?? 50_000,
    _limit: args.limit ?? 50,
  })
  if (error || !data) return []

  return data.map((r) => ({
    id: r.id,
    slug: r.slug,
    title: r.title,
    description: r.description,
    startsAt: r.starts_at,
    endsAt: r.ends_at,
    venueName: r.venue_name,
    city: r.city,
    region: r.region,
    country: r.country,
    // attendance_mode is a free-text column at the DB layer; the app constrains it.
    attendanceMode: r.attendance_mode as AttendanceMode,
    distanceM: r.distance_m,
  }))
}
