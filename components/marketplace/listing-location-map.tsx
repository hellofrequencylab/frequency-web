'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import { MapPin, Maximize2 } from 'lucide-react'
import { Dialog } from '@/components/ui/dialog'

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
// and the exact address below the map. Clicking the map opens a larger view in a popup.
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
  const [expanded, setExpanded] = useState(false)

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

  const caption = precise ? (
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
  )

  return (
    <div>
      {/* The map is a button: clicking (or Enter) opens the larger view. */}
      <button
        type="button"
        onClick={() => setExpanded(true)}
        aria-label="Expand the map"
        className="group relative block h-56 w-full overflow-hidden rounded-2xl border border-border focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <ListingLocationMapCanvas lat={lat} lng={lng} precise={precise} />
        {/* An expand affordance so it reads as clickable; pointer-events off so the click hits the button. */}
        <span className="pointer-events-none absolute right-2 top-2 inline-flex items-center gap-1 rounded-lg bg-surface/90 px-2 py-1 text-2xs font-semibold text-text shadow-sm backdrop-blur-sm">
          <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" /> Expand
        </span>
      </button>

      {caption}

      <Dialog open={expanded} onClose={() => setExpanded(false)} ariaLabel="Pickup location map" className="max-w-3xl">
        <div className="rounded-2xl border border-border bg-surface p-3 shadow-pop sm:p-4">
          <div className="relative h-[60vh] w-full overflow-hidden rounded-xl border border-border">
            {expanded && <ListingLocationMapCanvas lat={lat} lng={lng} precise={precise} />}
          </div>
          {caption}
        </div>
      </Dialog>
    </div>
  )
}
