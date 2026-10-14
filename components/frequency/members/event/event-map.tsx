'use client'

import dynamic from 'next/dynamic'
import type { EventMapPin } from '@/components/events/events-map'

// The event's Where map in the kit's frame (templates/members/Event.html draws a 240px rounded photo
// pane; the platform has a real map, so the map takes that pane). Same gate as the DAWN
// EventLocationMap: the event's own venue point wins, else the hosting Circle's city pin, never
// for an online event. maplibre stays client-only.

const EventsMap = dynamic(() => import('@/components/events/events-map'), {
  ssr: false,
  loading: () => <div className="ph fqm-where" />,
})
const EventVenueMap = dynamic(() => import('@/components/events/event-venue-map'), {
  ssr: false,
  loading: () => <div className="ph fqm-where" />,
})

export function FqEventMap({
  mapPin,
  venuePoint,
}: {
  mapPin: EventMapPin | null
  venuePoint: { lat: number; lng: number } | null
}) {
  if (venuePoint) {
    return (
      <>
        <div className="fqm-where fqm-map-frame">
          <EventVenueMap lat={venuePoint.lat} lng={venuePoint.lng} className="fqm-map-in" />
        </div>
        <span className="t2">The pin marks the exact venue.</span>
      </>
    )
  }
  if (mapPin) {
    return (
      <>
        <div className="fqm-where fqm-map-frame">
          <EventsMap pins={[mapPin]} className="fqm-map-in" />
        </div>
        <span className="t2">The pin sits on the Circle&apos;s area, not the exact address.</span>
      </>
    )
  }
  return null
}
