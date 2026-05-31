'use client'

import { useState } from 'react'
import Link from 'next/link'
import { MapPin, LocateFixed } from 'lucide-react'

interface NearCircle {
  id: string
  name: string
  slug: string
  latitude: number
  longitude: number
  neighborhood: string | null
}

function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371
  const dLat = ((bLat - aLat) * Math.PI) / 180
  const dLng = ((bLng - aLng) * Math.PI) / 180
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(s))
}

function formatKm(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`
  if (km < 10) return `${km.toFixed(1)} km`
  return `${Math.round(km)} km`
}

type Status = 'idle' | 'loading' | 'ready' | 'denied' | 'unsupported'

// "Circles near you": uses the browser's location to rank in-person circles by
// distance. No map library (deliberately): a distance-sorted list is the
// actionable core of proximity discovery, and it ships verifiable.
export function NearYou({ circles }: { circles: NearCircle[] }) {
  const [status, setStatus] = useState<Status>('idle')
  const [results, setResults] = useState<(NearCircle & { km: number })[]>([])

  function findNearby() {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setStatus('unsupported')
      return
    }
    setStatus('loading')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords
        const ranked = circles
          .map((c) => ({ ...c, km: haversineKm(latitude, longitude, c.latitude, c.longitude) }))
          .sort((a, b) => a.km - b.km)
          .slice(0, 8)
        setResults(ranked)
        setStatus('ready')
      },
      () => setStatus('denied'),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
    )
  }

  if (circles.length === 0) return null

  return (
    <div className="mb-6 rounded-2xl border border-border bg-surface shadow-sm p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-primary-strong" />
          <h3 className="text-sm font-semibold text-text">Circles near you</h3>
        </div>
        {status !== 'ready' && (
          <button
            onClick={findNearby}
            disabled={status === 'loading'}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-60"
          >
            <LocateFixed className="h-4 w-4" />
            {status === 'loading' ? 'Locating…' : 'Find circles near me'}
          </button>
        )}
      </div>

      {status === 'denied' && (
        <p className="mt-3 text-sm text-muted">
          Location access was blocked. Enable it in your browser to find circles near you.
        </p>
      )}
      {status === 'unsupported' && (
        <p className="mt-3 text-sm text-muted">
          Your browser cannot share location. Browse the list below instead.
        </p>
      )}

      {status === 'ready' &&
        (results.length === 0 ? (
          <p className="mt-3 text-sm text-muted">
            No in-person circles with a location yet. Check back soon.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-border">
            {results.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/circles/${c.slug}`}
                  className="flex items-center justify-between gap-3 py-2.5 hover:opacity-80"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-text">{c.name}</span>
                    {c.neighborhood && (
                      <span className="block truncate text-xs text-subtle">{c.neighborhood}</span>
                    )}
                  </span>
                  <span className="shrink-0 text-xs font-medium text-muted">{formatKm(c.km)}</span>
                </Link>
              </li>
            ))}
          </ul>
        ))}
    </div>
  )
}
