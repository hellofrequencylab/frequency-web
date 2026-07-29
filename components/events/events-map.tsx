'use client'

import { MapCanvas } from '@/components/maps/map-canvas'
import type { MapPin } from '@/components/maps/types'

// Events library map (Events B-4). Plots in-person events at their HOSTING
// CIRCLE'S public meeting location (city/approx) — the same public coordinate the
// circle venue map already uses, NEVER the exact event address (ADR-186).
//
// Composes the map seam (ADR-901) instead of a map library directly: Google when a browsable
// key is configured, MapLibre + keyless OpenFreeMap tiles otherwise. Popup bodies are built
// as DOM nodes by the seam, so an event title is inert text and can never become stored XSS.

export type EventMapPin = {
  id: string
  slug: string
  title: string
  /** Preformatted "when" line (e.g. "Tomorrow at 6pm"). */
  whenLabel: string
  /** City/approx label (the circle's city). */
  cityLabel: string | null
  /** The hosting circle's PUBLIC coordinates. Never the exact venue. */
  lat: number
  lng: number
}

// Rendered via next/dynamic({ ssr:false }) from the client wrapper — no map engine may
// run on the server.
export default function EventsMap({
  pins,
  className = 'h-[420px] w-full overflow-hidden rounded-2xl border border-border',
}: {
  pins: EventMapPin[]
  className?: string
}) {
  // Graceful empty case: a tasteful panel instead of a blank map.
  if (pins.length === 0) {
    return (
      <div className="flex h-[420px] w-full items-center justify-center rounded-2xl border border-dashed border-border bg-surface/60 px-6 text-center">
        <p className="text-sm text-muted">
          No in-person events with a location to map yet. Online events and ones without a place
          set don&rsquo;t show here.
        </p>
      </div>
    )
  }

  const mapPins: MapPin[] = pins.map((p) => ({
    id: p.id,
    lat: p.lat,
    lng: p.lng,
    title: p.title,
    subtitle: p.cityLabel ? `${p.whenLabel} · ${p.cityLabel}` : p.whenLabel,
    href: `/events/${encodeURIComponent(p.slug)}`,
    hrefLabel: 'View event →',
  }))

  return (
    <MapCanvas
      center={[pins[0].lng, pins[0].lat]}
      zoom={9}
      pins={mapPins}
      fit={{ padding: 60, maxZoom: 13, singleZoom: 12 }}
      className={className}
    />
  )
}
