'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import { mapProvider } from '@/lib/maps/provider'
import type { MapCanvasProps } from './types'

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

export function MapCanvas(props: MapCanvasProps) {
  // A Google load that fails at RUNTIME (bad key, referrer denied, quota, offline) falls
  // back to MapLibre in place, so a misconfigured key never costs anyone their map.
  const [googleUnavailable, setGoogleUnavailable] = useState(false)
  const useGoogle = mapProvider() === 'google' && !googleUnavailable

  if (useGoogle) {
    return <GoogleCanvas {...props} onProviderError={() => setGoogleUnavailable(true)} />
  }
  return <MapLibreCanvas {...props} />
}
