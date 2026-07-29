'use client'

import { MapCanvas } from '@/components/maps/map-canvas'

// Radius (metres) of the privacy circle drawn when the seller has NOT revealed
// the exact spot. Wide enough that the real address can be anywhere inside it.
const AREA_RADIUS_M = 500

// The map canvas for a listing's pickup location. `precise` switches between a soft area
// circle (default, privacy-safe) and an exact pin — the area is a REAL geographic circle,
// so it covers the same ~500m on the ground at any zoom.
//
// Composes the map seam (ADR-901) instead of a map library directly: Google when a browsable
// key is configured, MapLibre + keyless OpenFreeMap tiles otherwise. Loaded only on the
// client (via next/dynamic, ssr:false) so no map engine runs on the server.
export default function ListingLocationMapCanvas({
  lat,
  lng,
  precise,
}: {
  lat: number
  lng: number
  precise: boolean
}) {
  return (
    <MapCanvas
      center={[lng, lat]}
      zoom={precise ? 15 : 13}
      pins={precise ? [{ id: 'pickup', lat, lng }] : []}
      area={precise ? null : { lat, lng, radiusM: AREA_RADIUS_M }}
      className="h-full w-full"
    />
  )
}
