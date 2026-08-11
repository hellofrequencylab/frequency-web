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
 * Where MapLibre's web worker is served from. **This is load-bearing on maplibre-gl 6, which is
 * what we are actually on** (`^6.2.0`; #2076 bumped 6.1.0 → 6.2.0). Earlier notes in this file
 * and in `.env.example` claimed a v5 pin and described this as an inert escape hatch. Both were
 * wrong, and the map has been blank on every keyless environment as a result.
 *
 * v6 splits the worker into two sibling ES modules. Turbopack rewrites the FIRST hop correctly —
 * the bundled chunk asks for the hashed `maplibre-gl-worker.<hash>.mjs` and gets it — but the
 * emitted worker asset is a byte copy whose own `import … from "./maplibre-gl-shared.mjs"` was
 * never rewritten, so it resolves to a URL that does not exist. Measured against a real build in
 * headless Chromium: `worker onerror: load failed`, `404 /_next/static/media/maplibre-gl-shared.mjs`.
 * No worker means no tile is ever decoded, and the canvas paints blank cream with the marker
 * still drawn on top.
 *
 * `scripts/copy-maplibre-worker.mjs` (a `prebuild`/`predev` hook) copies BOTH files, unhashed and
 * beside each other, into `public/maplibre/` — which is the only thing that makes that relative
 * specifier resolve. The default below points at them.
 *
 * 🔴 SETTING `NEXT_PUBLIC_MAPLIBRE_WORKER_URL` NOW OVERRIDES A WORKING DEFAULT. It stays as an
 * override for a self-hosted/CDN copy, but pointing it at a file that is not there reproduces the
 * exact blank basemap it once existed to cure. `lib/maps/diagnostics.ts` reports its value on
 * failure for that reason.
 */
export const MAPLIBRE_WORKER_URL =
  (process.env.NEXT_PUBLIC_MAPLIBRE_WORKER_URL ?? '').trim() || '/maplibre/maplibre-gl-worker.mjs'

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
