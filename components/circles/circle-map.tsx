'use client'

import { useEffect, useRef } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

// Default to OpenFreeMap (free vector tiles, no API key) so the map works out of
// the box. Override with a Mapbox/MapTiler style URL via NEXT_PUBLIC_MAP_STYLE.
const STYLE = process.env.NEXT_PUBLIC_MAP_STYLE || 'https://tiles.openfreemap.org/styles/positron'

export type MapCircle = {
  id: string
  name: string
  slug: string
  latitude: number
  longitude: number
  neighborhood: string | null
}

// Loaded via next/dynamic(ssr:false) from nearby.tsx, so maplibre never runs on
// the server. In-person circles are shown as clustered amber pins; clicking a
// pin opens a popup linking to the circle; the geolocate control centers on you.
export default function CircleMap({ circles }: { circles: MapCircle[] }) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const map = new maplibregl.Map({
      container,
      style: STYLE,
      center: [0, 20],
      zoom: 1.3,
      attributionControl: { compact: true },
    })

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
    map.addControl(
      new maplibregl.GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: true,
        showUserLocation: true,
      }),
      'top-right',
    )

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

      if (features.length > 0) {
        const bounds = new maplibregl.LngLatBounds()
        for (const f of features) bounds.extend(f.geometry.coordinates as [number, number])
        map.fitBounds(bounds, { padding: 60, maxZoom: 11, duration: 0 })
      }

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
        const name = String(props.name ?? 'Circle')
        const slug = String(props.slug ?? '')
        const hood = String(props.neighborhood ?? '')
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

    return () => map.remove()
  }, [circles])

  return <div ref={containerRef} className="h-[420px] w-full overflow-hidden rounded-2xl border border-border" />
}
