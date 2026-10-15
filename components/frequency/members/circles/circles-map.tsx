'use client'

import { useMemo, useState } from 'react'
import { FqIcon } from '@/components/frequency/icon'
import { useCirclesMapZone } from '@/components/circles/circles-map'
import { MapCanvas } from '@/components/maps/map-canvas'
import type { MapCircle, StarterMarker } from '@/components/circles/circle-map'
import type { MapPin } from '@/components/maps/types'

// The Circles map in the kit's idiom (the DAWN block's FindNearMeButton + MapBanner, redrawn). Both
// read the one <MapZone> state the DAWN page uses (IP-centred on mount, precise on "Find circles near
// me", Starter pins projected near the viewer), so the behaviour is the same and only the frame is
// the kit's: a pill button in the filter row, a rounded 16:9 pane above the grid, a quiet legend.

//
// THE MAP IS THE SEAM (SCAN-904). It renders through <MapCanvas> (ADR-901), so it is Google with the
// browsable key and MapLibre without it, in the Frequency basemap and the kit's round white-ringed pins:
// Circles in the presence colour (as on Around You), Starters in the live colour. The DAWN block keeps
// components/circles/circle-map.tsx. The map mounts only when the member opens it, so the Circles list
// never loads or bills a map.

/** The seam's pins for the Circles map: real Circles, then the Starters waiting to be claimed. */
export function circlesMapPins(circles: MapCircle[], starters: StarterMarker[]): MapPin[] {
  return [
    ...circles.map((c) => ({
      id: c.id,
      lat: c.latitude,
      lng: c.longitude,
      title: c.name,
      subtitle: c.neighborhood,
      href: `/circles/${encodeURIComponent(c.slug)}`,
      hrefLabel: 'View the Circle →',
      kind: 'circle' as const,
    })),
    ...starters.map((s) => ({
      id: `starter-${s.slug}`,
      lat: s.lat,
      lng: s.lng,
      title: s.name,
      subtitle: 'Starter Circle · claim it',
      href: `/circles/starter/${encodeURIComponent(s.slug)}`,
      hrefLabel: 'See the Starter →',
      kind: 'starter' as const,
    })),
  ]
}

export function FqFindNearMe() {
  const ctx = useCirclesMapZone()
  const [loading, setLoading] = useState(false)
  if (!ctx) return null
  const zone = ctx
  function find() {
    if (zone.open) {
      zone.setOpen(false)
      return
    }
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      zone.setOpen(true)
      return
    }
    setLoading(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        zone.setCenter([pos.coords.longitude, pos.coords.latitude])
        zone.setOpen(true)
        setLoading(false)
      },
      () => {
        zone.setOpen(true)
        setLoading(false)
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
    )
  }
  return (
    <button type="button" className={zone.open ? 'chip on' : 'chip'} onClick={find} disabled={loading} aria-pressed={zone.open}>
      <FqIcon name="map" />
      {loading ? 'Locating' : zone.open ? 'Hide the map' : 'Find circles near me'}
    </button>
  )
}

export function FqCirclesMapBanner() {
  const ctx = useCirclesMapZone()
  const [key, setKey] = useState(0)
  const circles = ctx?.circles
  const starters = ctx?.starters
  const pins = useMemo(() => circlesMapPins(circles ?? [], starters ?? []), [circles, starters])
  if (!ctx || !ctx.open || pins.length === 0) return null
  const first = pins[0]
  return (
    <div className="fqm-lane">
      <div className="fqm-map wide">
        <MapCanvas
          key={key}
          // The viewer's area when it is known (IP first, precise after "Find circles near me"),
          // otherwise every pin framed.
          center={ctx.center ?? [first.lng, first.lat]}
          zoom={ctx.center ? 10 : 3}
          pins={pins}
          fit={ctx.center ? null : { padding: 60, maxZoom: 11, singleZoom: 11 }}
          recenterTo={ctx.center}
          cluster={{}}
          className="fqm-map-in"
        />
      </div>
      <div className="fqm-legend">
        {ctx.circles.length > 0 && (
          <span className="t2">
            <i className="circle" />
            {ctx.circles.length} in-person {ctx.circles.length === 1 ? 'Circle' : 'Circles'}
          </span>
        )}
        {ctx.starters.length > 0 && (
          <span className="t2">
            <i className="starter" />
            {ctx.starters.length} {ctx.starters.length === 1 ? 'Starter to claim' : 'Starters to claim'}
          </span>
        )}
        <span className="grow" />
        <button type="button" className="btn sm txt" onClick={() => setKey((k) => k + 1)}>
          Reset view
        </button>
        <button type="button" className="btn sm txt" onClick={() => ctx.setOpen(false)}>
          Close
        </button>
      </div>
    </div>
  )
}
