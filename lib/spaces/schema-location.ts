// THE PLACE HALF OF A SPACE'S LocalBusiness NODE (SCAN-809), built once for both call sites.
//
// Two routes emit spaceSchema() for a Space: the crawlable app/(public)/spaces/[slug]/page.tsx and
// the member-facing app/(main)/spaces/[slug]/(profile)/layout.tsx. Both used to build the address
// from the free-text Contact-card street plus spaces.city, so a studio that had set an exact pin, a
// state and a ZIP still published a node with no addressRegion, no postalCode and no geo, and lost
// the local-pack matching those fields buy. The columns are read by lib/spaces/store.ts; this file
// turns them into the address and geo the node carries, and it is the ONLY place the precision
// rule for a published Space location is written down.
//
// 🔴 THE PRECISION RULE. The TRUE coordinate is stored even when the owner picked 'approximate'
// (setSpaceLocation explains why), so publishing it unchanged would undo the owner's choice. At
// 'approximate' the street and the ZIP are withheld, and the geo point is the coarsened cell that
// lib/nearby/map-pins.ts draws (lib/maps/approximate.ts, same seed), so the schema and the map tell
// one story. At 'exact' everything the Space has goes out. Locality, region and country are never
// precise enough to withhold, so they go out at either precision.
//
// PURE: no Supabase, no React, no Next. Tested in schema-location.test.ts.

import { approximatePoint } from '@/lib/maps/approximate'
import type { Space } from './types'

export type SpaceSchemaLocation = {
  address: {
    streetAddress?: string
    addressLocality?: string
    addressRegion?: string
    postalCode?: string
    addressCountry?: string
  } | null
  geo: { latitude: number; longitude: number } | null
}

const text = (v: string | null | undefined): string | undefined => {
  const t = typeof v === 'string' ? v.trim() : ''
  return t.length ? t : undefined
}

/**
 * The address and geo for a Space's LocalBusiness node. `contactAddress` is the Contact card's
 * free-text street (profile data), the fallback for streetAddress when the location form has no
 * street of its own, so a Space that never opened the location form keeps the node it had.
 */
export function spaceSchemaLocation(
  space: Pick<Space, 'id' | 'city' | 'street' | 'region' | 'postalCode' | 'country' | 'latitude' | 'longitude' | 'locationPrecision'>,
  contactAddress?: string | null,
): SpaceSchemaLocation {
  const exact = space.locationPrecision !== 'approximate'

  const address = {
    ...(exact && text(space.street ?? contactAddress) ? { streetAddress: text(space.street ?? contactAddress) } : {}),
    ...(text(space.city) ? { addressLocality: text(space.city) } : {}),
    ...(text(space.region) ? { addressRegion: text(space.region) } : {}),
    ...(exact && text(space.postalCode) ? { postalCode: text(space.postalCode) } : {}),
    ...(text(space.country) ? { addressCountry: text(space.country) } : {}),
  }

  let geo: SpaceSchemaLocation['geo'] = null
  const lat = space.latitude
  const lng = space.longitude
  if (lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng)) {
    if (exact) geo = { latitude: lat, longitude: lng }
    else {
      const point = approximatePoint(lat, lng, space.id)
      geo = point ? { latitude: point.lat, longitude: point.lng } : null
    }
  }

  return { address: Object.keys(address).length ? address : null, geo }
}
