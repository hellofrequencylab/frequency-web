'use client'

import { useEffect, useRef } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

// Exact-venue mini map for the event page (Event settings overhaul §5). Unlike
// events-map.tsx (the CITY-LEVEL circle pin), this plots the event's OWN precise
// geog point — only shown for a published, in-person event that actually has one.
// Static: one fixed marker, no drag, no popup. Keyless tiles, same default/override
// as the rest of the map stack. Dynamically imported (ssr:false) — maplibre never
// runs on the server.
const STYLE = process.env.NEXT_PUBLIC_MAP_STYLE || 'https://tiles.openfreemap.org/styles/positron'

export default function EventVenueMap({
  lat,
  lng,
  className = 'h-40 w-full overflow-hidden rounded-xl border border-border',
}: {
  lat: number
  lng: number
  className?: string
}) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const map = new maplibregl.Map({
      container,
      style: STYLE,
      center: [lng, lat],
      zoom: 14,
      attributionControl: { compact: true },
      interactive: true,
    })
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')

    // Marker colour off the DAWN token (maplibre owns this DOM). No hardcoded hex.
    const markerColor =
      getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim()
    new maplibregl.Marker(markerColor ? { color: markerColor } : undefined)
      .setLngLat([lng, lat])
      .addTo(map)

    return () => map.remove()
  }, [lat, lng])

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ filter: 'sepia(0.22) saturate(1.08) hue-rotate(-8deg) brightness(1.02)' }}
    />
  )
}
