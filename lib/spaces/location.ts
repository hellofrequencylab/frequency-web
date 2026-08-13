// A SPACE'S PLACE IN THE WORLD (ADR-1026) — the pure half.
//
// Where a Space physically is, and how precisely it lets that be published. The columns are real
// (20270301000000_space_location.sql), not another node in the `preferences` blob, because a
// coordinate is something the database has to be able to INDEX and compare: `spaces.geog` is a
// generated PostGIS point over these two numbers, and a jsonb key cannot carry a GiST index.
//
// PURE AND SERVER-FREE: no Supabase, no React, no Next. The form imports it for its types and its
// normaliser, the server action imports it to validate a submission, and lib/nearby/map-pins.ts
// imports the precision vocabulary. One definition, so the three cannot drift.

/** How precisely a Space allows its location to be published. Mirrors the CHECK constraint. */
export type SpaceLocationPrecision = 'exact' | 'approximate'

export const SPACE_LOCATION_PRECISIONS: readonly SpaceLocationPrecision[] = ['exact', 'approximate']

export function isSpaceLocationPrecision(v: unknown): v is SpaceLocationPrecision {
  return v === 'exact' || v === 'approximate'
}

/**
 * The precision a row should be TREATED as, whatever the column happens to hold.
 *
 * 🔴 FAILS OPEN TO 'exact', deliberately, and the direction is worth stating because the instinct is
 * the opposite. The private-looking default would be 'approximate', but the coordinate columns start
 * NULL: a Space has NO published location until its owner places a pin, and placing it is the act of
 * consent. So there is no row this default can surprise, and defaulting the other way would mean a
 * typo or a future enum value silently coarsened every venue on the map with nothing to notice it.
 * lib/nearby/map-pins.test.ts asserts this direction on purpose rather than leaving it implied.
 */
export function resolvePrecision(value: unknown): SpaceLocationPrecision {
  return value === 'approximate' ? 'approximate' : 'exact'
}

/** A Space's location as the operator form holds it and the action writes it. */
export type SpaceLocation = {
  street: string | null
  city: string | null
  region: string | null
  postalCode: string | null
  country: string | null
  latitude: number | null
  longitude: number | null
  precision: SpaceLocationPrecision
}

export const EMPTY_SPACE_LOCATION: SpaceLocation = {
  street: null,
  city: null,
  region: null,
  postalCode: null,
  country: null,
  latitude: null,
  longitude: null,
  precision: 'exact',
}

function text(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t.length > 0 ? t.slice(0, 200) : null
}

function coord(v: unknown, max: number): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : Number.NaN
  if (!Number.isFinite(n) || Math.abs(n) > max) return null
  return n
}

/**
 * Normalise anything the client sent into a location this app is willing to store.
 *
 * 🔴 THE PAIR RULE: latitude and longitude are stored together or not at all. A half-placed pin is
 * the one shape that would put a Space on the null island off the coast of Africa, and the generated
 * `geog` column already refuses to build a point from half a pair, so accepting one here would just
 * store a number the map can never use and the owner can never see.
 */
export function normalizeSpaceLocation(input: unknown): SpaceLocation {
  const raw = (input ?? {}) as Record<string, unknown>
  const latitude = coord(raw.latitude, 90)
  const longitude = coord(raw.longitude, 180)
  const placed = latitude != null && longitude != null

  return {
    street: text(raw.street),
    city: text(raw.city),
    region: text(raw.region),
    postalCode: text(raw.postalCode),
    country: text(raw.country),
    latitude: placed ? latitude : null,
    longitude: placed ? longitude : null,
    precision: isSpaceLocationPrecision(raw.precision) ? raw.precision : 'exact',
  }
}

/** Does this location put the Space on the map at all? An address with no pin does not: the map
 *  plots coordinates, and the address alone still earns its place on the Contact card. */
export function isMappable(location: SpaceLocation): boolean {
  return location.latitude != null && location.longitude != null
}

/** The one-line summary the settings form shows back, so an operator can see what they saved
 *  without reading five inputs. Plain, no em dashes (docs/CONTENT-VOICE.md §10). */
export function locationSummary(location: SpaceLocation): string {
  const parts = [location.street, location.city, location.region, location.postalCode].filter(Boolean)
  if (parts.length === 0) return isMappable(location) ? 'A pin, with no address typed in' : 'No location set'
  return parts.join(', ')
}
