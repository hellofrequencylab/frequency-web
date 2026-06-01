'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import { Map as MapIcon, List } from 'lucide-react'
import { NearYou } from './near-you'
import type { MapCircle } from './circle-map'

// maplibre must not run on the server — load the map client-side only.
const CircleMap = dynamic(() => import('./circle-map'), {
  ssr: false,
  loading: () => <div className="h-[420px] w-full animate-pulse rounded-2xl border border-border bg-surface-elevated" />,
})

// "Near you": a map of nearby in-person circles with a Map ⇄ List toggle. List
// is the existing geolocation distance ranking.
export function Nearby({ circles }: { circles: MapCircle[] }) {
  const [view, setView] = useState<'map' | 'list'>('map')

  const tab = (active: boolean) =>
    `inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
      active ? 'bg-surface text-text shadow-sm' : 'text-muted hover:text-text'
    }`

  return (
    <div>
      <div className="mb-3 flex items-end justify-between gap-3">
        <h2 className="text-sm font-bold tracking-tight text-text">Near you</h2>
        <div className="flex items-center gap-0.5 rounded-lg bg-surface-elevated p-0.5">
          <button type="button" onClick={() => setView('map')} className={tab(view === 'map')}>
            <MapIcon className="h-3.5 w-3.5" /> Map
          </button>
          <button type="button" onClick={() => setView('list')} className={tab(view === 'list')}>
            <List className="h-3.5 w-3.5" /> List
          </button>
        </div>
      </div>

      {view === 'map' ? <CircleMap circles={circles} /> : <NearYou circles={circles} />}
    </div>
  )
}
