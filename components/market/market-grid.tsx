'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { MapPin, Navigation, Loader2 } from 'lucide-react'
import { distanceKm } from '@/lib/distance'
import { getBrowserPosition } from '@/lib/geo-browser'
import { LISTING_KINDS, type ListingKind } from '@/lib/marketplace'
import { useMarketQuery, marketMatch } from '@/components/marketplace/market-search'

const KIND_LABEL: Record<ListingKind, string> = Object.fromEntries(LISTING_KINDS.map((k) => [k.key, k.label])) as Record<ListingKind, string>

export interface GridListing {
  id: string
  title: string
  kind: ListingKind
  price_note: string | null
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
  return (
    <Link href={`/classifieds/${l.id}`} className="flex flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-sm transition-colors hover:border-primary/60">
      {l.images[0] && (
        <div className="relative h-36 w-full">
          <Image
            src={l.images[0]}
            alt={l.title}
            fill
            sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
            className="object-cover"
          />
        </div>
      )}
      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center rounded-full bg-primary-bg px-2 py-0.5 text-2xs font-semibold uppercase tracking-wide text-primary-strong">
            {KIND_LABEL[l.kind] ?? l.kind}
          </span>
          {l.price_note && <span className="text-sm font-semibold text-text">{l.price_note}</span>}
        </div>
        <h3 className="mt-2 text-sm font-bold text-text">{l.title}</h3>
        {l.description && <p className="mt-1 line-clamp-2 text-sm text-muted">{l.description}</p>}
        <div className="mt-3 flex items-center gap-2 text-xs text-subtle">
          {distance != null
            ? <span className="inline-flex items-center gap-1 text-primary-strong"><Navigation className="h-3 w-3" />{distance < 1 ? '<1' : Math.round(distance)} km</span>
            : place && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{place}</span>}
          {l.author && <span className="truncate">· {l.author.display_name}</span>}
        </div>
      </div>
    </Link>
  )
}

export function MarketGrid({ listings }: { listings: GridListing[] }) {
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

  return (
    <div>
      <div className="mb-4">
        <button
          type="button"
          onClick={nearMe}
          disabled={locating}
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-60 ${coords ? 'bg-primary text-on-primary' : 'border border-border text-text hover:bg-surface-elevated'}`}
        >
          {locating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Navigation className="h-4 w-4" />}
          {coords ? 'Sorted by distance' : 'Near me'}
        </button>
      </div>
      {ordered.length === 0 ? (
        <p className="text-sm text-muted">No matches for &ldquo;{query}&rdquo;.</p>
      ) : (
        <div className="mp-grid gap-3">
          {ordered.map(({ l, distance }) => <Card key={l.id} l={l} distance={distance} />)}
        </div>
      )}
    </div>
  )
}
