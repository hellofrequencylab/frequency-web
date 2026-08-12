'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import { Maximize2, X } from 'lucide-react'
import { Dialog } from '@/components/ui/dialog'
import { mapDiag } from '@/lib/maps/diagnostics'
import { mapProvider } from '@/lib/maps/provider'
import { cn } from '@/lib/utils'
import type { MapCanvasProps, MapImplProps } from './types'

// THE SEAM (ADR-901). One component, two engines, one decision point.
//
// Every map in the app renders through here. `mapProvider()` reads the browsable Google key
// (build-time inlined) and picks Google when it is set, MapLibre when it is not — so a
// missing key DEGRADES to the map we ship today rather than breaking.
//
// Both implementations are loaded with `dynamic(..., { ssr: false })`: neither map library
// may run on the server, and the unused engine sits in its own chunk that is never fetched.
// `ssr: false` with next/dynamic is NOT supported in a Server Component and must live in a
// Client Component (node_modules/next/dist/docs/01-app/02-guides/lazy-loading.md
// §"Skipping SSR"). This file is that Client Component.

const MapLibreCanvas = dynamic(() => import('./maplibre-canvas'), { ssr: false })
const GoogleCanvas = dynamic(() => import('./google-canvas'), { ssr: false })

/** Default copy for the expand control. Plain, no em dash (docs/CONTENT-VOICE.md). */
const EXPAND_LABEL = 'Expand map'
const COLLAPSE_LABEL = 'Close map'

const CONTROL =
  'absolute z-10 inline-flex items-center gap-1.5 rounded-control bg-surface/95 px-3 py-1.5 text-body-sm font-semibold text-text lift-1 transition-colors hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary'

export function MapCanvas({ expandable = false, expandLabel, ...engineProps }: MapCanvasProps) {
  // A Google load that fails at RUNTIME (bad key, referrer denied, quota, offline) falls
  // back to MapLibre in place, so a misconfigured key never costs anyone their map.
  const [googleUnavailable, setGoogleUnavailable] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const useGoogle = mapProvider() === 'google' && !googleUnavailable

  function engine(props: MapImplProps) {
    if (useGoogle) {
      return (
        <GoogleCanvas
          {...props}
          onProviderError={(reason) => {
            // THE seam event. One line, naming the reason and the build it came from, so the
            // next "why is this map wrong?" starts at the cause instead of at zero. Deduped in
            // lib/maps/diagnostics.ts, so eight maps on a page produce one line.
            mapDiag('maps.provider_fallback', {
              from: 'google',
              to: 'maplibre',
              reason,
            })
            setGoogleUnavailable(true)
          }}
        />
      )
    }
    return <MapLibreCanvas {...props} />
  }

  if (!expandable) return engine(engineProps)

  // ── Fullscreen ────────────────────────────────────────────────────────────────
  // COMPOSED, NOT HAND-ROLLED. components/ui/dialog.tsx already owns the backdrop, ESC,
  // body scroll-lock, the focus trap, focus restore on close, the portal out of any
  // transformed ancestor, and the safe-area insets on a notched phone. `align="sheet"` is the
  // variant for a task that wants the whole screen on mobile and a card at sm+, which is
  // exactly what an expanded map wants. The nearest prior art (MapBanner in
  // components/circles/circles-map.tsx) re-solved ESC by hand and got none of the rest.
  //
  // The expanded copy is a SECOND engine instance, mounted only while the dialog is open (the
  // Dialog renders null when closed) and torn down on close. A map sized to a 16:9 thumbnail
  // does not stretch into a full-screen one: both engines size to their container at
  // construction. It is always interactive — a still map you deliberately expanded would be a
  // dead end.
  const label = expandLabel?.trim() || EXPAND_LABEL
  const close = () => setExpanded(false)

  return (
    <div className={cn('relative', engineProps.className ?? 'h-full w-full')}>
      {engine({ ...engineProps, className: 'h-full w-full' })}
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className={cn(CONTROL, 'bottom-3 right-3')}
      >
        <Maximize2 className="h-4 w-4" aria-hidden="true" />
        {label}
      </button>

      <Dialog
        open={expanded}
        onClose={close}
        align="sheet"
        ariaLabel={label}
        className="h-full sm:h-[85vh] sm:max-w-5xl"
      >
        <div className="relative h-full w-full overflow-hidden bg-surface sm:rounded-card sm:border sm:border-border">
          {engine({ ...engineProps, interactive: true, className: 'h-full w-full' })}
          <button type="button" onClick={close} className={cn(CONTROL, 'right-3 top-3')}>
            <X className="h-4 w-4" aria-hidden="true" />
            {COLLAPSE_LABEL}
          </button>
        </div>
      </Dialog>
    </div>
  )
}
