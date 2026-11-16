'use client'

// The map of the stops a player already visited (FH-016T). It draws only the pins the server handed
// it: lib/hunts/player.ts `visitedPins` releases a pin for a credited stop and nothing else, so no
// unvisited stop is in these props. The map engine loads on demand, on this page only, through the
// map seam (ADR-901); nothing here is reachable from the app shell.
import dynamic from 'next/dynamic'

const MapCanvas = dynamic(() => import('@/components/maps/map-canvas').then((m) => m.MapCanvas), {
  ssr: false,
  loading: () => <div className="h-56 w-full animate-pulse rounded-card border border-border bg-surface-elevated" />,
})

type VisitedPin = { id: string; lat: number; lng: number; title: string; badge?: string; approximate?: boolean }

export function VisitedStopsMap({ pins }: { pins: readonly VisitedPin[] }) {
  if (pins.length === 0) return null
  return (
    <section aria-label="Map of the stops you visited" className="space-y-1.5">
      <MapCanvas
        center={[pins[0].lng, pins[0].lat]}
        zoom={14}
        pins={pins.map((pin) => ({ ...pin, kind: 'place' as const }))}
        fit={{ padding: 48, maxZoom: 15, singleZoom: 14 }}
        className="h-56 w-full overflow-hidden rounded-card border border-border"
      />
      {pins.some((pin) => pin.approximate) && (
        <p className="text-body-sm text-muted">Some pins mark the area, not the exact spot.</p>
      )}
    </section>
  )
}
