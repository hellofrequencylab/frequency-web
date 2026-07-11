'use client'

import { useMemo, useState, type ReactNode } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { MapPin, Navigation, Loader2, Tag } from 'lucide-react'
import { distanceKm } from '@/lib/distance'
import { getBrowserPosition } from '@/lib/geo-browser'
import { LISTING_KINDS, type ListingKind } from '@/lib/marketplace'
import { useMarketQuery, marketMatch } from '@/components/marketplace/market-search'

const KIND_LABEL: Record<ListingKind, string> = Object.fromEntries(LISTING_KINDS.map((k) => [k.key, k.label])) as Record<ListingKind, string>

export interface GridListing {
  id: string
  title: string
  kind: ListingKind
  description: string | null
  neighborhood: string | null
  city: string | null
  images: string[]
  latitude: number | null
  longitude: number | null
  author: { display_name: string } | null
}

function Card({ l, distance }: { l: GridListing; distance: number | null }) {
  const place = [l.neighborhood, l.city].filter(Boolean).join(', ')
  const kindLabel = KIND_LABEL[l.kind] ?? l.kind
  return (
    <Link
      href={`/classifieds/${l.id}`}
      className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-sm transition-colors hover:border-primary/60"
    >
      {/* COVER — the type pill lives here, overlaid top-left, so it never repeats in the body (C3/C4).
          A gradient placeholder stands in when a listing has no photo, so the pill always has a home. */}
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-surface-elevated">
        {l.images[0] ? (
          <Image
            src={l.images[0]}
            alt=""
            fill
            sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
            className="object-cover transition-transform duration-300 group-hover:scale-[1.02] motion-reduce:transition-none"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary-bg via-surface-elevated to-signal-bg">
            <Tag className="h-7 w-7 text-primary-strong/40" aria-hidden />
          </div>
        )}
        {/* Ink scrim at the top so the chip reads over any photo. */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-ink/45 to-transparent" aria-hidden />
        <span className="absolute left-3 top-3 inline-flex items-center rounded-full bg-surface/90 px-2.5 py-0.5 text-2xs font-semibold uppercase tracking-wide text-text shadow-sm backdrop-blur-sm">
          {kindLabel}
        </span>
      </div>
      <div className="flex flex-1 flex-col p-4">
        <h3 className="text-sm font-bold text-text">{l.title}</h3>
        {l.description && <p className="mt-1 line-clamp-2 text-sm text-muted">{l.description}</p>}
        {/* Location, then the poster's name on the row below (C5). */}
        <div className="mt-3 space-y-1 text-xs text-subtle">
          {distance != null ? (
            <p className="inline-flex items-center gap-1 text-primary-strong">
              <Navigation className="h-3 w-3" aria-hidden />
              {distance < 1 ? '<1' : Math.round(distance)} km
            </p>
          ) : place ? (
            <p className="inline-flex items-center gap-1">
              <MapPin className="h-3 w-3" aria-hidden />
              {place}
            </p>
          ) : null}
          {l.author && <p className="truncate text-muted">{l.author.display_name}</p>}
        </div>
      </div>
    </Link>
  )
}

export function MarketGrid({
  listings,
  filters,
  columns,
  emptyState,
}: {
  listings: GridListing[]
  /** The kind tab strip, rendered inline with the Near me button in one filter row (C2). */
  filters?: ReactNode
  /** The card-density control, right-aligned in the filter row. Hidden when there is nothing to show. */
  columns?: ReactNode
  /** Shown in place of the grid when this filter has no listings at all (the filter row stays visible). */
  emptyState?: ReactNode
}) {
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [locating, setLocating] = useState(false)
  // The shared hero search query — filters the grid instantly on every keystroke (no server round-trip).
  const query = useMarketQuery()

  const nearMe = async () => {
    if (coords) { setCoords(null); return } // toggle off
    setLocating(true)
    const pos = await getBrowserPosition()
    setLocating(false)
    if (pos) setCoords(pos)
  }

  // Instant search first, then (when located) sort by distance (listings without coords sink to the bottom).
  const ordered = useMemo(() => {
    const matched = query
      ? listings.filter((l) => marketMatch(`${l.title} ${l.description ?? ''}`, query))
      : listings
    if (!coords) return matched.map((l) => ({ l, distance: null as number | null }))
    return matched
      .map((l) => ({
        l,
        distance: l.latitude != null && l.longitude != null ? distanceKm(coords.lat, coords.lng, l.latitude, l.longitude) : null,
      }))
      .sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity))
  }, [listings, coords, query])

  const hasListings = listings.length > 0

  return (
    <div className="space-y-4">
      {/* One filter row: Near me on the left, inline with the kind tabs; density control trails right (C2). */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <button
          type="button"
          onClick={nearMe}
          disabled={locating}
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-60 motion-reduce:transition-none ${coords ? 'bg-primary text-on-primary' : 'border border-border text-text hover:bg-surface-elevated'}`}
        >
          {locating ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Navigation className="h-4 w-4" aria-hidden />}
          {coords ? 'Sorted by distance' : 'Near me'}
        </button>
        {filters && <div className="min-w-0 flex-1">{filters}</div>}
        {hasListings && columns && <div className="ml-auto shrink-0">{columns}</div>}
      </div>

      {!hasListings ? (
        emptyState ?? null
      ) : ordered.length === 0 ? (
        <p className="text-sm text-muted">No matches for &ldquo;{query}&rdquo;.</p>
      ) : (
        <div className="mp-grid gap-3">
          {ordered.map(({ l, distance }) => <Card key={l.id} l={l} distance={distance} />)}
        </div>
      )}
    </div>
  )
}
