'use client'

import { useEffect, useState } from 'react'
import { LocateFixed } from 'lucide-react'
import { MapCanvas } from '@/components/maps/map-canvas'
import { distanceKm } from '@/lib/distance'
import type { MapPin } from '@/components/maps/types'

export type MapCircle = {
  id: string
  name: string
  slug: string
  latitude: number
  longitude: number
  neighborhood: string | null
}

export type StarterMarker = {
  slug: string
  name: string
  lat: number
  lng: number
}

/** Shared provider and design, with nearest-circle framing and opt-in device geolocation. */
export default function CircleMap({
  circles,
  starters = [],
  interactive = true,
  className = 'h-105 w-full overflow-hidden rounded-card border border-border',
  center = null,
}: {
  circles: MapCircle[]
  starters?: StarterMarker[]
  interactive?: boolean
  className?: string
  center?: [number, number] | null
}) {
  const [locating, setLocating] = useState(false)
  const [deviceCenter, setDeviceCenter] = useState<[number, number] | null>(null)
  const [locationError, setLocationError] = useState('')
  useEffect(() => {
    if (!locating || !interactive) return
    if (!navigator.geolocation) return
    const watch = navigator.geolocation.watchPosition(
      ({ coords }) => {
        setDeviceCenter([coords.longitude, coords.latitude])
        setLocationError('')
      },
      () => {
        setLocationError('Location unavailable. You can still explore the map.')
        setLocating(false)
      },
      { enableHighAccuracy: true },
    )
    return () => navigator.geolocation.clearWatch(watch)
  }, [locating, interactive])

  const pins: MapPin[] = [
    ...circles.map((circle) => ({
      id: circle.id,
      lat: circle.latitude,
      lng: circle.longitude,
      title: circle.name,
      subtitle: circle.neighborhood,
      href: `/circles/${encodeURIComponent(circle.slug)}`,
      hrefLabel: 'View circle',
      // Keep the existing circle-map pin role, distinct from starter pins.
      kind: 'place' as const,
    })),
    ...starters.map((starter) => ({
      id: `starter-${starter.slug}`,
      lat: starter.lat,
      lng: starter.lng,
      title: starter.name,
      subtitle: 'Starter Circle · claim it',
      href: `/circles/starter/${encodeURIComponent(starter.slug)}`,
      hrefLabel: 'View Starter Circle',
      kind: 'starter' as const,
      unclustered: true,
    })),
  ]
  const viewer = deviceCenter ?? center
  const points = viewer ? [
    { lng: viewer[0], lat: viewer[1] },
    ...[...pins].sort((a, b) =>
      distanceKm(viewer[1], viewer[0], a.lat, a.lng) - distanceKm(viewer[1], viewer[0], b.lat, b.lng),
    ).slice(0, 5),
  ] : pins

  return (
    <div className={`relative ${className}`}>
      <MapCanvas
        center={viewer ?? [-117.28, 33.1]}
        zoom={8}
        pins={deviceCenter ? [...pins, { id: 'viewer-location', lat: deviceCenter[1], lng: deviceCenter[0], label: 'Your location', kind: 'circle', unclustered: true }] : pins}
        interactive={interactive}
        fit={{ points, padding: interactive ? 60 : 36, maxZoom: 11, singleZoom: 11 }}
        cluster={{ radiusPx: 50, maxZoom: 12 }}
        className="h-full w-full"
      />
      {interactive && (
        <button
          type="button"
          aria-label={locating ? 'Stop following your location' : 'Show your location'}
          aria-pressed={locating}
          onClick={() => {
            if (!navigator.geolocation) {
              setLocationError('Location unavailable. You can still explore the map.')
              return
            }
            setLocating((active) => !active)
          }}
          className="absolute left-3 top-3 z-10 inline-flex min-h-11 min-w-11 items-center justify-center rounded-control bg-surface text-text shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <LocateFixed className="h-5 w-5" aria-hidden="true" />
        </button>
      )}
      {locationError && <p role="status" className="absolute bottom-8 left-3 right-3 rounded-control bg-surface p-2 text-body-sm text-text">{locationError}</p>}
    </div>
  )
}
