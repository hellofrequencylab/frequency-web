'use client'

import { useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { MapPin, Search, Users } from 'lucide-react'
import type { MapCity } from './discover-map'
import { distanceKm } from '@/lib/distance'
import { getApproxLocationByIP } from '@/lib/geolocation'
import { communityHref } from '@/lib/community-href'

// maplibre is client-only.
const DiscoverMap = dynamic(() => import('./discover-map'), {
  ssr: false,
  loading: () => (
    <div className="h-full min-h-[20rem] w-full animate-pulse rounded-2xl border border-border bg-surface-elevated" />
  ),
})

// A single public circle, city-granular only (no street address ever reaches
// the client — see lib/discover.ts getPublicCityClusters privacy note).
export type LocatorCircle = {
  slug: string
  name: string
  city: string | null
  interest: string | null
  memberCount: number
}

// Privacy-safe locator: a city-centroid map + a live search over circles. On
// mount it IP-geolocates the viewer (no permission prompt) to center the map and
// sort the default city list by nearest city. Typing in the search box filters
// circles by name / interest / city and routes each result into the community.
export function DiscoverLocator({
  cities,
  circles = [],
  isAuthed = false,
}: {
  cities: MapCity[]
  circles?: LocatorCircle[]
  isAuthed?: boolean
}) {
  const [center, setCenter] = useState<[number, number] | null>(null)
  const [query, setQuery] = useState('')

  useEffect(() => {
    const ctrl = new AbortController()
    getApproxLocationByIP(ctrl.signal).then((loc) => {
      if (loc) setCenter([loc.lng, loc.lat])
    })
    return () => ctrl.abort()
  }, [])

  const q = query.trim().toLowerCase()
  const isSearching = q.length > 0

  // Live, case-insensitive filter over name, interest/topic, and city.
  const matches = useMemo(() => {
    if (!isSearching) return []
    return circles.filter((c) => {
      const haystack = `${c.name} ${c.interest ?? ''} ${c.city ?? ''}`.toLowerCase()
      return haystack.includes(q)
    })
  }, [circles, q, isSearching])

  // When searching, re-center the map on the matched cities (still city
  // centroids only). Pass just the cities the results live in so the map eases
  // to the relevant cluster; fall back to the IP-geo center otherwise.
  const matchedCities = useMemo(() => {
    if (!isSearching) return cities
    const names = new Set(matches.map((m) => (m.city ?? '').toLowerCase()))
    const subset = cities.filter((c) => names.has(c.city.toLowerCase()))
    return subset.length > 0 ? subset : cities
  }, [cities, matches, isSearching])

  // Center the map on the first matched city when a search narrows the map.
  const mapCenter = useMemo<[number, number] | null>(() => {
    if (isSearching && matchedCities.length > 0) {
      return [matchedCities[0].lng, matchedCities[0].lat]
    }
    return center
  }, [isSearching, matchedCities, center])

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
            cities={matchedCities}
            center={mapCenter}
            className="h-full min-h-[18rem] w-full overflow-hidden rounded-2xl border border-border shadow-sm"
          />
        </div>
      </div>
      <div className="lg:col-span-2">
        <div className="relative mb-3">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search circles, topics, or cities"
            aria-label="Search circles, topics, or cities"
            className="w-full rounded-2xl border border-border bg-surface py-2.5 pl-9 pr-3 text-sm text-text placeholder:text-subtle shadow-sm focus:border-border-strong focus:outline-none focus:ring-2 focus:ring-border-strong/30"
          />
        </div>

        {isSearching ? (
          matches.length > 0 ? (
            <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
              {matches.map((c) => (
                <li key={c.slug}>
                  <Link
                    href={communityHref(`/circles/${c.slug}`, isAuthed)}
                    className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-surface-elevated"
                  >
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-sm font-medium text-text">{c.name}</span>
                      <span className="truncate text-xs text-muted">
                        {[c.interest, c.city].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1 text-xs text-muted">
                      <Users className="h-3.5 w-3.5" />
                      {c.memberCount}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="rounded-2xl border border-border bg-surface px-4 py-6 text-center text-sm text-muted shadow-sm">
              No circles match {`"${query.trim()}"`} yet.
            </div>
          )
        ) : (
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
        )}
        <p className="mt-3 text-xs text-subtle">We only ever show the city, never an address.</p>
      </div>
    </div>
  )
}
