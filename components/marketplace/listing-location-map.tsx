'use client'

import dynamic from 'next/dynamic'
import { MapPin } from 'lucide-react'

// maplibre must not run on the server — load the canvas client-side only, with a
// pulsing placeholder while the tiles and script arrive.
const ListingLocationMapCanvas = dynamic(() => import('./listing-location-map-canvas'), {
  ssr: false,
  loading: () => <div className="h-56 w-full animate-pulse rounded-2xl border border-border bg-surface-elevated" />,
})

// The pickup location for a marketplace listing.
//
// Privacy contract: by default (`precise === false`) we show only a general area
// — a soft translucent circle, never a pin — because the exact pickup address is
// hidden until the seller reveals it. When `precise === true` we show a real pin
// and the exact address below the map.
export function ListingLocationMap({
  lat,
  lng,
  areaLabel,
  precise,
  exactAddress,
}: {
  lat: number | null
  lng: number | null
  areaLabel: string | null
  precise: boolean
  exactAddress: string | null
}): React.ReactNode {
  // No coordinates on file — show a calm location card instead of a map.
  if (lat === null || lng === null) {
    return (
      <div className="flex items-start gap-3 rounded-2xl border border-border bg-surface p-4">
        <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-muted" aria-hidden="true" />
        <div>
          <p className="text-sm font-semibold text-text">{areaLabel ?? 'Shared with members'}</p>
          <p className="mt-1 text-sm text-subtle">
            The pickup spot is shared when you connect with the seller.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="relative h-56 w-full overflow-hidden rounded-2xl border border-border">
        <ListingLocationMapCanvas lat={lat} lng={lng} precise={precise} />
      </div>

      {precise ? (
        exactAddress ? (
          <p className="mt-2 flex items-start gap-2 text-sm text-text">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
            <span>{exactAddress}</span>
          </p>
        ) : null
      ) : (
        <p className="mt-2 text-sm text-subtle">
          {areaLabel ? `${areaLabel}. ` : ''}Approximate area. The exact pickup spot is shared when you connect.
        </p>
      )}
    </div>
  )
}
