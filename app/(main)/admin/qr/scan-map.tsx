'use client'

import { useEffect, useRef } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { ScanLocation } from '@/lib/qr/analytics'

// Keyless vector tiles (same default as the circles/discover maps). Loaded via
// next/dynamic({ssr:false}) — maplibre must never run on the server. Plots one dot
// per ~city cluster, sized by scan count, with a popup. Coords are coarse IP-geo.
const STYLE = process.env.NEXT_PUBLIC_MAP_STYLE || 'https://tiles.openfreemap.org/styles/positron'

export default function ScanMap({
  locations,
  className = 'h-full w-full overflow-hidden rounded-2xl border border-border',
}: {
  locations: ScanLocation[]
  className?: string
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const map = new maplibregl.Map({
      container,
      style: STYLE,
      center: [-98.5, 39.8], // continental US default
      zoom: 3,
      attributionControl: { compact: true },
    })
    mapRef.current = map
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')

    map.on('load', () => {
      const features: GeoJSON.Feature<GeoJSON.Point>[] = locations.map((l) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [l.lng, l.lat] },
        properties: { city: l.city, scans: l.scans },
      }))

      map.addSource('scans', { type: 'geojson', data: { type: 'FeatureCollection', features } })
      map.addLayer({
        id: 'scan-dot',
        type: 'circle',
        source: 'scans',
        paint: {
          'circle-color': '#E2912F',
          'circle-opacity': 0.8,
          'circle-radius': ['interpolate', ['linear'], ['get', 'scans'], 1, 8, 50, 30],
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff',
        },
      })
      map.addLayer({
        id: 'scan-count',
        type: 'symbol',
        source: 'scans',
        layout: { 'text-field': ['to-string', ['get', 'scans']], 'text-size': 11, 'text-font': ['Noto Sans Regular'] },
        paint: { 'text-color': '#2A1B06' },
      })

      if (features.length > 0) {
        const bounds = new maplibregl.LngLatBounds()
        for (const f of features) bounds.extend(f.geometry.coordinates as [number, number])
        map.fitBounds(bounds, { padding: 60, maxZoom: 10, duration: 0 })
      }

      map.on('click', 'scan-dot', (e) => {
        const f = e.features?.[0]
        if (!f) return
        const geom = f.geometry as GeoJSON.Point
        const p = f.properties ?? {}
        const city = String(p.city ?? '').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        const scans = Number(p.scans ?? 0)
        new maplibregl.Popup({ offset: 12, closeButton: false })
          .setLngLat(geom.coordinates as [number, number])
          .setHTML(
            `<div style="font-weight:600;color:#2A1B06">${city}</div>` +
              `<div style="font-size:13px;color:#A8631B">${scans} scan${scans === 1 ? '' : 's'}</div>`,
          )
          .addTo(map)
      })
      map.on('mouseenter', 'scan-dot', () => { map.getCanvas().style.cursor = 'pointer' })
      map.on('mouseleave', 'scan-dot', () => { map.getCanvas().style.cursor = '' })
    })

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [locations])

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ filter: 'sepia(0.22) saturate(1.08) hue-rotate(-8deg) brightness(1.02)' }}
    />
  )
}
