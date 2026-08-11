'use client'

import { useEffect, useRef } from 'react'
// Namespace import, NOT a default import: maplibre-gl declares no `export default` in its
// .d.ts, so the default form is a compile error. (This note used to cite a "v5 pin" as the
// reason — package.json has been ^6.x for this repo's whole history, and v6 is ESM with named
// exports, which is what this form matches.) components/maps/maplibre-interop.test.ts is the one
// test that imports the library for real and would catch the form drifting from the packaging.
import * as maplibregl from 'maplibre-gl'
// v6 no longer re-exports the GeoJSON type globals; import them explicitly.
import type * as GeoJSON from 'geojson'
import 'maplibre-gl/dist/maplibre-gl.css'
import { MAPLIBRE_STYLE } from '@/lib/maps/provider'
import { configureMaplibreWorker } from '@/components/maps/maplibre-worker'
import type { ScanLocation } from '@/lib/qr/analytics'

// Keyless vector tiles (same default as the circles/discover maps). Loaded via
// next/dynamic({ssr:false}) — maplibre must never run on the server. Plots one dot
// per ~city cluster, sized by scan count, with a popup. Coords are coarse IP-geo.
// The style comes from lib/maps/provider (MAPLIBRE_STYLE), not a fourth copy of the same
// env-or-default expression. Identical value; one place to change it.
// 🔴 THE WORKER CONFIG IS LOAD-BEARING HERE. This module builds its own maplibregl.Map rather
// than going through <MapCanvas>, so it does NOT inherit the setup in maplibre-canvas.tsx — which
// is exactly why this map painted blank while event venue maps worked. maps-wiring.test.ts fails
// the build if a map module drops this call. See docs/MAPS.md §4a.
configureMaplibreWorker()

const STYLE = MAPLIBRE_STYLE

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
