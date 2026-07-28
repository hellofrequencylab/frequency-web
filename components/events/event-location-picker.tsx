'use client'

import { MapCanvas } from '@/components/maps/map-canvas'

// Editor location picker (Event settings overhaul §5). A map with ONE DRAGGABLE marker.
// Dragging (or tapping the map) reports the new lat/lng up via onChange; when the venue
// autocomplete picks a place, the parent updates lat/lng and the seam recenters + moves the
// pin without tearing the map down.
//
// Composes the map seam (ADR-901) instead of a map library directly: Google when a browsable
// key is configured, MapLibre + keyless OpenFreeMap tiles otherwise. Always dynamically
// imported (ssr:false) — no map engine may run on the server.

// A sensible default view when the event has no point yet (matches events-map's
// fallback centre) so the picker still renders an interactive map to drop a pin on.
const FALLBACK: [number, number] = [-117.28, 33.1]

export default function EventLocationPicker({
  lat,
  lng,
  onChange,
  className = 'h-56 w-full overflow-hidden rounded-xl border border-border',
}: {
  /** Current pin latitude, or null when the event has no point yet. */
  lat: number | null
  /** Current pin longitude, or null when the event has no point yet. */
  lng: number | null
  /** Reports a dragged or recentered pin position up to the form. */
  onChange: (lat: number, lng: number) => void
  className?: string
}) {
  const placed = lat != null && lng != null
  const start: [number, number] = placed ? [lng, lat] : FALLBACK

  return (
    <MapCanvas
      center={start}
      zoom={placed ? 14 : 9}
      pins={[{ id: 'pin', lat: start[1], lng: start[0] }]}
      draggable
      onMove={onChange}
      className={className}
    />
  )
}
