'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { X, Maximize2, Minimize2, Crosshair } from 'lucide-react'
import type { MapCircle } from './circle-map'

// maplibre must not run on the server — load the map client-side only.
const CircleMap = dynamic(() => import('./circle-map'), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse rounded-2xl border border-border bg-surface-elevated" />,
})

type Ctx = { open: boolean; setOpen: (v: boolean) => void; circles: MapCircle[]; center: [number, number] | null }
const MapCtx = createContext<Ctx | null>(null)

// Provider wraps the page content so the expanded 16:9 banner can render ABOVE
// the grid (pushing "Your circles" down) while the square preview lives inside
// the right column — both driven by one open state. Esc collapses.
//
// On mount it geolocates the viewer by IP (no permission prompt) so the map
// opens on their area and shows the circles near them.
export function MapZone({ circles, children }: { circles: MapCircle[]; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const [center, setCenter] = useState<[number, number] | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('https://ipapi.co/json/')
      .then((r) => r.json())
      .then((d: { latitude?: number; longitude?: number }) => {
        if (!cancelled && typeof d?.latitude === 'number' && typeof d?.longitude === 'number') {
          setCenter([d.longitude, d.latitude])
        }
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])
  return <MapCtx.Provider value={{ open, setOpen, circles, center }}><div className="mt-6">{children}</div></MapCtx.Provider>
}

// Square, non-interactive preview at the top of the right column. Click to open.
// Hidden while expanded (the banner above is the map then).
export function MapPreview() {
  const ctx = useContext(MapCtx)
  if (!ctx || ctx.circles.length === 0 || ctx.open) return null
  return (
    <button
      type="button"
      onClick={() => ctx.setOpen(true)}
      aria-label="Open the circles map"
      className="group relative block w-full"
    >
      <div className="pointer-events-none">
        <CircleMap circles={ctx.circles} interactive={false} center={ctx.center} className="aspect-square w-full overflow-hidden rounded-2xl border border-border" />
      </div>
      <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-text/0 transition-colors group-hover:bg-text/10">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-surface/95 px-3 py-1.5 text-xs font-semibold text-text shadow-sm">
          <Maximize2 className="h-3.5 w-3.5 text-primary-strong" /> Explore the map
        </span>
      </div>
    </button>
  )
}

// Expanded 16:9 interactive map, in-page above the grid, with a control bar.
export function MapBanner() {
  const ctx = useContext(MapCtx)
  const [mapKey, setMapKey] = useState(0)
  if (!ctx || ctx.circles.length === 0 || !ctx.open) return null

  const pill = 'inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-medium text-muted transition-colors hover:border-primary-bg hover:text-text'

  return (
    <div className="mb-8">
      <div className="relative aspect-video w-full overflow-hidden rounded-2xl border border-border shadow-sm">
        <CircleMap key={mapKey} circles={ctx.circles} interactive center={ctx.center} className="h-full w-full" />
        <button
          type="button"
          onClick={() => ctx.setOpen(false)}
          className="absolute right-3 top-3 z-10 inline-flex items-center gap-1.5 rounded-lg bg-surface/95 px-3 py-1.5 text-sm font-semibold text-text shadow-md transition-colors hover:bg-surface"
        >
          <X className="h-4 w-4" /> Close
        </button>
      </div>

      {/* Optional controls underneath */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 text-xs text-subtle">
          <span className="h-2.5 w-2.5 rounded-full bg-primary" />
          {ctx.circles.length} in-person {ctx.circles.length === 1 ? 'circle' : 'circles'}
        </span>
        <div className="ml-auto flex gap-2">
          <button type="button" onClick={() => setMapKey((k) => k + 1)} className={pill}>
            <Crosshair className="h-4 w-4" /> Reset view
          </button>
          <button type="button" onClick={() => ctx.setOpen(false)} className={pill}>
            <Minimize2 className="h-4 w-4" /> Collapse
          </button>
        </div>
      </div>
    </div>
  )
}
