'use client'

import dynamic from 'next/dynamic'
import type { EventMapPin } from './events-map'

// The event's location MAP, as its own client leaf so it can lazy-mount maplibre
// (ssr:false). Extracted from EventFactPanel so the map is a first-class, movable
// layout block (the `event-location` module) instead of being lumped into the facts
// card. A precise venue point wins (the event's own geog); otherwise it falls back
// to the hosting circle's city-level pin (privacy default). Renders nothing for an
// online event or when there's no point to show.

// maplibre must never run on the server.
const EventsMap = dynamic(() => import('./events-map'), {
  ssr: false,
  loading: () => (
    <div className="h-40 w-full animate-pulse rounded-xl border border-border bg-surface-elevated" />
  ),
})

// Exact-venue map (the event's own geog point), shown in place of the city-level
// circle pin when the event has a precise location. Also client-only.
const EventVenueMap = dynamic(() => import('./event-venue-map'), {
  ssr: false,
  loading: () => (
    <div className="h-40 w-full animate-pulse rounded-xl border border-border bg-surface-elevated" />
  ),
})

export function EventLocationMap({
  isOnline = false,
  mapPin = null,
  venuePoint = null,
}: {
  isOnline?: boolean
  /** The hosting circle's PUBLIC, city-level pin — the fallback when there's no precise point. */
  mapPin?: EventMapPin | null
  /** The event's OWN precise geog point (published + in-person + geocoded). Wins when set. */
  venuePoint?: { lat: number; lng: number } | null
}) {
  if (isOnline) return null

  // A horizontal 16:9 map so the venue reads clearly across the full block width.
  const mapClass = 'aspect-video w-full overflow-hidden rounded-xl border border-border'

  if (venuePoint) {
    return (
      <div>
        <EventVenueMap lat={venuePoint.lat} lng={venuePoint.lng} className={mapClass} />
        <p className="mt-1.5 text-3xs text-subtle">The pin marks the exact venue.</p>
      </div>
    )
  }

  if (mapPin) {
    return (
      <div>
        <EventsMap pins={[mapPin]} className={mapClass} />
        <p className="mt-1.5 text-3xs text-subtle">
          The pin sits on the circle&rsquo;s area, not the exact address.
        </p>
      </div>
    )
  }

  return null
}
