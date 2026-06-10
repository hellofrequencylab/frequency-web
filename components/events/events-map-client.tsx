'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import { List, Map as MapIcon } from 'lucide-react'
import type { EventMapPin } from './events-map'

// maplibre must not run on the server. The `ssr: false` dynamic import is only
// allowed inside a Client Component (Next 16), so this wrapper owns it — and the
// list/map view toggle state, since switching views is interactive.
const EventsMap = dynamic(() => import('./events-map'), {
  ssr: false,
  loading: () => (
    <div className="h-[420px] w-full animate-pulse rounded-2xl border border-border bg-surface-elevated" />
  ),
})

// Wraps the server-rendered event LIST (children) and the client MAP, with a
// toggle between them. The list stays the default so nothing slow blocks the
// shell; the map is mounted lazily only when the member asks for it.
export function EventsMapToggle({
  pins,
  children,
}: {
  pins: EventMapPin[]
  children: React.ReactNode
}) {
  const [view, setView] = useState<'list' | 'map'>('list')

  // No mappable events → no toggle. The list carries the page on its own.
  if (pins.length === 0) return <>{children}</>

  return (
    <div>
      <div className="mb-4 inline-flex rounded-lg border border-border bg-surface p-0.5">
        <button
          type="button"
          onClick={() => setView('list')}
          aria-pressed={view === 'list'}
          className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            view === 'list' ? 'bg-primary text-on-primary' : 'text-muted hover:text-text'
          }`}
        >
          <List className="h-4 w-4" />
          List
        </button>
        <button
          type="button"
          onClick={() => setView('map')}
          aria-pressed={view === 'map'}
          className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            view === 'map' ? 'bg-primary text-on-primary' : 'text-muted hover:text-text'
          }`}
        >
          <MapIcon className="h-4 w-4" />
          Map
        </button>
      </div>

      {view === 'map' ? (
        <div>
          <EventsMap pins={pins} />
          <p className="mt-2 text-2xs text-subtle">
            Pins sit on each circle&rsquo;s area, not the exact address. The full venue is on the
            event page once you RSVP.
          </p>
        </div>
      ) : (
        children
      )}
    </div>
  )
}
