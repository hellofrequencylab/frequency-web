'use client'

import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { X, Maximize2, Minimize2, Crosshair, LocateFixed } from 'lucide-react'
import type { MapCircle, StarterMarker } from './circle-map'
import { getApproxLocationByIP } from '@/lib/geolocation'
import { projectStarterCircles, type StarterSeed } from '@/lib/circles/starter-projection'

// maplibre must not run on the server — load the map client-side only.
const CircleMap = dynamic(() => import('./circle-map'), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse rounded-2xl border border-border bg-surface-elevated" />,
})

type Ctx = {
  open: boolean
  setOpen: (v: boolean) => void
  circles: MapCircle[]
  /** Virtual Starter Circle pins, projected near the viewer once geo resolves. */
  starters: StarterMarker[]
  center: [number, number] | null
  setCenter: (c: [number, number]) => void
}
const MapCtx = createContext<Ctx | null>(null)

// Stable seed for the per-viewer Starter scatter. The viewer's rounded location is
// folded in by projectStarterCircles, so two viewers in different places differ
// while one viewer's pins stay put across refreshes.
const STARTER_SEED_KEY = 'starter-circles-v1'

// Provider wraps the page content so the expanded 16:9 banner can render ABOVE
// the grid (pushing "Your circles" down) while the square preview lives inside
// the right column — both driven by one open state. Esc collapses.
//
// On mount it geolocates the viewer by IP (no permission prompt) so the map
// opens on their area and shows the circles near them.
export function MapZone({
  circles,
  starterSeeds = [],
  children,
}: {
  circles: MapCircle[]
  /** The active Starter Circle blueprints to scatter near the viewer (empty when
   *  the master flag is off). */
  starterSeeds?: StarterSeed[]
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [center, setCenter] = useState<[number, number] | null>(null)

  useEffect(() => {
    const ctrl = new AbortController()
    getApproxLocationByIP(ctrl.signal).then((loc) => {
      if (loc) setCenter([loc.lng, loc.lat])
    })
    return () => ctrl.abort()
  }, [])

  // Project the Starters around the viewer once geo resolves. Stable per viewer
  // (seeded), recomputed only when the location or the blueprint set changes.
  const starters = useMemo<StarterMarker[]>(() => {
    if (!center || starterSeeds.length === 0) return []
    const [lng, lat] = center
    return projectStarterCircles({
      templates: starterSeeds,
      viewer: { lat, lng },
      seedKey: STARTER_SEED_KEY,
    }).map((p) => ({ slug: p.slug, name: p.name, lat: p.lat, lng: p.lng }))
  }, [center, starterSeeds])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])
  return <MapCtx.Provider value={{ open, setOpen, circles, starters, center, setCenter }}><div>{children}</div></MapCtx.Provider>
}

// "Find circles near me" — uses precise browser geolocation to recentre the map
// on the viewer, then opens it. Denied/unsupported still opens (on the IP centre).
// Lives inside MapZone so it shares the one open/centre state.
export function FindNearMeButton({ className }: { className?: string }) {
  const ctx = useContext(MapCtx)
  const [loading, setLoading] = useState(false)
  if (!ctx) return null

  function find() {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      ctx!.setOpen(true)
      return
    }
    setLoading(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => { ctx!.setCenter([pos.coords.longitude, pos.coords.latitude]); ctx!.setOpen(true); setLoading(false) },
      () => { ctx!.setOpen(true); setLoading(false) },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
    )
  }

  return (
    <button
      type="button"
      onClick={find}
      disabled={loading}
      className={className ?? 'inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-4 py-2 text-sm font-semibold text-text transition-colors hover:border-primary-bg hover:text-primary-strong disabled:opacity-60'}
    >
      <LocateFixed className="h-4 w-4" />
      {loading ? 'Locating…' : 'Find circles near me'}
    </button>
  )
}

// Square, non-interactive preview at the top of the right column. Click to open.
// Hidden while expanded (the banner above is the map then).
export function MapPreview() {
  const ctx = useContext(MapCtx)
  if (!ctx || (ctx.circles.length === 0 && ctx.starters.length === 0) || ctx.open) return null
  return (
    <button
      type="button"
      onClick={() => ctx.setOpen(true)}
      aria-label="Open the circles map"
      className="group relative block h-full w-full"
    >
      <div className="pointer-events-none h-full">
        <CircleMap circles={ctx.circles} starters={ctx.starters} interactive={false} center={ctx.center} className="h-full min-h-[18rem] w-full overflow-hidden rounded-2xl border border-border" />
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
  if (!ctx || (ctx.circles.length === 0 && ctx.starters.length === 0) || !ctx.open) return null

  const pill = 'inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-medium text-muted transition-colors hover:border-primary-bg hover:text-text'

  return (
    <div className="mb-8">
      <div className="relative aspect-video w-full overflow-hidden rounded-2xl border border-border shadow-sm">
        <CircleMap key={mapKey} circles={ctx.circles} starters={ctx.starters} interactive center={ctx.center} className="h-full w-full" />
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
        {ctx.circles.length > 0 && (
          <span className="inline-flex items-center gap-1.5 text-xs text-subtle">
            <span className="h-2.5 w-2.5 rounded-full bg-primary" />
            {ctx.circles.length} in-person {ctx.circles.length === 1 ? 'circle' : 'circles'}
          </span>
        )}
        {ctx.starters.length > 0 && (
          <span className="inline-flex items-center gap-1.5 text-xs text-subtle">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: '#7C5CD6' }} />
            {ctx.starters.length} {ctx.starters.length === 1 ? 'Starter to claim' : 'Starters to claim'}
          </span>
        )}
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
