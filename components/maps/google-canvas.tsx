'use client'

import { useEffect, useRef, useState } from 'react'
import {
  clusterAccessibleLabel,
  clusterDiameterPx,
  clusterLabel,
  clusterPoints,
  shouldRecluster,
  zoomIntoCluster,
} from '@/lib/maps/cluster'
import { loadGoogleMaps, onGoogleMapsAuthFailure } from '@/lib/maps/google-loader'
import { MAP_CLUSTER_PAINT, MAP_PIN_KINDS, resolvePinPaint } from '@/lib/maps/pin-kinds'
import { googleMapsMapId } from '@/lib/maps/provider'
import { buildPopupContent } from './popup-content'
import type {
  GoogleCircle,
  GoogleInfoWindow,
  GoogleListener,
  GoogleMap,
  GoogleMapsApi,
  GoogleMarker,
} from '@/lib/maps/google-types'
import type { MapImplProps, MapPin } from './types'

// THE Google implementation of the map contract (ADR-901). Mounted by <MapCanvas> only when
// a browsable key is configured; a load failure calls `onProviderError` so the seam swaps in
// the MapLibre canvas rather than leaving a dead box.
//
// ⚠️ THIS FILE IS ONE HALF OF A PAIR. components/maps/maplibre-canvas.tsx implements the same
// props, and components/maps/map-capabilities.test.ts fails if the two prop lists diverge by a
// single key. Every judgement the two could have made differently — a pin's colour, which pins
// merge, how far a cluster tap zooms, what the bubble says — is imported from lib/maps/ rather
// than decided here.
//
// NO WARM FILTER HERE. The MapLibre canvas wears a sepia filter so OpenFreeMap's cool tiles
// sit on the cream palette. Google's terms forbid altering their logo and attribution, and a
// container filter would recolour both — so the Google basemap is tinted through a Cloud
// styled Map ID instead (NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID), or left at Google's own palette.
//
// CLASSIC Marker, not AdvancedMarkerElement: the advanced marker requires a Map ID on every
// deployment, and we need the keyed path to work the moment the key is set, with no second
// piece of Cloud configuration. The classic marker is still served and still supports a
// token-coloured symbol, plus the text label the cluster bubble prints its count into.

// Last-resort literal only. Unlike MapLibre, whose Marker accepts `undefined` and falls back
// internally, a Google Symbol needs a concrete colour string, so `tokenColor` cannot return
// undefined here. Pin and cluster colours carry their own fallbacks in lib/maps/pin-kinds.ts;
// this one covers the marker RING, which is not a pin colour.
// token-ok: mirrors --color-surface; Google Symbol requires a concrete colour string
const PIN_STROKE_FALLBACK = '#FFFFFF'

/** Resolve a DAWN token to its computed colour. Map DOM sits outside Tailwind. */
function tokenColor(name: string, fallback: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return v || fallback
}

export default function GoogleCanvas({
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
  onProviderError,
}: MapImplProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<GoogleMap | null>(null)
  const pinRef = useRef<GoogleMarker | null>(null)
  // Picker mode: the pin position the map has already been moved to. Seeded where the marker
  // is created (AFTER the async loader resolves), so the sync effect below can tell a real
  // move from a re-render. See its note.
  const appliedRef = useRef<string | null>(null)
  const [failed, setFailed] = useState(false)

  const onMoveRef = useRef(onMove)
  useEffect(() => {
    onMoveRef.current = onMove
  }, [onMove])

  const onPinClickRef = useRef(onPinClick)
  useEffect(() => {
    onPinClickRef.current = onPinClick
  }, [onPinClick])

  const onErrorRef = useRef(onProviderError)
  useEffect(() => {
    onErrorRef.current = onProviderError
  }, [onProviderError])

  // 🔴 THE FAILURE THAT NEVER REJECTS. A key with billing not activated, a denied referrer,
  // or an API that was never enabled still returns HTTP 200 and still lets `new maps.Map()`
  // succeed — Google just paints its own grey "can't load Google Maps correctly" watermark
  // and calls `window.gm_authFailure`. The loader promise resolves, so `.catch` below never
  // runs. Without this subscription the seam would leave a member looking at Google's error
  // tile, which is strictly worse than the MapLibre map we already ship.
  useEffect(() => {
    return onGoogleMapsAuthFailure(() => {
      setFailed(true)
      onErrorRef.current?.(
        'Google Maps rejected the browsable key (billing not activated, referrer denied, API not enabled, or bad key)',
      )
    })
  }, [])

  // The latest first pin, for the async gap below. Unlike MapLibre, this canvas builds its map
  // only after the loader script resolves, so the parent can move the pin while it is in
  // flight — and the init effect's closure would otherwise plant the marker at a stale point.
  const latestPinRef = useRef(pins[0])
  useEffect(() => {
    latestPinRef.current = pins[0]
  }, [pins])

  // Same rebuild contract as the MapLibre canvas: serialised, and in picker mode the pin
  // position is excluded so dragging never re-creates the map.
  const initKey = draggable
    ? JSON.stringify({ picker: true, interactive })
    : JSON.stringify({ pins, area, fit, interactive, cluster })

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    let cancelled = false
    let map: GoogleMap | null = null
    const markers: GoogleMarker[] = []
    const markerListeners: GoogleListener[] = []
    const listeners: GoogleListener[] = []
    let circle: GoogleCircle | null = null
    let info: GoogleInfoWindow | null = null

    loadGoogleMaps()
      .then((maps: GoogleMapsApi) => {
        if (cancelled) return

        const mapId = googleMapsMapId()
        map = new maps.Map(container, {
          center: { lat: center[1], lng: center[0] },
          zoom,
          ...(mapId ? { mapId } : {}),
          disableDefaultUI: true,
          zoomControl: interactive,
          clickableIcons: false,
          gestureHandling: interactive ? 'cooperative' : 'none',
          keyboardShortcuts: interactive,
        })
        mapRef.current = map
        const live = map

        // Read from the token, not pinned to white: on a dark theme --color-surface is dark,
        // so the pin ring follows the palette instead of burning a white halo into the map.
        const stroke = tokenColor('--color-surface', PIN_STROKE_FALLBACK)
        info = new maps.InfoWindow()

        // Clustering never applies in picker mode: there is exactly one pin and the member is
        // placing it. The MapLibre canvas makes the same exclusion for the same reason.
        const clustering = cluster && !draggable ? cluster : null

        const clearMarkers = () => {
          for (const l of markerListeners.splice(0)) l.remove()
          for (const m of markers.splice(0)) m.setMap(null)
          info?.close()
        }

        const addPin = (pin: MapPin, isDraggablePin: boolean) => {
          const paint = resolvePinPaint(pin)
          const label = pin.label?.trim() || pin.title?.trim() || null
          const marker = new maps.Marker({
            map: live,
            position: { lat: pin.lat, lng: pin.lng },
            draggable: isDraggablePin,
            ...(label ? { title: label } : {}),
            icon: {
              path: maps.SymbolPath.CIRCLE,
              scale: 8,
              fillColor: tokenColor(paint.token, paint.fallback),
              fillOpacity: 1,
              strokeColor: stroke,
              strokeWeight: 2,
            },
          })
          markers.push(marker)

          if (isDraggablePin) {
            pinRef.current = marker
            appliedRef.current = `${pin.lat},${pin.lng}`
            markerListeners.push(
              marker.addListener('dragend', () => {
                const pos = marker.getPosition()
                if (pos) onMoveRef.current?.(pos.lat(), pos.lng())
              }),
            )
          }

          // A caller that wants to open its own card gets the click and NO popup. Two cards for
          // one tap is worse than either alone. The MapLibre canvas applies the identical rule.
          if (onPinClickRef.current) {
            markerListeners.push(
              marker.addListener('click', () => onPinClickRef.current?.(pin)),
            )
            return
          }

          const content = buildPopupContent(pin)
          if (content) {
            markerListeners.push(
              marker.addListener('click', () => {
                info?.setContent(content)
                info?.open({ map: live, anchor: marker })
              }),
            )
          }
        }

        const addCluster = (lat: number, lng: number, count: number, plus: boolean, only: MapPin | null) => {
          // Same diameter curve and same label text as the MapLibre bubble, read from the same
          // two functions. `scale` on a CIRCLE symbol is a RADIUS, hence the halving.
          const marker = new maps.Marker({
            map: live,
            position: { lat, lng },
            title: clusterAccessibleLabel(count, plus),
            zIndex: 10,
            icon: {
              path: maps.SymbolPath.CIRCLE,
              scale: clusterDiameterPx(count) / 2,
              fillColor: tokenColor(MAP_CLUSTER_PAINT.token, MAP_CLUSTER_PAINT.fallback),
              fillOpacity: 1,
              strokeColor: tokenColor(MAP_CLUSTER_PAINT.ringToken, MAP_CLUSTER_PAINT.ringFallback),
              strokeWeight: 2,
            },
            label: {
              text: clusterLabel(count, plus),
              color: tokenColor(MAP_CLUSTER_PAINT.textToken, MAP_CLUSTER_PAINT.textFallback),
              fontSize: '13px',
              fontWeight: '600',
            },
          })
          markers.push(marker)

          // 🔴 A BUBBLE OF ONE OPENS, IT DOES NOT ZOOM. That bubble is a repeating event folded to
          // a single pin, so there is nothing inside it to split: zooming would step in twice and
          // leave the same `1+` sitting there, which reads as a dead control. The MapLibre canvas
          // applies the identical rule, from the same `points.length === 1` test.
          if (only) {
            const content = buildPopupContent(only)
            markerListeners.push(
              marker.addListener('click', () => {
                if (onPinClickRef.current) {
                  onPinClickRef.current(only)
                  return
                }
                if (!content) return
                info?.setContent(content)
                info?.open({ map: live, anchor: marker })
              }),
            )
            return
          }

          markerListeners.push(
            marker.addListener('click', () => {
              // Identical to the MapLibre canvas: the same shared step, the same shared cap.
              live.panTo({ lat, lng })
              live.setZoom(zoomIntoCluster(live.getZoom() ?? zoom))
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
          for (const group of clusterPoints(pins, live.getZoom() ?? zoom, clustering)) {
            if (group.type === 'cluster') {
              addCluster(
                group.lat,
                group.lng,
                group.count,
                group.plus,
                group.points.length === 1 ? group.points[0]! : null,
              )
            } else addPin(group.point, false)
          }
        }

        renderMarkers()

        // Re-group as the member zooms. `shouldRecluster` is the shared guard, so a pan (which
        // also fires `idle`) does no work — and so both engines redraw at the same threshold.
        let lastZoom = live.getZoom() ?? zoom
        if (clustering) {
          listeners.push(
            live.addListener('idle', () => {
              const next = live.getZoom() ?? lastZoom
              if (!shouldRecluster(lastZoom, next)) return
              lastZoom = next
              renderMarkers()
            }),
          )
        }

        // Close the async gap: if the parent moved the pin while the loader was in flight,
        // adopt the latest position now. Saving the event would otherwise store the stale one.
        const latest = latestPinRef.current
        if (draggable && pinRef.current && latest) {
          const latestKey = `${latest.lat},${latest.lng}`
          if (appliedRef.current !== latestKey) {
            appliedRef.current = latestKey
            pinRef.current.setPosition({ lat: latest.lat, lng: latest.lng })
            live.setCenter({ lat: latest.lat, lng: latest.lng })
          }
        }

        if (area) {
          const place = MAP_PIN_KINDS.place
          const paint = tokenColor(place.token, place.fallback)
          circle = new maps.Circle({
            map: live,
            center: { lat: area.lat, lng: area.lng },
            radius: area.radiusM,
            fillColor: paint,
            fillOpacity: 0.14,
            strokeColor: paint,
            strokeOpacity: 0.5,
            strokeWeight: 2,
            clickable: false,
          })
        }

        if (fit && pins.length > 1) {
          const bounds = new maps.LatLngBounds()
          for (const p of pins) bounds.extend({ lat: p.lat, lng: p.lng })
          live.fitBounds(bounds, fit.padding ?? 60)
          const cap = fit.maxZoom ?? 13
          const current = live.getZoom()
          if (current != null && current > cap) live.setZoom(cap)
        } else if (fit && pins.length === 1 && fit.singleZoom != null) {
          live.setCenter({ lat: pins[0].lat, lng: pins[0].lng })
          live.setZoom(fit.singleZoom)
        }
        // Framing moves the zoom, so the grouping the markers were built at is now stale.
        if (clustering && fit) {
          lastZoom = live.getZoom() ?? lastZoom
          renderMarkers()
        }

        if (draggable) {
          listeners.push(
            live.addListener('click', (e) => {
              if (!e.latLng) return
              const lat = e.latLng.lat()
              const lng = e.latLng.lng()
              pinRef.current?.setPosition({ lat, lng })
              onMoveRef.current?.(lat, lng)
            }),
          )
        }
      })
      .catch((error: unknown) => {
        if (cancelled) return
        // No key, script blocked, no API surface, key already rejected, watchdog timeout —
        // degrade to MapLibre in place, CARRYING THE REASON. Swallowing it here is what kept
        // a deterministic loader bug invisible for three rounds; the seam logs it.
        setFailed(true)
        onErrorRef.current?.(error instanceof Error ? error.message : String(error))
      })

    return () => {
      cancelled = true
      for (const l of markerListeners) l.remove()
      for (const l of listeners) l.remove()
      for (const m of markers) m.setMap(null)
      circle?.setMap(null)
      info?.close()
      mapRef.current = null
      pinRef.current = null
      map = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initKey, draggable])

  // Picker: follow the parent when it moves the pin (an autocomplete pick).
  //
  // Keyed on the pin's COORDINATES, not the `pins` array identity, and the mount run is
  // swallowed — identical contract to the MapLibre canvas, for the same reason: the picker's
  // parent form re-renders on every keystroke with a fresh array literal, and re-panning on
  // each one would undo a member's own pan and force zoom 14 on an unplaced picker.
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
    marker.setPosition({ lat, lng })
    map.panTo({ lat, lng })
    const current = map.getZoom()
    if (current == null || current < 14) map.setZoom(14)
  }, [draggable, pinKey])

  // Viewer geolocation arriving after mount.
  useEffect(() => {
    const map = mapRef.current
    if (!recenterTo || !map) return
    map.panTo({ lat: recenterTo[1], lng: recenterTo[0] })
    map.setZoom(9)
  }, [recenterTo])

  // The seam re-renders MapLibre once `onProviderError` fires; until it does (and for any
  // caller that did not pass one), render nothing rather than an empty grey box.
  if (failed) return null

  return <div ref={containerRef} className={className} />
}
