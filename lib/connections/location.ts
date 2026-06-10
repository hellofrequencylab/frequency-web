// Connection-layer location vocabulary (ADR-186) — pure + isomorphic (no DB, no
// node-only APIs), so it's shared by server reads and client settings UI. The cardinal
// rule lives here in the type system: members are described by a coarse BAND, never a
// coordinate or a distance in metres.

/** The only proximity signal a client ever receives. Returned by the members_near RPC. */
export type ProximityBand = 'here' | 'nearby' | 'your area' | 'your city' | 'unknown'

export const BAND_LABEL: Record<ProximityBand, string> = {
  here: 'Right here',
  nearby: 'Nearby',
  'your area': 'Your area',
  'your city': 'Your city',
  unknown: 'Elsewhere',
}

// How precise others may see ME (profiles.location_band).
export const LOCATION_BAND_OPTIONS = [
  { value: 'hidden', label: 'Hidden', hint: 'No one sees your location at all.' },
  { value: 'city', label: 'City', hint: 'Others see only your city.' },
  { value: 'neighborhood', label: 'Neighborhood', hint: 'Others see a fuzzed ~1-mile area, never your exact spot.' },
] as const
export type LocationBand = (typeof LOCATION_BAND_OPTIONS)[number]['value']

// Who may find me by proximity (profiles.discoverable_by).
export const DISCOVERABLE_OPTIONS = [
  { value: 'nobody', label: 'No one', hint: 'You’re never surfaced by location.' },
  { value: 'connections', label: 'My connections', hint: 'Only people you’re connected with.' },
  { value: 'community', label: 'The community', hint: 'Anyone in the community can find you nearby.' },
] as const
export type DiscoverableBy = (typeof DISCOVERABLE_OPTIONS)[number]['value']

export function isLocationBand(v: unknown): v is LocationBand {
  return v === 'hidden' || v === 'city' || v === 'neighborhood'
}
export function isDiscoverableBy(v: unknown): v is DiscoverableBy {
  return v === 'nobody' || v === 'connections' || v === 'community'
}
