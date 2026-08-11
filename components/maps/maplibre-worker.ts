'use client'

// The one place MapLibre's worker URL gets installed.
//
// ── WHY THIS IS ITS OWN MODULE ──────────────────────────────────────────────────────────────
// It used to live at module scope inside `maplibre-canvas.tsx`, which was wrong in a way that was
// invisible until someone opened the right page: FOUR modules in this repo construct a
// `maplibregl.Map` directly, and only one of them was that canvas.
//
//   components/maps/maplibre-canvas.tsx   → had the config  ✅ event venue maps painted
//   components/discover/discover-map.tsx  → did not         🔴 /discover painted blank
//   components/circles/circle-map.tsx     → did not         🔴
//   app/(main)/admin/qr/scan-map.tsx      → did not         🔴
//
// So the maps that went through <MapCanvas> worked and the three that build their own map did
// not — which is exactly the split the owner reported ("/discover isn't working, events with
// venue maps are"). The v6 worker fix was real; it was installed in one of four places.
//
// `maplibre-gl` is a singleton module, so setting `config.WORKER_URL` once configures every map
// on the page. Doing it in a shared module (rather than repeating the assignment) means a fifth
// map surface only has to CALL this, and `maps-wiring.test.ts` fails the build if it forgets.
//
// See docs/MAPS.md §4a for what breaks without a worker and how the URL is served.

import * as maplibregl from 'maplibre-gl'
import { MAPLIBRE_WORKER_URL } from '@/lib/maps/provider'

let installed = false

/**
 * Point MapLibre at the self-hosted worker. Idempotent and safe to call from every map module's
 * top level — the first call wins and the rest are a boolean check.
 *
 * MUST run before the first `new maplibregl.Map(...)`: MapLibre reads `config.WORKER_URL` when it
 * spins up its worker pool, and a map created first would already have failed.
 *
 * The `!config.WORKER_URL` guard is kept from the original: if a MapLibre build has already
 * installed a working worker of its own (v5's UMD intro did this with a Blob at module-eval
 * time), we do not overwrite something that works.
 */
export function configureMaplibreWorker(): void {
  if (installed) return
  installed = true
  if (!MAPLIBRE_WORKER_URL) return
  const config = (maplibregl as unknown as { config?: { WORKER_URL?: string } }).config
  if (config && !config.WORKER_URL) config.WORKER_URL = MAPLIBRE_WORKER_URL
}
