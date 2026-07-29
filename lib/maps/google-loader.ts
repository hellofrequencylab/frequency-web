import type { GoogleMapsApi } from './google-types'
import { googleMapsBrowserKey } from './provider'

// ONE memoised loader for the Google Maps JavaScript API.
//
// Every canvas that wants Google calls `loadGoogleMaps()`. The script tag is injected once
// per document, no matter how many maps mount, and every caller shares the same promise.
//
// FAIL-SAFE CONTRACT: this REJECTS rather than throwing at import time, and it rejects on a
// missing key, a script that fails to load (bad key, referrer denied, offline, blocked), or
// a load that resolves without the API attached. `components/maps/map-canvas.tsx` catches
// that rejection and re-renders the MapLibre canvas in place — so a misconfigured key
// degrades to a working map instead of a grey "for development purposes only" tile.
//
// CSP: the script host and its XHR targets are allowlisted in next.config.ts
// (`script-src` / `connect-src` maps.googleapis.com + maps.gstatic.com, `style-src`
// fonts.googleapis.com, `font-src` fonts.gstatic.com). Keep the two in step — there is a
// test asserting it (components/maps/maps-wiring.test.ts).

const SCRIPT_ID = 'frequency-google-maps-js'
const LOADER_SRC = 'https://maps.googleapis.com/maps/api/js'

// `weekly` is Google's rolling channel; `quarterly` would pin harder but ages out.
const API_VERSION = 'weekly'

type GoogleGlobal = { maps?: Partial<GoogleMapsApi> }

let pending: Promise<GoogleMapsApi> | null = null

/** True when the loaded namespace carries everything google-canvas.tsx constructs. */
function isReady(maps: Partial<GoogleMapsApi> | undefined): maps is GoogleMapsApi {
  return Boolean(
    maps?.Map && maps.Marker && maps.InfoWindow && maps.LatLngBounds && maps.Circle && maps.SymbolPath,
  )
}

function readGlobal(): Partial<GoogleMapsApi> | undefined {
  return (globalThis as { google?: GoogleGlobal }).google?.maps
}

/**
 * Resolve with the Google Maps API namespace, injecting the script on first call.
 * Rejects (never throws synchronously) when there is no browsable key or the script fails.
 */
export function loadGoogleMaps(): Promise<GoogleMapsApi> {
  if (pending) return pending

  pending = new Promise<GoogleMapsApi>((resolve, reject) => {
    if (typeof document === 'undefined') {
      reject(new Error('Google Maps can only load in the browser'))
      return
    }

    const key = googleMapsBrowserKey()
    if (!key) {
      reject(new Error('NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY is not set'))
      return
    }

    // Already present (a second mount, or an earlier page in the same document).
    const existingApi = readGlobal()
    if (isReady(existingApi)) {
      resolve(existingApi)
      return
    }

    const settle = () => {
      const maps = readGlobal()
      if (isReady(maps)) resolve(maps)
      else reject(new Error('Google Maps loaded without the expected API surface'))
    }

    const existingScript = document.getElementById(SCRIPT_ID)
    if (existingScript) {
      existingScript.addEventListener('load', settle, { once: true })
      existingScript.addEventListener(
        'error',
        () => reject(new Error('Google Maps script failed to load')),
        { once: true },
      )
      return
    }

    const url = new URL(LOADER_SRC)
    url.searchParams.set('key', key)
    url.searchParams.set('v', API_VERSION)
    // `marker` is not requested: we use the classic Marker, which needs no Map ID. See
    // components/maps/google-canvas.tsx for why.
    url.searchParams.set('libraries', 'core,maps')
    url.searchParams.set('loading', 'async')

    const script = document.createElement('script')
    script.id = SCRIPT_ID
    script.src = url.toString()
    script.async = true
    script.addEventListener('load', settle, { once: true })
    script.addEventListener('error', () => reject(new Error('Google Maps script failed to load')), {
      once: true,
    })
    document.head.appendChild(script)
  })

  // A rejected loader must not poison later attempts on a fresh navigation, but it must not
  // retry in a tight loop either. Clearing on rejection is the middle ground: the next mount
  // tries once more, and the DOM script check above keeps it from injecting twice.
  pending.catch(() => {
    pending = null
  })

  return pending
}

/** Test-only: forget the memoised promise so a suite can exercise the first-call path. */
export function resetGoogleMapsLoaderForTests(): void {
  pending = null
}
