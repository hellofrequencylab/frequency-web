'use client'

import { useEffect, useRef } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

// Match circle-map.tsx: OpenFreeMap (free vector tiles, no API key) out of the
// box, overridable with a Mapbox/MapTiler style URL via NEXT_PUBLIC_MAP_STYLE.
const STYLE = process.env.NEXT_PUBLIC_MAP_STYLE || 'https://tiles.openfreemap.org/styles/positron'

// Escape user-controlled text before it goes into popup HTML (setHTML) — same
// pattern as circle-map.tsx. A circle/event titled `<img src=x onerror=…>` must
// never become stored XSS for everyone who opens its popup.
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export type GroupMapVenue = {
  /** The circle's PUBLIC meeting location. NEVER a member's home/live location (ADR-186). */
  latitude: number
  longitude: number
  name: string
  /** neighborhood / city line under the name. */
  place: string | null
}

export type GroupMapEvent = {
  id: string
  title: string
  /** Preformatted date string (e.g. "Wed, Jun 11"). */
  dateLabel: string
  /** Public venue coords for this event, or null when the event has none (then it isn't pinned). */
  latitude: number | null
  longitude: number | null
}

// A live venue map for one circle: its public meeting spot as the primary pin,
// and each upcoming event that carries public coordinates as a secondary pin.
// PRIVACY (ADR-186): only public venue coordinates are ever plotted here — no
// member home/live locations, no member pins. Loaded behind the maps-enabled
// gate by the server wrapper; rendered client-side so maplibre never runs on
// the server.
export default function GroupMap({
  venue,
  events = [],
  className = 'h-[320px] w-full overflow-hidden rounded-2xl border border-border',
}: {
  venue: GroupMapVenue | null
  events?: GroupMapEvent[]
  className?: string
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)

  useEffect(() => {
    if (!venue) return
    const container = containerRef.current
    if (!container) return

    const map = new maplibregl.Map({
      container,
      style: STYLE,
      center: [venue.longitude, venue.latitude],
      zoom: 13,
      attributionControl: { compact: true },
    })
    mapRef.current = map
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')

    // Only events that carry public coordinates get a pin (ADR-186).
    const locatedEvents = events.filter(
      (e): e is GroupMapEvent & { latitude: number; longitude: number } =>
        e.latitude != null && e.longitude != null,
    )

    map.on('load', () => {
      // ── Primary marker: the circle's public meeting location (amber). ──
      const venuePopup = new maplibregl.Popup({ offset: 14, closeButton: false }).setHTML(
        `<div style="font-weight:600;color:#A8631B">${escapeHtml(venue.name)}</div>` +
          (venue.place
            ? `<div style="font-size:12px;color:#8a7a66;margin-top:2px">${escapeHtml(venue.place)}</div>`
            : ''),
      )
      new maplibregl.Marker({ color: '#E2912F' })
        .setLngLat([venue.longitude, venue.latitude])
        .setPopup(venuePopup)
        .addTo(map)

      // ── Secondary markers: upcoming events with public coordinates (slate). ──
      for (const ev of locatedEvents) {
        const evPopup = new maplibregl.Popup({ offset: 12, closeButton: false }).setHTML(
          `<div style="font-weight:600;color:#2A1B06">${escapeHtml(ev.title)}</div>` +
            `<div style="font-size:12px;color:#8a7a66;margin-top:2px">${escapeHtml(ev.dateLabel)}</div>`,
        )
        new maplibregl.Marker({ color: '#5B7083' })
          .setLngLat([ev.longitude, ev.latitude])
          .setPopup(evPopup)
          .addTo(map)
      }

      // Fit to all markers; with only the circle pin, stay centered at a sensible zoom.
      if (locatedEvents.length > 0) {
        const bounds = new maplibregl.LngLatBounds()
        bounds.extend([venue.longitude, venue.latitude])
        for (const ev of locatedEvents) bounds.extend([ev.longitude, ev.latitude])
        map.fitBounds(bounds, { padding: 60, maxZoom: 14, duration: 0 })
      }
    })

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [venue, events])

  // Graceful no-coordinates case: a tasteful panel instead of an empty map.
  if (!venue) {
    return (
      <div className="flex h-[320px] w-full items-center justify-center rounded-2xl border border-dashed border-border bg-surface/60 px-6 text-center">
        <p className="text-sm text-muted">No location set for this circle yet.</p>
      </div>
    )
  }

  // Subtle warm filter so the cool base tiles sit on the cream palette — matches
  // circle-map.tsx. Amber/slate pins stay true.
  return (
    <div
      ref={containerRef}
      className={className}
      style={{ filter: 'sepia(0.22) saturate(1.08) hue-rotate(-8deg) brightness(1.02)' }}
    />
  )
}
