'use client'

import { useEffect, useRef } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

// Default to OpenFreeMap (free vector tiles, no API key) so the map works out of
// the box. Override with a Mapbox/MapTiler style URL via NEXT_PUBLIC_MAP_STYLE.
const STYLE = process.env.NEXT_PUBLIC_MAP_STYLE || 'https://tiles.openfreemap.org/styles/positron'

// Escape user-controlled text before it goes into popup HTML (setHTML).
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export type MapCircle = {
  id: string
  name: string
  slug: string
  latitude: number
  longitude: number
  neighborhood: string | null
}

function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * 6371 * Math.asin(Math.sqrt(a))
}

// Frame the viewer's location together with their nearest circles, so opening
// the map shows the closest circles in their area.
function frameNearest(map: maplibregl.Map, center: [number, number], circles: MapCircle[], count = 5, duration = 800) {
  const bounds = new maplibregl.LngLatBounds()
  bounds.extend(center)
  const nearest = [...circles]
    .sort((a, b) => distanceKm(center[1], center[0], a.latitude, a.longitude) - distanceKm(center[1], center[0], b.latitude, b.longitude))
    .slice(0, count)
  for (const c of nearest) bounds.extend([c.longitude, c.latitude])
  map.fitBounds(bounds, { padding: 60, maxZoom: 11, duration })
}

// In-person circles as clustered amber pins. `interactive=false` renders a calm,
// non-interactive preview (no controls/gestures) — used as the click-to-open
// preview; the expanded view is fully interactive. Loaded via next/dynamic
// (ssr:false) so maplibre never runs on the server.
export default function CircleMap({
  circles,
  interactive = true,
  className = 'h-[420px] w-full overflow-hidden rounded-2xl border border-border',
  center = null,
}: {
  circles: MapCircle[]
  interactive?: boolean
  className?: string
  /** [lng, lat] of the viewer (from IP geo) — the map eases here when it arrives. */
  center?: [number, number] | null
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const centerRef = useRef(center)

  // Once IP geolocation resolves (after first paint), frame the viewer's area
  // and their nearest circles.
  useEffect(() => {
    centerRef.current = center
    if (center && mapRef.current) {
      frameNearest(mapRef.current, center, circles)
    }
    // `circles` is stable per map instance (it re-creates the map on change).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const map = new maplibregl.Map({
      container,
      style: STYLE,
      center: [0, 20],
      zoom: 1.3,
      interactive,
      attributionControl: interactive ? { compact: true } : false,
    })
    mapRef.current = map

    if (interactive) {
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
      map.addControl(
        new maplibregl.GeolocateControl({
          positionOptions: { enableHighAccuracy: true },
          trackUserLocation: true,
          showUserLocation: true,
        }),
        'top-right',
      )
    }

    map.on('load', () => {
      const features: GeoJSON.Feature<GeoJSON.Point>[] = circles.map((c) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [c.longitude, c.latitude] },
        properties: { name: c.name, slug: c.slug, neighborhood: c.neighborhood ?? '' },
      }))

      map.addSource('circles', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features },
        cluster: true,
        clusterMaxZoom: 12,
        clusterRadius: 50,
      })

      map.addLayer({
        id: 'clusters',
        type: 'circle',
        source: 'circles',
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': '#E2912F',
          'circle-opacity': 0.85,
          'circle-radius': ['step', ['get', 'point_count'], 16, 10, 22, 50, 30],
        },
      })
      map.addLayer({
        id: 'cluster-count',
        type: 'symbol',
        source: 'circles',
        filter: ['has', 'point_count'],
        layout: {
          'text-field': ['get', 'point_count_abbreviated'],
          'text-size': 12,
          // OpenFreeMap hosts Noto Sans; the maplibre default (Open Sans) 404s.
          'text-font': ['Noto Sans Regular'],
        },
        paint: { 'text-color': '#2A1B06' },
      })
      map.addLayer({
        id: 'point',
        type: 'circle',
        source: 'circles',
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-color': '#E2912F',
          'circle-radius': 7,
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff',
        },
      })

      if (centerRef.current) {
        // Viewer location already known -> frame them + their nearest circles.
        frameNearest(map, centerRef.current, circles, 5, 0)
      } else if (features.length > 0) {
        const bounds = new maplibregl.LngLatBounds()
        for (const f of features) bounds.extend(f.geometry.coordinates as [number, number])
        map.fitBounds(bounds, { padding: interactive ? 60 : 36, maxZoom: 11, duration: 0 })
      }

      if (!interactive) return

      map.on('click', 'clusters', (e) => {
        const feats = map.queryRenderedFeatures(e.point, { layers: ['clusters'] })
        const clusterId = feats[0]?.properties?.cluster_id as number | undefined
        if (clusterId == null) return
        const source = map.getSource('circles') as maplibregl.GeoJSONSource
        source.getClusterExpansionZoom(clusterId).then((zoom) => {
          const geom = feats[0].geometry as GeoJSON.Point
          map.easeTo({ center: geom.coordinates as [number, number], zoom })
        })
      })

      map.on('click', 'point', (e) => {
        const f = e.features?.[0]
        if (!f) return
        const geom = f.geometry as GeoJSON.Point
        const props = f.properties ?? {}
        // Circle name/neighborhood are user-controlled, so escape before
        // interpolating into popup HTML (otherwise a circle named
        // `<img src=x onerror=...>` is stored XSS for everyone who clicks it).
        const name = escapeHtml(String(props.name ?? 'Circle'))
        const slug = encodeURIComponent(String(props.slug ?? ''))
        const hood = escapeHtml(String(props.neighborhood ?? ''))
        new maplibregl.Popup({ offset: 12, closeButton: false })
          .setLngLat(geom.coordinates as [number, number])
          .setHTML(
            `<a href="/circles/${slug}" style="font-weight:600;color:#A8631B;text-decoration:none">${name}</a>` +
              (hood ? `<div style="font-size:12px;color:#8a7a66;margin-top:2px">${hood}</div>` : ''),
          )
          .addTo(map)
      })

      for (const layer of ['point', 'clusters']) {
        map.on('mouseenter', layer, () => { map.getCanvas().style.cursor = 'pointer' })
        map.on('mouseleave', layer, () => { map.getCanvas().style.cursor = '' })
      }
    })

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [circles, interactive])

  // Subtle warm filter so the (cool, grayscale) base tiles sit on the cream
  // palette instead of fighting it. Amber pins stay amber.
  return (
    <div
      ref={containerRef}
      className={className}
      style={{ filter: 'sepia(0.22) saturate(1.08) hue-rotate(-8deg) brightness(1.02)' }}
    />
  )
}
