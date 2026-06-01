'use client'

import { useEffect, useRef } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

// Keyless vector tiles out of the box (same default as the circles map); override
// with NEXT_PUBLIC_MAP_STYLE. PRIVACY: this map only ever receives city-level
// centroids (see lib/discover.ts getPublicCityClusters) — never a circle/venue.
const STYLE = process.env.NEXT_PUBLIC_MAP_STYLE || 'https://tiles.openfreemap.org/styles/positron'

export type MapCity = {
  city: string
  circles: number
  events: number
  lat: number
  lng: number
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// Loaded via next/dynamic({ ssr:false }) from the locator wrapper — maplibre must
// never run on the server.
export default function DiscoverMap({
  cities,
  center = null,
  className = 'h-full w-full overflow-hidden rounded-2xl border border-border',
}: {
  cities: MapCity[]
  /** [lng, lat] of the viewer (IP geo) — the map eases here when it arrives. */
  center?: [number, number] | null
  className?: string
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const centerRef = useRef(center)

  useEffect(() => {
    centerRef.current = center
    if (center && mapRef.current) {
      mapRef.current.easeTo({ center, zoom: 9, duration: 800 })
    }
  }, [center])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const map = new maplibregl.Map({
      container,
      style: STYLE,
      center: [-117.28, 33.1], // North County San Diego (founding metro)
      zoom: 8,
      attributionControl: { compact: true },
    })
    mapRef.current = map
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')

    map.on('load', () => {
      const features: GeoJSON.Feature<GeoJSON.Point>[] = cities.map((c) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [c.lng, c.lat] },
        properties: { city: c.city, circles: c.circles, events: c.events },
      }))

      map.addSource('cities', { type: 'geojson', data: { type: 'FeatureCollection', features } })

      map.addLayer({
        id: 'city-dot',
        type: 'circle',
        source: 'cities',
        paint: {
          'circle-color': '#E2912F',
          'circle-opacity': 0.85,
          'circle-radius': ['interpolate', ['linear'], ['get', 'circles'], 1, 11, 10, 26],
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff',
        },
      })
      map.addLayer({
        id: 'city-count',
        type: 'symbol',
        source: 'cities',
        layout: {
          'text-field': ['to-string', ['get', 'circles']],
          'text-size': 12,
          'text-font': ['Noto Sans Regular'],
        },
        paint: { 'text-color': '#2A1B06' },
      })

      if (centerRef.current) {
        map.easeTo({ center: centerRef.current, zoom: 9, duration: 0 })
      } else if (features.length > 0) {
        const bounds = new maplibregl.LngLatBounds()
        for (const f of features) bounds.extend(f.geometry.coordinates as [number, number])
        map.fitBounds(bounds, { padding: 60, maxZoom: 11, duration: 0 })
      }

      map.on('click', 'city-dot', (e) => {
        const f = e.features?.[0]
        if (!f) return
        const geom = f.geometry as GeoJSON.Point
        const props = f.properties ?? {}
        const city = escapeHtml(String(props.city ?? ''))
        const cityParam = encodeURIComponent(String(props.city ?? ''))
        const circles = Number(props.circles ?? 0)
        new maplibregl.Popup({ offset: 12, closeButton: false })
          .setLngLat(geom.coordinates as [number, number])
          .setHTML(
            `<div style="font-weight:600;color:#2A1B06">${city}</div>` +
              `<a href="/discover/circles?city=${cityParam}" style="font-size:13px;color:#A8631B;text-decoration:none">${circles} ${circles === 1 ? 'circle' : 'circles'} →</a>`,
          )
          .addTo(map)
      })

      map.on('mouseenter', 'city-dot', () => { map.getCanvas().style.cursor = 'pointer' })
      map.on('mouseleave', 'city-dot', () => { map.getCanvas().style.cursor = '' })
    })

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [cities])

  // Warm filter to match the cream palette (same treatment as the circles map).
  return (
    <div
      ref={containerRef}
      className={className}
      style={{ filter: 'sepia(0.22) saturate(1.08) hue-rotate(-8deg) brightness(1.02)' }}
    />
  )
}
