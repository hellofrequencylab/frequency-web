'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import { FqIcon } from '@/components/frequency/icon'
import type { EventMapPin } from '@/components/events/events-map'

// The Events List / Map switch in the kit's idiom (the DAWN page's EventsMapToggle, restyled). The
// map is the same maplibre island on the same pins (getEventsIndexData's privacy-safe pins: a
// Circle event plots at its Circle's city point, a public event at its own spot), mounted only when
// the member asks for it, so the list stays the fast default.

const EventsMap = dynamic(() => import('@/components/events/events-map'), {
  ssr: false,
  loading: () => <div className="ph fqm-map" />,
})

export function FqEventsMapToggle({ pins, children }: { pins: EventMapPin[]; children: React.ReactNode }) {
  const [view, setView] = useState<'list' | 'map'>('list')
  if (pins.length === 0) return <>{children}</>
  return (
    <>
      <div className="fqm-seg top" role="group" aria-label="View">
        <button type="button" className={view === 'list' ? 'on' : undefined} aria-pressed={view === 'list'} onClick={() => setView('list')}>
          <FqIcon name="page" />
          List
        </button>
        <button type="button" className={view === 'map' ? 'on' : undefined} aria-pressed={view === 'map'} onClick={() => setView('map')}>
          <FqIcon name="map" />
          Map
        </button>
      </div>
      {view === 'map' ? (
        <div className="fqm-day last">
          <div className="fqm-map">
            <EventsMap pins={pins} className="fqm-map-in" />
          </div>
          <p className="t2 fqm-map-note">
            Pins sit on each Circle&apos;s area, not the exact address. The full venue is on the event page once you RSVP.
          </p>
        </div>
      ) : (
        children
      )}
    </>
  )
}
