'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { X, Maximize2 } from 'lucide-react'
import type { MapCircle } from './circle-map'

// maplibre must not run on the server — load the map client-side only.
const CircleMap = dynamic(() => import('./circle-map'), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse rounded-2xl border border-border bg-surface-elevated" />,
})

// A calm map preview that sits at the top of the Circles right column. It does
// NOT capture scroll/interaction (non-interactive preview). Clicking it opens a
// large interactive map that fills the top of the screen.
export function CirclesMap({ circles }: { circles: MapCircle[] }) {
  const [open, setOpen] = useState(false)

  // Esc closes the expanded map.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <div>
      {/* Preview — click to open */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open the circles map"
        className="group relative block w-full"
      >
        <div className="pointer-events-none">
          <CircleMap circles={circles} interactive={false} className="h-44 w-full overflow-hidden rounded-2xl border border-border" />
        </div>
        <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-text/0 transition-colors group-hover:bg-text/10">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-surface/95 px-3 py-1.5 text-xs font-semibold text-text shadow-sm">
            <Maximize2 className="h-3.5 w-3.5 text-primary-strong" /> Explore the map
          </span>
        </div>
      </button>

      {/* Expanded — fills the top area */}
      {open && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-text/40 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="absolute inset-x-0 top-14 h-[68vh] overflow-hidden bg-surface shadow-2xl">
            <CircleMap circles={circles} interactive className="h-full w-full" />
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="absolute right-3 top-3 z-10 inline-flex items-center gap-1.5 rounded-lg bg-surface/95 px-3 py-1.5 text-sm font-semibold text-text shadow-md transition-colors hover:bg-surface"
            >
              <X className="h-4 w-4" /> Close map
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
