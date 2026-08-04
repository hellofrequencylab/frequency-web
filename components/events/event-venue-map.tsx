'use client'

import { MapCanvas } from '@/components/maps/map-canvas'

// Exact-venue mini map for the event page (Event settings overhaul §5). Unlike
// events-map.tsx (the CITY-LEVEL circle pin), this plots the event's OWN precise
// geog point — only shown for a published, in-person event that actually has one.
// Static: one fixed marker, no drag, no popup.
//
// Composes the map seam (ADR-901) instead of a map library directly: Google when a browsable
// key is configured, MapLibre + keyless OpenFreeMap tiles otherwise. Callers mount it with
// next/dynamic({ssr:false}) — no map engine ever runs on the server.

export default function EventVenueMap({
  lat,
  lng,
  className = 'h-40 w-full overflow-hidden rounded-card border border-border',
}: {
  lat: number
  lng: number
  className?: string
}) {
  return (
    <MapCanvas
      center={[lng, lat]}
      zoom={14}
      pins={[{ id: 'venue', lat, lng }]}
      className={className}
    />
  )
}
