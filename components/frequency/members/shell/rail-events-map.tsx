'use client'

import { useEffect, useRef, useState, Suspense } from 'react'
import { createPortal } from 'react-dom'
import { usePathname } from 'next/navigation'
import { useNearViewport } from '@/components/maps/use-near-viewport'
import { FqEventsMapLightbox, FqMapTile } from '@/components/frequency/members/events/events-map-lightbox'
import { loadRailEventsMap, type RailEventsMap } from './rail-events-map-actions'

// AROUND YOU IN THE RIGHT RAIL (SCAN-998, owner 2026-10-18: "Put a clickable events map of what's around
// the person in the right rail ... a quick event pop up with the list on the left and map on the right").
//
// The panel is the Events page's own map door (FqMapTile) at the rail's width, and a tap opens the same
// lightbox /events uses (events-map-lightbox.tsx): search, When, Sort and category chips over the results
// list on the left and the live map on the right, the map on top on a phone. Same `?map=1`, so Back closes
// it. On /events the page carries its own Around you map and lightbox, so the panel stands down there and
// its lightbox is not mounted: one dialog per `?map=1`, never two.
//
// COST. Nothing loads until the panel comes near the viewport: then one server read (the Events page's own,
// rail-events-map-actions.ts), kept for the visit because the rail lives in the layout. The map engine is
// its own chunk inside the lightbox, fetched only when the lightbox opens.
//
// The dialog is portalled to the kit root, so a folded rail (the open stack hidden) can never hold an open
// modal that nobody can see.

export function RailEventsMap() {
  const onEvents = usePathname() === '/events'
  const box = useRef<HTMLElement>(null)
  const near = useNearViewport(box)
  const [map, setMap] = useState<RailEventsMap | null | undefined>(undefined)

  useEffect(() => {
    if (!near || map !== undefined) return
    let live = true
    loadRailEventsMap()
      .then((m) => live && setMap(m))
      .catch(() => live && setMap(null))
    return () => {
      live = false
    }
  }, [near, map])

  // Read and nothing to pin (or the read failed): no panel, like every rail panel with nothing real to say.
  if (map === null || (map && map.items.length === 0)) return null

  return (
    // Hidden, not unmounted, on /events: the viewport watch stays on the box for the next page.
    <section
      ref={box}
      className="fqm-rp"
      aria-label="Around you"
      data-visual-mask="rail-panel"
      style={onEvents ? { display: 'none' } : undefined}
    >
      <div className="fqm-rp-h">
        <b>Around you</b>
        <span>{map ? `${map.items.length} ${map.items.length === 1 ? 'event' : 'events'}` : 'Events near you'}</span>
      </div>
      {map ? (
        <FqMapTile items={map.items} homeLabel={map.homeLabel} rail />
      ) : (
        <span className="evm-tile rail wait" role="status" aria-busy="true" aria-label="Loading the events map" />
      )}
      {map &&
        !onEvents &&
        createPortal(
          <Suspense fallback={null}>
            <FqEventsMapLightbox items={map.items} signedIn={map.signedIn} homeLabel={map.homeLabel} />
          </Suspense>,
          document.querySelector('[data-kit="members"]') ?? document.body,
        )}
    </section>
  )
}
