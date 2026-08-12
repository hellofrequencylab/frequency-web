'use client'

import { useEffect, useRef } from 'react'
// Namespace import, NOT a default import: maplibre-gl exports no `export default` in its .d.ts,
// so the default form is a compile error. (An earlier note here said this was a concession to a
// v5 pin — package.json has been ^6.x throughout, and v6 is ESM with named exports, which is the
// form this matches.) components/maps/maplibre-interop.test.ts is the one test that imports the
// library for real and would catch the import form drifting from the packaging again.
import * as maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { clusterPoints, shouldRecluster, zoomIntoCluster } from '@/lib/maps/cluster'
import { mapDiag } from '@/lib/maps/diagnostics'
import { resolvePinPaint } from '@/lib/maps/pin-kinds'
import { MAPLIBRE_STYLE, MAPLIBRE_WORKER_URL, WARM_FILTER } from '@/lib/maps/provider'
import { buildClusterMarker, makeMarkerActivatable, onMarkerActivate } from './cluster-marker'
import { configureMaplibreWorker } from './maplibre-worker'
import { buildPopupContent } from './popup-content'
import type { MapImplProps, MapPin } from './types'

// THE MapLibre implementation of the map contract (ADR-901). Every keyless environment
// renders through this file: local dev, previews, CI, self-host, and any production deploy
// without a browsable Google key.
//
// Loaded only through <MapCanvas>, which mounts it via next/dynamic({ssr:false}) — maplibre
// must never run on the server.
//
// ⚠️ THIS FILE IS ONE HALF OF A PAIR. components/maps/google-canvas.tsx implements the same
// props, and components/maps/map-capabilities.test.ts fails if the two prop lists diverge by a
// single key. Every judgement the two could have made differently — a pin's colour, which pins
// merge, how far a cluster tap zooms, what the bubble says — is imported from lib/maps/ rather
// than decided here. A capability implemented on Google and forgotten here would be invisible:
// the fallback is the engine nobody with a key ever loads.

// 🔴 THIS IS WHAT MAKES THE BASEMAP PAINT. Not an escape hatch, not optional — see
// components/maps/maplibre-worker.ts for the mechanism and docs/MAPS.md §4a for the trace.
//
// It USED to be an inline assignment right here, which is how /discover, the Circles map and the
// QR scan map stayed blank after the worker was "fixed": they build their own maplibregl.Map and
// never imported this canvas, so they never ran it. It is a shared call now, and
// maps-wiring.test.ts fails the build if a map module skips it.
configureMaplibreWorker()

/** How long a map may show zero tiles before that is worth one line in the console. Long
 *  enough that a cold cache on a slow phone is not reported as a failure. */
const TILE_WATCHDOG_MS = 8_000

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
  onPinClick,
  cluster = null,
  className = 'h-full w-full',
}: MapImplProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const pinRef = useRef<maplibregl.Marker | null>(null)
  // Picker mode: the pin position the map has already been moved to. Seeded where the marker
  // is created, so the sync effect below can tell a real move from a re-render. See its note.
  const appliedRef = useRef<string | null>(null)
  // Keep the latest callbacks without retriggering the init effect (it must run once per map).
  const onMoveRef = useRef(onMove)
  useEffect(() => {
    onMoveRef.current = onMove
  }, [onMove])
  const onPinClickRef = useRef(onPinClick)
  useEffect(() => {
    onPinClickRef.current = onPinClick
  }, [onPinClick])

  // What a REBUILD depends on. Serialised, not object identity, so a caller passing an
  // inline `pins`/`fit` literal does not tear the map down on every render.
  //
  // In picker mode the pin position is deliberately EXCLUDED: the pin moves constantly
  // (drag, autocomplete pick) and re-creating the map each time would lose the tiles and
  // the interaction state. The sync effect below moves the marker instead.
  const initKey = draggable
    ? JSON.stringify({ picker: true, interactive })
    : JSON.stringify({ pins, area, fit, interactive, cluster })

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

    // ── Diagnostics ─────────────────────────────────────────────────────────────
    // MapLibre routes EVERY style, sprite, glyph, worker and tile failure into this one
    // event. With no subscriber it only console.errors from deep inside the library, which is
    // why a blank basemap has never once told us which request failed. One line per distinct
    // (source, status) pair, so forty dead tiles do not become forty lines.
    map.on('error', (e) => {
      const detail = e as unknown as {
        error?: { message?: string; status?: number; url?: string }
        sourceId?: string
      }
      const sourceId = detail.sourceId ?? null
      const status = detail.error?.status ?? null
      mapDiag(
        'maps.maplibre_error',
        {
          style: MAPLIBRE_STYLE,
          sourceId,
          status,
          url: detail.error?.url ?? null,
          message: detail.error?.message ?? 'unknown',
          workerUrl: MAPLIBRE_WORKER_URL || null,
        },
        `maps.maplibre_error:${sourceId}:${status}`,
      )
    })

    // THE BLANK-BASEMAP SIGNATURE, which had no signal at all until now. Vector tiles are
    // fetched AND decoded inside the web worker, so a worker that never starts looks exactly
    // like a healthy map: the style JSON parses on the main thread, the background layer
    // paints, the attribution renders, and the DOM pin and +/- controls appear. Nothing is
    // broken except that no tile ever arrives. So count tiles, and if none has landed by the
    // time a slow phone would have finished, say so once.
    let tiles = 0
    map.on('sourcedata', (e) => {
      if (e.tile) tiles++
    })
    const tileWatchdog = setTimeout(() => {
      if (tiles > 0) return
      mapDiag('maps.no_tiles', {
        style: MAPLIBRE_STYLE,
        workerUrl: MAPLIBRE_WORKER_URL || null,
        styleLoaded: map.isStyleLoaded(),
        fix: 'No vector tile reached the canvas. Check the Network tab for .pbf requests: none at all means the MapLibre web worker never started (look for a 404 on maplibre-gl-worker.mjs, or a NEXT_PUBLIC_MAPLIBRE_WORKER_URL pointing at a file that does not exist); requests that are blocked mean the tile host is missing from connect-src in next.config.ts.',
      })
    }, TILE_WATCHDOG_MS)

    // ── Pins ────────────────────────────────────────────────────────────────────
    // Added SYNCHRONOUSLY, not on 'load': a marker is DOM, not a style layer, so it needs
    // no loaded style — and in picker mode the click handler below must find `pinRef`
    // populated even if the member taps before the tiles arrive.
    //
    // Clustering never applies in picker mode: there is exactly one pin and the member is
    // placing it. The Google canvas makes the same exclusion for the same reason.
    const clustering = cluster && !draggable ? cluster : null
    const markers: maplibregl.Marker[] = []
    const teardowns: (() => void)[] = []

    const clearMarkers = () => {
      for (const t of teardowns.splice(0)) t()
      for (const m of markers.splice(0)) m.remove()
    }

    const addPin = (pin: MapPin, isDraggablePin: boolean) => {
      const paint = resolvePinPaint(pin)
      const marker = new maplibregl.Marker({
        color: tokenColor(paint.token) ?? paint.fallback,
        draggable: isDraggablePin,
      })
        .setLngLat([pin.lng, pin.lat])
        .addTo(map)
      markers.push(marker)

      const el = marker.getElement()
      const label = pin.label?.trim() || pin.title?.trim() || null
      if (label) {
        el.setAttribute('aria-label', label)
        el.setAttribute('title', label)
      }

      if (isDraggablePin) {
        pinRef.current = marker
        appliedRef.current = `${pin.lat},${pin.lng}`
        marker.on('dragend', () => {
          const { lat, lng } = marker.getLngLat()
          onMoveRef.current?.(lat, lng)
        })
      }

      // A caller that wants to open its own card gets the click and NO popup. Two cards for
      // one tap is worse than either alone. The Google canvas applies the identical rule.
      if (onPinClickRef.current) {
        makeMarkerActivatable(el, label)
        teardowns.push(onMarkerActivate(el, () => onPinClickRef.current?.(pin)))
        return
      }

      const content = buildPopupContent(pin)
      if (content) {
        marker.setPopup(
          new maplibregl.Popup({ offset: 14, closeButton: false }).setDOMContent(content),
        )
      }
    }

    const addCluster = (lat: number, lng: number, count: number) => {
      const el = buildClusterMarker(count)
      const marker = new maplibregl.Marker({ element: el }).setLngLat([lng, lat]).addTo(map)
      markers.push(marker)
      teardowns.push(
        onMarkerActivate(el, () => {
          // Identical to the Google canvas: the same shared step, the same shared cap.
          map.easeTo({ center: [lng, lat], zoom: zoomIntoCluster(map.getZoom()), duration: 400 })
        }),
      )
    }

    const renderMarkers = () => {
      clearMarkers()
      if (!clustering) {
        // Picker mode's draggable pin is the FIRST one, by contract (see MapCanvasProps).
        pins.forEach((pin, index) => addPin(pin, draggable && index === 0))
        return
      }
      for (const group of clusterPoints(pins, map.getZoom(), clustering)) {
        if (group.type === 'cluster') addCluster(group.lat, group.lng, group.count)
        else addPin(group.point, false)
      }
    }

    renderMarkers()

    // Re-group as the member zooms. `shouldRecluster` is the shared guard, so a pinch does not
    // fire dozens of full marker rebuilds — and so both engines redraw at the same threshold.
    let lastZoom = map.getZoom()
    if (clustering) {
      map.on('zoomend', () => {
        const next = map.getZoom()
        if (!shouldRecluster(lastZoom, next)) return
        lastZoom = next
        renderMarkers()
      })
    }

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
      // Framing moves the zoom, so the grouping the markers were built at is now stale.
      if (clustering) {
        lastZoom = map.getZoom()
        renderMarkers()
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
      clearTimeout(tileWatchdog)
      clearMarkers()
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
