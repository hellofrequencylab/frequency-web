'use client'

import { useEffect, useRef } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

// Events library map (Events B-4). Plots in-person events at their HOSTING
// CIRCLE'S public meeting location (city/approx) — the same public coordinate the
// circle venue map already uses, NEVER the exact event address (ADR-186). Keyless
// vector tiles out of the box (same default as the circles/discover maps);
// override with NEXT_PUBLIC_MAP_STYLE.
const STYLE = process.env.NEXT_PUBLIC_MAP_STYLE || 'https://tiles.openfreemap.org/styles/positron'

// Escape user-controlled text before it goes into popup HTML (setHTML) — same
// guard as the circle/discover maps; a title is fully attacker-controlled.
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

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

// Rendered via next/dynamic({ ssr:false }) from the client wrapper — maplibre must
// never run on the server.
export default function EventsMap({
  pins,
  className = 'h-[420px] w-full overflow-hidden rounded-2xl border border-border',
}: {
  pins: EventMapPin[]
  className?: string
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const map = new maplibregl.Map({
      container,
      style: STYLE,
      center: pins.length > 0 ? [pins[0].lng, pins[0].lat] : [-117.28, 33.1],
      zoom: 9,
      attributionControl: { compact: true },
    })
    mapRef.current = map
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')

    map.on('load', () => {
      for (const p of pins) {
        const popup = new maplibregl.Popup({ offset: 14, closeButton: false }).setHTML(
          `<div style="font-weight:600;color:#2A1B06">${escapeHtml(p.title)}</div>` +
            `<div style="font-size:12px;color:#8a7a66;margin-top:2px">${escapeHtml(p.whenLabel)}${
              p.cityLabel ? ` · ${escapeHtml(p.cityLabel)}` : ''
            }</div>` +
            `<a href="/events/${encodeURIComponent(p.slug)}" style="font-size:13px;color:#A8631B;text-decoration:none;display:inline-block;margin-top:4px">View event &rarr;</a>`,
        )
        new maplibregl.Marker({ color: '#E2912F' })
          .setLngLat([p.lng, p.lat])
          .setPopup(popup)
          .addTo(map)
      }

      // Fit to all pins so the whole set is visible at a sensible zoom.
      if (pins.length > 1) {
        const bounds = new maplibregl.LngLatBounds()
        for (const p of pins) bounds.extend([p.lng, p.lat])
        map.fitBounds(bounds, { padding: 60, maxZoom: 13, duration: 0 })
      } else if (pins.length === 1) {
        map.easeTo({ center: [pins[0].lng, pins[0].lat], zoom: 12, duration: 0 })
      }
    })

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [pins])

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

  // Warm filter so the cool base tiles sit on the cream palette — matches the
  // circle/discover maps. Amber pins stay true.
  return (
    <div
      ref={containerRef}
      className={className}
      style={{ filter: 'sepia(0.22) saturate(1.08) hue-rotate(-8deg) brightness(1.02)' }}
    />
  )
}
