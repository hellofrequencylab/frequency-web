'use client'

import dynamic from 'next/dynamic'
import { FqIcon } from '@/components/frequency/icon'
import type { EventMapPin } from '@/components/events/events-map'

// THE EVENTS MAP COLUMN (templates/members/Events.html `.ev-mapcol`): the sticky map beside the card
// grid in the Map view. The map is the platform's map seam on getEventsIndexData's privacy-safe pins
// (a Circle event plots at its Circle's city point, a public event at its own spot), loaded only
// when the member picks Map, so the List view never ships a map engine.
//
// Not ported from the export, on purpose: its Leaflet / Google loader (the seam already picks
// Google or MapLibre), geolocating the browser (distance on this page is measured server-side from
// the member's fuzzed home base, never a live fix), and the card / pin hover link (the seam has no
// highlight API yet; a pin's popup links to its event).

const EventsMap = dynamic(() => import('@/components/events/events-map'), {
  ssr: false,
  loading: () => <div className="ph" aria-hidden="true" />,
})

export function FqEventsMapPane({ pins, homeLabel }: { pins: EventMapPin[]; homeLabel: string | null }) {
  return (
    <div className="ev-mapcol">
      <div className="evx-mapwrap" aria-label="Map of events" role="region">
        {pins.length > 0 ? (
          <EventsMap pins={pins} className="fqm-map-in" />
        ) : (
          <div className="evx-mapempty">
            <span className="h3">Nothing to pin yet.</span>
            <span className="t2">None of these events has a place on the map. Online ones never do.</span>
          </div>
        )}
        <div className="evx-mapbar">
          {homeLabel && (
            <span className="evx-loc static">
              <FqIcon name="pin" />
              <span>Near {homeLabel}</span>
            </span>
          )}
          <span className="ap-sp" />
          <span className="evx-loc static">{pins.length === 1 ? '1 on the map' : `${pins.length} on the map`}</span>
        </div>
      </div>
      <p className="t2 ev-mapnote">
        Pins sit on each host&apos;s area, not the exact address. The full venue is on the event page once you RSVP.
      </p>
    </div>
  )
}
