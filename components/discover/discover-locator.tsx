'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { MapPin } from 'lucide-react'
import type { MapCity } from './discover-map'
import { distanceKm } from '@/lib/distance'
import { getApproxLocationByIP } from '@/lib/geolocation'

// maplibre is client-only.
const DiscoverMap = dynamic(() => import('./discover-map'), {
  ssr: false,
  loading: () => (
    <div className="h-full min-h-[20rem] w-full animate-pulse rounded-2xl border border-border bg-surface-elevated" />
  ),
})

// Privacy-safe locator: a city-centroid map + a ranked city list. On mount it
// IP-geolocates the viewer (no permission prompt) to center the map and sort the
// list by nearest city. Every path routes to the city's circles (→ the beta CTA).
export function DiscoverLocator({ cities }: { cities: MapCity[] }) {
  const [center, setCenter] = useState<[number, number] | null>(null)

  useEffect(() => {
    const ctrl = new AbortController()
    getApproxLocationByIP(ctrl.signal).then((loc) => {
      if (loc) setCenter([loc.lng, loc.lat])
    })
    return () => ctrl.abort()
  }, [])

  if (cities.length === 0) return null

  const ranked = center
    ? [...cities].sort(
        (a, b) =>
          distanceKm(center[1], center[0], a.lat, a.lng) -
          distanceKm(center[1], center[0], b.lat, b.lng),
      )
    : cities

  return (
    <div className="grid gap-6 lg:grid-cols-5">
      <div className="lg:col-span-3">
        <div className="h-72 w-full lg:h-full lg:min-h-[22rem]">
          <DiscoverMap
            cities={cities}
            center={center}
            className="h-full min-h-[18rem] w-full overflow-hidden rounded-2xl border border-border shadow-sm"
          />
        </div>
      </div>
      <div className="lg:col-span-2">
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
          {ranked.slice(0, 8).map((c) => (
            <li key={c.city}>
              <Link
                href={`/discover/circles?city=${encodeURIComponent(c.city)}`}
                className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-surface-elevated"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <MapPin className="h-4 w-4 shrink-0 text-primary-strong" />
                  <span className="truncate text-sm font-medium text-text">{c.city}</span>
                </span>
                <span className="shrink-0 text-xs text-muted">
                  {c.circles} {c.circles === 1 ? 'circle' : 'circles'}
                </span>
              </Link>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-subtle">We only ever show the city, never an address.</p>
      </div>
    </div>
  )
}
