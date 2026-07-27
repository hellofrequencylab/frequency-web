'use client'

import { useState } from 'react'
import Link from 'next/link'
import { LocateFixed, Loader2, MapPin } from 'lucide-react'
import { distanceKm } from '@/lib/distance'
import type { ChapterSummary } from '@/lib/channels/programs'

// The Chapters directory grid on a program Channel page. The server page hands
// us the ready ChapterSummary rows; this component only re-orders them. "Near
// me" asks the browser for a one-shot location, computes haversine distance
// client-side (lib/distance — the type-only programs import is erased at build,
// so no server code rides into the bundle), and re-sorts closest first. No
// refetch, no persistence of the location.
export function ChaptersNearMe({ chapters }: { chapters: ChapterSummary[] }) {
  const [ordered, setOrdered] = useState<ChapterSummary[]>(chapters)
  const [sorted, setSorted] = useState(false)
  const [locating, setLocating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const anyCoords = chapters.some((c) => c.latitude != null && c.longitude != null)

  const sortNearMe = () => {
    setError(null)
    if (!('geolocation' in navigator)) {
      setError('Your browser does not share location. The list stays in its default order.')
      return
    }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords
        const next = chapters
          .map((c) => ({
            ...c,
            distanceKm:
              c.latitude != null && c.longitude != null
                ? distanceKm(lat, lng, c.latitude, c.longitude)
                : null,
          }))
          .sort((a, b) => {
            if (a.distanceKm == null && b.distanceKm == null) return 0
            if (a.distanceKm == null) return 1
            if (b.distanceKm == null) return -1
            return a.distanceKm - b.distanceKm
          })
        setOrdered(next)
        setSorted(true)
        setLocating(false)
      },
      () => {
        setError('We could not read your location. Check the browser permission and try again.')
        setLocating(false)
      },
      { maximumAge: 300_000, timeout: 10_000 },
    )
  }

  return (
    <div>
      {anyCoords && (
        <div className="mb-3 flex items-center justify-end gap-2">
          {sorted && !error && (
            <span className="text-xs text-muted">Closest first</span>
          )}
          <button
            type="button"
            onClick={sortNearMe}
            disabled={locating}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-text transition-colors hover:bg-surface-elevated disabled:opacity-60"
          >
            {locating
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              : <LocateFixed className="h-3.5 w-3.5" aria-hidden />}
            {locating ? 'Locating…' : 'Near me'}
          </button>
        </div>
      )}
      {error && <p className="mb-3 text-xs text-danger text-right">{error}</p>}

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {ordered.map((c) => (
          <Link
            key={c.id}
            href={`/circles/${c.slug}`}
            className="block rounded-2xl border border-border bg-surface px-3 py-2.5 hover:border-primary-bg dark:hover:border-primary transition-colors"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-text truncate">
                {c.name}
              </span>
              <span className={`text-xs px-1.5 py-0.5 rounded-md font-medium shrink-0 ${
                c.type === 'in-person'
                  ? 'bg-success-bg text-success'
                  : 'bg-signal-bg text-signal-strong'
              }`}>
                {c.type === 'in-person' ? 'In-person' : 'Online'}
              </span>
            </div>
            <div className="mt-1 flex items-center gap-2 text-xs text-muted">
              {(c.city || c.neighborhood) && (
                <span className="flex items-center gap-0.5">
                  <MapPin className="w-2.5 h-2.5" />
                  {c.neighborhood || c.city}
                </span>
              )}
              <span>
                {c.memberCount}/{c.memberCap} members
              </span>
              {sorted && c.distanceKm != null && (
                <span>
                  {c.distanceKm < 1 ? 'under 1 km' : `${Math.round(c.distanceKm)} km`} away
                </span>
              )}
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
