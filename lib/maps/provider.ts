// THE ONE PLACE THAT DECIDES WHICH MAP ENGINE RENDERS (ADR-901).
//
// Two engines, one seam:
//   • Google Maps JS  — used when a BROWSABLE key is configured.
//   • MapLibre GL     — the keyless default, and the degrade path for every
//                       environment without that key (local dev, previews, CI, self-host).
//
// 🔴 TWO DIFFERENT KEYS, ON PURPOSE.
//   `GOOGLE_MAPS_API_KEY`                     server-only, secret. Powers Places venue
//                                             search behind /api/geocode/venues. It must
//                                             NEVER reach the browser.
//   `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY`     public by construction — a browser-rendered
//                                             map cannot hide its key. It must be a
//                                             SEPARATE key, HTTP-referrer restricted to our
//                                             domains and API-restricted to the Maps
//                                             JavaScript API. Publishing the Places key in a
//                                             NEXT_PUBLIC_ var would expose the billing account.
//
// ⚠️ NEXT_PUBLIC_* is inlined at BUILD time, not read at runtime, and only a STATIC
// `process.env.NAME` member access is replaced — never a computed key. See
// node_modules/next/dist/docs/01-app/02-guides/environment-variables.md
// §"Bundling Environment Variables for the Browser". On Vercel the var must therefore be
// present when `next build` runs; setting it as a runtime-only value leaves every map
// silently on MapLibre with no error.

export type MapProvider = 'google' | 'maplibre'

// Static member access — required for the build-time inline (see the note above).
const BROWSER_KEY = (process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY ?? '').trim()
const MAP_ID = (process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID ?? '').trim()

/** The MapLibre vector style. Unchanged: keyless OpenFreeMap out of the box. */
export const MAPLIBRE_STYLE =
  process.env.NEXT_PUBLIC_MAP_STYLE || 'https://tiles.openfreemap.org/styles/positron'

/**
 * Escape hatch for the MapLibre 6 worker. v6 stopped inlining its web worker and resolves
 * `dist/maplibre-gl-worker.mjs` from `import.meta.url` through a template literal, which no
 * bundler can statically emit — so under Turbopack the worker never starts and the vector
 * tiles never paint (the blank cream basemap). Point this at a self-hosted copy of that
 * worker to repair it without a dependency change. Empty (the default) leaves MapLibre's
 * own resolution alone, which is correct on v5.
 */
export const MAPLIBRE_WORKER_URL = (process.env.NEXT_PUBLIC_MAPLIBRE_WORKER_URL ?? '').trim()

/**
 * Warm filter so the cool OpenFreeMap tiles sit on the cream palette. Applied to the
 * MapLibre canvas ONLY — Google's terms forbid altering their logo and attribution, and a
 * CSS filter on the container would recolour both.
 */
export const WARM_FILTER = 'sepia(0.22) saturate(1.08) hue-rotate(-8deg) brightness(1.02)'

/** The browsable Maps JavaScript API key, or null when unset. */
export function googleMapsBrowserKey(): string | null {
  return BROWSER_KEY || null
}

/** Optional cloud-styled Map ID so the Google basemap can match the cream palette. */
export function googleMapsMapId(): string | null {
  return MAP_ID || null
}

/** Which engine renders. No component may decide this for itself. */
export function mapProvider(): MapProvider {
  return BROWSER_KEY ? 'google' : 'maplibre'
}
