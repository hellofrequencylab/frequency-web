'use client'

import { useEffect, useRef } from 'react'
// maplibre-gl 6 is ESM-only with named exports; the namespace import keeps the maplibregl.* call sites unchanged.
import * as maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { MAPLIBRE_STYLE, MAPLIBRE_WORKER_URL, WARM_FILTER } from '@/lib/maps/provider'
import { buildPopupContent } from './popup-content'
import type { MapImplProps, MapPinTone } from './types'

// THE MapLibre implementation of the map contract (ADR-901). Every keyless environment
// renders through this file: local dev, previews, CI, self-host, and any production deploy
// without a browsable Google key.
//
// Loaded only through <MapCanvas>, which mounts it via next/dynamic({ssr:false}) — maplibre
// must never run on the server.

// MapLibre 6 externalised its web worker and resolves it from `import.meta.url` via a
// template literal, which no bundler can statically emit; under Turbopack the worker never
// starts and the vector tiles never paint. Setting `config.WORKER_URL` at a self-hosted copy
// repairs that. Guarded by a feature check so this is an inert no-op on v5 (which inlines
// its worker) and when the env var is unset.
if (MAPLIBRE_WORKER_URL) {
  const config = (maplibregl as unknown as { config?: { WORKER_URL?: string } }).config
  if (config && !config.WORKER_URL) config.WORKER_URL = MAPLIBRE_WORKER_URL
}

const TONE_VAR: Record<MapPinTone, string> = {
  primary: '--color-primary',
  secondary: '--color-info',
}

/** Resolve a DAWN token to its computed colour. Map DOM sits outside Tailwind, so markers
 *  and paint layers read the custom property directly instead of hardcoding a value. */
function tokenColor(name: string): string | undefined {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return v || undefined
}

/** A geographic circle (not a fixed-pixel dot) so an area covers a real radius on the
 *  ground at any zoom. Returns a closed ring of [lng, lat] points. */
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

export default function MapLibreCanvas({
  center,
  zoom,
  pins = [],
  area = null,
  fit = null,
  interactive = true,
  draggable = false,
  onMove,
  recenterTo = null,
  className = 'h-full w-full',
}: MapImplProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const pinRef = useRef<maplibregl.Marker | null>(null)
  // Picker mode: the pin position the map has already been moved to. Seeded where the marker
  // is created, so the sync effect below can tell a real move from a re-render. See its note.
  const appliedRef = useRef<string | null>(null)
  // Keep the latest onMove without retriggering the init effect (it must run once per map).
  const onMoveRef = useRef(onMove)
  useEffect(() => {
    onMoveRef.current = onMove
  }, [onMove])

  // What a REBUILD depends on. Serialised, not object identity, so a caller passing an
  // inline `pins`/`fit` literal does not tear the map down on every render.
  //
  // In picker mode the pin position is deliberately EXCLUDED: the pin moves constantly
  // (drag, autocomplete pick) and re-creating the map each time would lose the tiles and
  // the interaction state. The sync effect below moves the marker instead.
  const initKey = draggable
    ? JSON.stringify({ picker: true, interactive })
    : JSON.stringify({ pins, area, fit, interactive })

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const map = new maplibregl.Map({
      container,
      style: MAPLIBRE_STYLE,
      center,
      zoom,
      interactive,
      attributionControl: { compact: true },
    })
    mapRef.current = map
    if (interactive) {
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
    }

    // ── Pins ────────────────────────────────────────────────────────────────────
    // Added SYNCHRONOUSLY, not on 'load': a marker is DOM, not a style layer, so it needs
    // no loaded style — and in picker mode the click handler below must find `pinRef`
    // populated even if the member taps before the tiles arrive.
    pins.forEach((pin, index) => {
      const color = tokenColor(TONE_VAR[pin.tone ?? 'primary'])
      const isDraggablePin = draggable && index === 0
      const marker = new maplibregl.Marker({ color, draggable: isDraggablePin })
        .setLngLat([pin.lng, pin.lat])
        .addTo(map)

      if (isDraggablePin) {
        pinRef.current = marker
        appliedRef.current = `${pin.lat},${pin.lng}`
        marker.on('dragend', () => {
          const { lat, lng } = marker.getLngLat()
          onMoveRef.current?.(lat, lng)
        })
      }

      const content = buildPopupContent(pin)
      if (content) {
        marker.setPopup(
          new maplibregl.Popup({ offset: 14, closeButton: false }).setDOMContent(content),
        )
      }
    })

    map.on('load', () => {
      // ── Area (the privacy circle) ─────────────────────────────────────────────
      if (area) {
        const paint = tokenColor('--color-primary')
        map.addSource('area', {
          type: 'geojson',
          data: {
            type: 'Feature',
            properties: {},
            geometry: {
              type: 'Polygon',
              coordinates: [circleRing(area.lng, area.lat, area.radiusM)],
            },
          },
        })
        map.addLayer({
          id: 'area-fill',
          type: 'fill',
          source: 'area',
          paint: { 'fill-color': paint, 'fill-opacity': 0.14 },
        })
        map.addLayer({
          id: 'area-outline',
          type: 'line',
          source: 'area',
          paint: { 'line-color': paint, 'line-opacity': 0.5, 'line-width': 2 },
        })
      }

      // ── Framing ───────────────────────────────────────────────────────────────
      if (fit && pins.length > 1) {
        const bounds = new maplibregl.LngLatBounds()
        for (const p of pins) bounds.extend([p.lng, p.lat])
        map.fitBounds(bounds, {
          padding: fit.padding ?? 60,
          maxZoom: fit.maxZoom ?? 13,
          duration: 0,
        })
      } else if (fit && pins.length === 1 && fit.singleZoom != null) {
        map.easeTo({ center: [pins[0].lng, pins[0].lat], zoom: fit.singleZoom, duration: 0 })
      }
    })

    // Tapping the map moves the pin (faster than dragging from far away).
    if (draggable) {
      map.on('click', (e) => {
        pinRef.current?.setLngLat(e.lngLat)
        onMoveRef.current?.(e.lngLat.lat, e.lngLat.lng)
      })
    }

    return () => {
      map.remove()
      mapRef.current = null
      pinRef.current = null
    }
    // `center`/`zoom` are the INITIAL view; later changes are handled by the sync effects
    // below so a prop change never tears the map down (which would lose tiles + interaction).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initKey, draggable])

  // Picker: follow the parent when it moves the pin (an autocomplete pick).
  //
  // Keyed on the pin's COORDINATES, not the `pins` array identity. The picker lives inside a
  // big controlled form, so its parent re-renders on every keystroke and hands us a fresh
  // array literal each time; depending on identity would re-ease the map on each one, undoing
  // a member's own pan and forcing zoom 14. `appliedRef` also swallows the mount run, so an
  // as-yet-unplaced picker keeps its wide zoom-9 view over the fallback centre instead of
  // diving to 14 on a point nobody chose.
  const [pin] = pins
  const pinKey = draggable && pin ? `${pin.lat},${pin.lng}` : null
  useEffect(() => {
    const map = mapRef.current
    const marker = pinRef.current
    if (!draggable || !map || !marker || !pinKey) return
    // Already there (the mount run, or a re-render that changed nothing) — leave the view alone.
    if (appliedRef.current === pinKey) return
    appliedRef.current = pinKey
    const [lat, lng] = pinKey.split(',').map(Number)
    marker.setLngLat([lng, lat])
    map.easeTo({ center: [lng, lat], zoom: Math.max(map.getZoom(), 14), duration: 400 })
  }, [draggable, pinKey])

  // Viewer geolocation arriving after mount.
  useEffect(() => {
    if (!recenterTo || !mapRef.current) return
    mapRef.current.easeTo({ center: recenterTo, zoom: 9, duration: 800 })
  }, [recenterTo])

  return <div ref={containerRef} className={className} style={{ filter: WARM_FILTER }} />
}
