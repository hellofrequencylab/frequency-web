'use client'

import { useEffect, useRef } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

// Same free vector tiles as the circles map so listings match the rest of the
// app. Override with a Mapbox/MapTiler style URL via NEXT_PUBLIC_MAP_STYLE.
const STYLE = process.env.NEXT_PUBLIC_MAP_STYLE || 'https://tiles.openfreemap.org/styles/positron'

// Radius (metres) of the privacy circle drawn when the seller has NOT revealed
// the exact spot. Wide enough that the real address can be anywhere inside it.
const AREA_RADIUS_M = 500

// Pull a paint colour from the DAWN token layer so map features track the theme
// instead of hardcoding a hex. Falls back to the amber primary if unresolved.
function tokenColor(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return v || fallback
}

// A geographic circle (not a fixed-pixel dot) so the area covers a real ~500m
// on the ground at any zoom. Returns a closed ring of [lng, lat] points.
function circleRing(lng: number, lat: number, radiusM: number, steps = 72): [number, number][] {
  const earth = 6371000
  const lat0 = (lat * Math.PI) / 180
  const ring: [number, number][] = []
  for (let i = 0; i <= steps; i++) {
    const theta = (i / steps) * 2 * Math.PI
    const dx = radiusM * Math.cos(theta)
    const dy = radiusM * Math.sin(theta)
    const dLng = ((dx / (earth * Math.cos(lat0))) * 180) / Math.PI
    const dLat = ((dy / earth) * 180) / Math.PI
    ring.push([lng + dLng, lat + dLat])
  }
  return ring
}

// The maplibre canvas for a listing's pickup location. Loaded only on the client
// (via next/dynamic, ssr:false) so maplibre never runs on the server. `precise`
// switches between a soft area circle (default, privacy-safe) and an exact pin.
export default function ListingLocationMapCanvas({
  lat,
  lng,
  precise,
}: {
  lat: number
  lng: number
  precise: boolean
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const map = new maplibregl.Map({
      container,
      style: STYLE,
      center: [lng, lat],
      zoom: precise ? 15 : 13,
      interactive: true,
      attributionControl: { compact: true },
    })
    mapRef.current = map

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')

    let marker: maplibregl.Marker | null = null

    map.on('load', () => {
      const primary = tokenColor('--color-primary', '#E2912F')

      if (precise) {
        // Seller revealed the exact spot -> a real pin at the address.
        marker = new maplibregl.Marker({ color: primary }).setLngLat([lng, lat]).addTo(map)
        return
      }

      // Default: draw a soft translucent area circle, never a precise pin, so the
      // exact pickup address stays hidden until the seller reveals it.
      map.addSource('area', {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: {},
          geometry: { type: 'Polygon', coordinates: [circleRing(lng, lat, AREA_RADIUS_M)] },
        },
      })
      map.addLayer({
        id: 'area-fill',
        type: 'fill',
        source: 'area',
        paint: { 'fill-color': primary, 'fill-opacity': 0.14 },
      })
      map.addLayer({
        id: 'area-outline',
        type: 'line',
        source: 'area',
        paint: { 'line-color': primary, 'line-opacity': 0.5, 'line-width': 2 },
      })
    })

    return () => {
      marker?.remove()
      map.remove()
      mapRef.current = null
    }
  }, [lat, lng, precise])

  // Subtle warm filter so the cool base tiles sit on the cream palette, matching
  // the circles map.
  return (
    <div
      ref={containerRef}
      className="h-full w-full"
      style={{ filter: 'sepia(0.22) saturate(1.08) hue-rotate(-8deg) brightness(1.02)' }}
    />
  )
}
