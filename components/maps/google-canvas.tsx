'use client'

import { useEffect, useRef, useState } from 'react'
import {
  clusterAccessibleLabel,
  clusterDiameterPx,
  clusterLabel,
  clusterPoints,
  clusterStepDiameterPx,
  FREQUENCY_CLUSTER_OPTIONS,
  shouldRecluster,
  zoomIntoCluster,
} from '@/lib/maps/cluster'
import { googleMapStyles, isDesignMap, readBasemapPalette, watchColorMode } from '@/lib/maps/basemap-look'
import { loadGoogleMaps, onGoogleMapsAuthFailure } from '@/lib/maps/google-loader'
import {
  FREQUENCY_PIN,
  FREQUENCY_PIN_RING,
  MAP_CLUSTER_PAINT,
  resolvePinPaint,
} from '@/lib/maps/pin-kinds'
import { googleMapsMapId } from '@/lib/maps/provider'
import { frequencyBadgeSvg } from './cluster-marker'
import { areaAccessibleLabel, buildAreaPopupContent, buildPopupContent } from './popup-content'
import { useNearViewport } from './use-near-viewport'
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

/** Resolve a token at the map, where website and dark-section palettes may override the root. */
function tokenColor(container: Element, name: string, fallback: string): string {
  const v = getComputedStyle(container).getPropertyValue(name).trim()
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
  // Under Frequency nothing loads or bills until this box nears the viewport (SCAN-904).
  const near = useNearViewport(containerRef)

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
    if (!container || !near) return

    let cancelled = false
    let map: GoogleMap | null = null
    const markers: GoogleMarker[] = []
    const markerListeners: GoogleListener[] = []
    const repaintPins: (() => void)[] = []
    const listeners: GoogleListener[] = []
    let circle: GoogleCircle | null = null
    let info: GoogleInfoWindow | null = null
    let stopWatchingMode: (() => void) | null = null

    loadGoogleMaps()
      .then((maps: GoogleMapsApi) => {
        if (cancelled) return

        const mapId = googleMapsMapId()
        // The design's basemap (lib/maps/basemap-look.ts), read at this container so a dark band
        // gets a dark map. A Cloud Map ID owns styling when set; null under DAWN.
        const palette = mapId ? null : readBasemapPalette(container)
        const designPins = isDesignMap(container)
        map = new maps.Map(container, {
          center: { lat: center[1], lng: center[0] },
          zoom,
          ...(mapId ? { mapId } : {}),
          ...(palette ? { styles: googleMapStyles(palette), backgroundColor: palette.land } : {}),
          disableDefaultUI: true,
          zoomControl: interactive,
          // SCAN-918: only the zoom buttons, pinned bottom right, so nothing Google draws sits under the
          // full-screen map's "Close map" pill (top left) or the expand control. Map type, Street View,
          // fullscreen and rotate stay off explicitly, whatever disableDefaultUI does in a future API.
          ...(designPins
            ? {
                ...(interactive ? { zoomControlOptions: { position: maps.ControlPosition.RIGHT_BOTTOM } } : {}),
                mapTypeControl: false,
                streetViewControl: false,
                fullscreenControl: false,
                rotateControl: false,
              }
            : {}),
          clickableIcons: false,
          gestureHandling: interactive ? 'cooperative' : 'none',
          keyboardShortcuts: interactive,
        })
        mapRef.current = map
        const live = map

        // DAWN reads the ring from the token, not pinned to white: on a dark theme --color-surface is
        // dark, so the ring follows the palette. Frequency's pin is the kit's round dot with a WHITE
        // ring in every mode (SCAN-904, lib/maps/pin-kinds.ts FREQUENCY_PIN_RING).
        const stroke = () => designPins ? FREQUENCY_PIN_RING : tokenColor(container, '--color-surface', PIN_STROKE_FALLBACK)
        const pinScale = designPins ? FREQUENCY_PIN.diameterPx / 2 : 8
        const pinStrokeWeight = designPins ? FREQUENCY_PIN.ringPx : 2
        info = new maps.InfoWindow()

        // Clustering never applies in picker mode: there is exactly one pin and the member is
        // placing it. The MapLibre canvas makes the same exclusion for the same reason.
        // Under Frequency the badges cluster wider, keep a gap and hold co-located pins as one area
        // (SCAN-918, lib/maps/cluster.ts FREQUENCY_CLUSTER_OPTIONS); a caller's own options still win.
        const clustering = cluster && !draggable ? (designPins ? { ...FREQUENCY_CLUSTER_OPTIONS, ...cluster } : cluster) : null

        const clearMarkers = () => {
          repaintPins.length = 0
          for (const l of markerListeners.splice(0)) l.remove()
          for (const m of markers.splice(0)) m.setMap(null)
          info?.close()
        }

        const addPin = (pin: MapPin, isDraggablePin: boolean) => {
          const paint = resolvePinPaint(pin, designPins)
          const label = pin.label?.trim() || pin.title?.trim() || null
          const counted = pin.count == null ? null : (designPins ? badge(pin.count) : null)
          const icon = () => (counted?.icon ?? {
              path: maps.SymbolPath.CIRCLE,
              scale: pin.count == null ? pinScale : clusterDiameterPx(pin.count) / 2,
              fillColor: tokenColor(container, paint.token, paint.fallback),
              fillOpacity: 1,
              strokeColor: stroke(),
              strokeWeight: pinStrokeWeight,
            })
          const marker = new maps.Marker({
            map: live,
            position: { lat: pin.lat, lng: pin.lng },
            draggable: isDraggablePin,
            ...(label ? { title: label } : {}),
            ...(pin.count == null ? {} : { label: {
              text: clusterLabel(pin.count),
              color: designPins ? FREQUENCY_PIN_RING : tokenColor(container, MAP_CLUSTER_PAINT.textToken, MAP_CLUSTER_PAINT.textFallback),
              fontSize: counted?.fontSize ?? '13px', fontWeight: '700',
            } }),
            icon: icon(),
          })
          markers.push(marker)
          repaintPins.push(() => marker.setIcon(icon()))

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

          const content = buildPopupContent(pin, designPins)
          if (content) {
            markerListeners.push(
              marker.addListener('click', () => {
                info?.setContent(content)
                info?.open({ map: live, anchor: marker })
              }),
            )
          }
        }

        // THE FREQUENCY BADGE (SCAN-918): the shared gradient disc as an SVG image, stepped in size, with
        // a white bold count whose soft shadow comes from the theme sheet (.fq-map-cluster-count).
        const badge = (count: number) => {
          const d = clusterStepDiameterPx(count)
          const { url, box } = frequencyBadgeSvg(d)
          return {
            icon: {
              url,
              scaledSize: new maps.Size(box, box),
              anchor: new maps.Point(box / 2, box / 2),
              labelOrigin: new maps.Point(box / 2, box / 2),
            },
            fontSize: d >= 50 ? '15px' : '13px',
          }
        }

        const addCluster = (
          lat: number,
          lng: number,
          count: number,
          plus: boolean,
          only: MapPin | null,
          areaPins: MapPin[] | null = null,
        ) => {
          // Same diameter curve and same label text as the MapLibre bubble, read from the same
          // two functions. `scale` on a CIRCLE symbol is a RADIUS, hence the halving.
          const look = designPins ? badge(count) : null
          const marker = new maps.Marker({
            map: live,
            position: { lat, lng },
            title: areaPins ? areaAccessibleLabel(areaPins) : clusterAccessibleLabel(count, plus),
            zIndex: 10,
            icon: look ? look.icon : {
              path: maps.SymbolPath.CIRCLE,
              scale: clusterDiameterPx(count) / 2,
              fillColor: tokenColor(container, MAP_CLUSTER_PAINT.token, MAP_CLUSTER_PAINT.fallback),
              fillOpacity: 1,
              strokeColor: designPins
                ? FREQUENCY_PIN_RING
                : tokenColor(container, MAP_CLUSTER_PAINT.ringToken, MAP_CLUSTER_PAINT.ringFallback),
              strokeWeight: 2,
            },
            label: look
              ? {
                  text: clusterLabel(count, plus),
                  color: FREQUENCY_PIN_RING,
                  fontSize: look.fontSize,
                  fontWeight: '700',
                  className: 'fq-map-cluster-count',
                }
              : {
                  text: clusterLabel(count, plus),
                  color: tokenColor(container, MAP_CLUSTER_PAINT.textToken, MAP_CLUSTER_PAINT.textFallback),
                  fontSize: '13px',
                  fontWeight: '600',
                },
          })
          markers.push(marker)

          // A GENERAL AREA (SCAN-918): pins on one exact coordinate, which no zoom can split. The badge
          // opens the list of what is there, "N events around Encinitas", instead of zooming forever.
          if (areaPins) {
            const content = buildAreaPopupContent(areaPins, onPinClickRef.current ?? undefined)
            markerListeners.push(
              marker.addListener('click', () => {
                info?.setContent(content)
                info?.open({ map: live, anchor: marker })
              }),
            )
            return
          }

          // 🔴 A BUBBLE OF ONE OPENS, IT DOES NOT ZOOM. That bubble is a repeating event folded to
          // a single pin, so there is nothing inside it to split: zooming would step in twice and
          // leave the same `1+` sitting there, which reads as a dead control. The MapLibre canvas
          // applies the identical rule, from the same `points.length === 1` test.
          if (only) {
            const content = buildPopupContent(only, designPins)
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
            // Under Frequency, pins on one exact coordinate become one area badge even with clustering
            // off (SCAN-918); every pin with a spot of its own stays exactly where it is.
            if (designPins && !draggable && !pins.some((pin) => pin.count != null)) {
              for (const group of clusterPoints(pins, live.getZoom() ?? zoom, { radiusPx: 0, coLocated: true })) {
                if (group.type === 'cluster' && group.area) {
                  addCluster(group.lat, group.lng, group.count, group.plus, null, group.points)
                } else if (group.type === 'cluster') addPin(group.points[0]!, false)
                else addPin(group.point, false)
              }
              return
            }
            // Picker mode's draggable pin is the FIRST one, by contract (see MapCanvasProps).
            pins.forEach((pin, index) => addPin(pin, draggable && index === 0))
            return
          }
          pins.filter((pin) => pin.unclustered || pin.count != null).forEach((pin) => addPin(pin, false))
          for (const group of clusterPoints(pins.filter((pin) => !pin.unclustered && pin.count == null), live.getZoom() ?? zoom, clustering)) {
            if (group.type === 'cluster') {
              addCluster(
                group.lat,
                group.lng,
                group.count,
                group.plus,
                group.points.length === 1 ? group.points[0]! : null,
                group.area ? group.points : null,
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
          const place = resolvePinPaint({ kind: 'place' }, designPins)
          const paint = tokenColor(container, place.token, place.fallback)
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

        // Repaint symbols in place so mode changes keep picker position, map zoom and open popups.
        // Cloud Map IDs own their basemap, but our marker tokens still need to follow the local mode.
        stopWatchingMode = watchColorMode(() => {
          if (!mapId) {
            const next = readBasemapPalette(container)
            if (next) live.setOptions({ styles: googleMapStyles(next), backgroundColor: next.land })
          }
          repaintPins.forEach((repaint) => repaint())
          if (circle) {
            const place = resolvePinPaint({ kind: 'place' }, designPins)
            const paint = tokenColor(container, place.token, place.fallback)
            circle.setOptions({ fillColor: paint, strokeColor: paint })
          }
        })

        const framePoints = fit?.points ?? pins
        if (fit && framePoints.length > 1) {
          const bounds = new maps.LatLngBounds()
          for (const p of framePoints) bounds.extend({ lat: p.lat, lng: p.lng })
          live.fitBounds(bounds, fit.padding ?? 60)
          const cap = fit.maxZoom ?? 13
          const current = live.getZoom()
          if (current != null && current > cap) live.setZoom(cap)
        } else if (fit && framePoints.length === 1 && fit.singleZoom != null) {
          live.setCenter({ lat: framePoints[0].lat, lng: framePoints[0].lng })
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
      stopWatchingMode?.()
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
  }, [initKey, draggable, near])

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
    const position = { lat: recenterTo[1], lng: recenterTo[0] }
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) map.setCenter(position)
    else map.panTo(position)
    map.setZoom(9)
  }, [recenterTo])

  // The seam re-renders MapLibre once `onProviderError` fires; until it does (and for any
  // caller that did not pass one), render nothing rather than an empty grey box.
  if (failed) return null

  return <div ref={containerRef} className={className} />
}
