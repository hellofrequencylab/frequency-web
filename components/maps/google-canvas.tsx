'use client'

import { useEffect, useRef, useState } from 'react'
import { loadGoogleMaps } from '@/lib/maps/google-loader'
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
import type { MapImplProps, MapPinTone } from './types'

// THE Google implementation of the map contract (ADR-901). Mounted by <MapCanvas> only when
// a browsable key is configured; a load failure calls `onProviderError` so the seam swaps in
// the MapLibre canvas rather than leaving a dead box.
//
// NO WARM FILTER HERE. The MapLibre canvas wears a sepia filter so OpenFreeMap's cool tiles
// sit on the cream palette. Google's terms forbid altering their logo and attribution, and a
// container filter would recolour both — so the Google basemap is tinted through a Cloud
// styled Map ID instead (NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID), or left at Google's own palette.
//
// CLASSIC Marker, not AdvancedMarkerElement: the advanced marker requires a Map ID on every
// deployment, and we need the keyed path to work the moment the key is set, with no second
// piece of Cloud configuration. The classic marker is still served and still supports a
// token-coloured symbol.

const TONE_VAR: Record<MapPinTone, string> = {
  primary: '--color-primary',
  secondary: '--color-info',
}

// Last-resort literals only. Unlike MapLibre, whose Marker accepts `undefined` and falls back
// internally, a Google Symbol needs a concrete colour string, so `tokenColor` cannot return
// undefined here. Both values mirror the LIGHT-theme token of the same name; they are reached
// only if the custom property is missing (map mounted before the stylesheet resolves).
// token-ok: mirrors --color-surface; Google Symbol requires a concrete colour string
const PIN_STROKE_FALLBACK = '#FFFFFF'
// token-ok: mirrors --color-primary; Google Symbol requires a concrete colour string
const PIN_FALLBACK = '#E2912F'

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

  const onErrorRef = useRef(onProviderError)
  useEffect(() => {
    onErrorRef.current = onProviderError
  }, [onProviderError])

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
    : JSON.stringify({ pins, area, fit, interactive })

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    let cancelled = false
    let map: GoogleMap | null = null
    const markers: GoogleMarker[] = []
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

        // Read from the token, not pinned to white: on a dark theme --color-surface is dark,
        // so the pin ring follows the palette instead of burning a white halo into the map.
        const stroke = tokenColor('--color-surface', PIN_STROKE_FALLBACK)
        info = new maps.InfoWindow()

        pins.forEach((pin, index) => {
          const isDraggablePin = draggable && index === 0
          const marker = new maps.Marker({
            map: map as GoogleMap,
            position: { lat: pin.lat, lng: pin.lng },
            draggable: isDraggablePin,
            ...(pin.title ? { title: pin.title } : {}),
            icon: {
              path: maps.SymbolPath.CIRCLE,
              scale: 8,
              fillColor: tokenColor(TONE_VAR[pin.tone ?? 'primary'], PIN_FALLBACK),
              fillOpacity: 1,
              strokeColor: stroke,
              strokeWeight: 2,
            },
          })
          markers.push(marker)

          if (isDraggablePin) {
            pinRef.current = marker
            appliedRef.current = `${pin.lat},${pin.lng}`
            listeners.push(
              marker.addListener('dragend', () => {
                const pos = marker.getPosition()
                if (pos) onMoveRef.current?.(pos.lat(), pos.lng())
              }),
            )
          }

          const content = buildPopupContent(pin)
          if (content && info && map) {
            const openInfo = () => {
              info?.setContent(content)
              info?.open({ map: map as GoogleMap, anchor: marker })
            }
            listeners.push(marker.addListener('click', openInfo))
          }
        })

        // Close the async gap: if the parent moved the pin while the loader was in flight,
        // adopt the latest position now. Saving the event would otherwise store the stale one.
        const latest = latestPinRef.current
        if (draggable && pinRef.current && latest) {
          const latestKey = `${latest.lat},${latest.lng}`
          if (appliedRef.current !== latestKey) {
            appliedRef.current = latestKey
            pinRef.current.setPosition({ lat: latest.lat, lng: latest.lng })
            map.setCenter({ lat: latest.lat, lng: latest.lng })
          }
        }

        if (area) {
          const paint = tokenColor('--color-primary', PIN_FALLBACK)
          circle = new maps.Circle({
            map,
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
          map.fitBounds(bounds, fit.padding ?? 60)
          const cap = fit.maxZoom ?? 13
          const current = map.getZoom()
          if (current != null && current > cap) map.setZoom(cap)
        } else if (fit && pins.length === 1 && fit.singleZoom != null) {
          map.setCenter({ lat: pins[0].lat, lng: pins[0].lng })
          map.setZoom(fit.singleZoom)
        }

        if (draggable && map) {
          listeners.push(
            map.addListener('click', (e) => {
              if (!e.latLng) return
              const lat = e.latLng.lat()
              const lng = e.latLng.lng()
              pinRef.current?.setPosition({ lat, lng })
              onMoveRef.current?.(lat, lng)
            }),
          )
        }
      })
      .catch(() => {
        if (cancelled) return
        // Bad key, referrer denied, quota, offline, blocked — degrade to MapLibre in place.
        setFailed(true)
        onErrorRef.current?.()
      })

    return () => {
      cancelled = true
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
