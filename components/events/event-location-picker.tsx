'use client'

import { useEffect, useRef } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

// Editor location picker (Event settings overhaul §5). A MapLibre map with ONE
// DRAGGABLE marker. Dragging reports the new lat/lng up via onChange; when the venue
// autocomplete picks a place, the parent updates lat/lng and we recenter + move the
// pin. Keyless vector tiles, same default/override as events-map.tsx — maplibre must
// never run on the server, so this is always dynamically imported (ssr:false).
const STYLE = process.env.NEXT_PUBLIC_MAP_STYLE || 'https://tiles.openfreemap.org/styles/positron'

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
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const markerRef = useRef<maplibregl.Marker | null>(null)
  // Keep the latest onChange without retriggering the init effect (it must run once).
  const onChangeRef = useRef(onChange)
  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  // Init once. The pin position is synced by the second effect so we never tear the
  // map down on a prop change (which would lose tiles + interaction state).
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const start: [number, number] = lat != null && lng != null ? [lng, lat] : FALLBACK
    const map = new maplibregl.Map({
      container,
      style: STYLE,
      center: start,
      zoom: lat != null && lng != null ? 14 : 9,
      attributionControl: { compact: true },
    })
    mapRef.current = map
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')

    // Marker colour off the DAWN token (maplibre owns this DOM, outside Tailwind) —
    // same approach as events-map.tsx. No hardcoded hex.
    const markerColor =
      getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim()

    const marker = new maplibregl.Marker({ color: markerColor || undefined, draggable: true })
      .setLngLat(start)
      .addTo(map)
    markerRef.current = marker

    marker.on('dragend', () => {
      const { lat: mLat, lng: mLng } = marker.getLngLat()
      onChangeRef.current(mLat, mLng)
    })

    // Tapping the map also moves the pin (faster than dragging from far away).
    map.on('click', (e) => {
      marker.setLngLat(e.lngLat)
      onChangeRef.current(e.lngLat.lat, e.lngLat.lng)
    })

    return () => {
      map.remove()
      mapRef.current = null
      markerRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- init once; lat/lng sync below
  }, [])

  // Sync the marker + view when the parent moves the pin (autocomplete pick). Skipped
  // while dragging is naturally fine — the parent's lat/lng IS the dragged value.
  useEffect(() => {
    const map = mapRef.current
    const marker = markerRef.current
    if (!map || !marker || lat == null || lng == null) return
    marker.setLngLat([lng, lat])
    map.easeTo({ center: [lng, lat], zoom: Math.max(map.getZoom(), 14), duration: 400 })
  }, [lat, lng])

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ filter: 'sepia(0.22) saturate(1.08) hue-rotate(-8deg) brightness(1.02)' }}
    />
  )
}
