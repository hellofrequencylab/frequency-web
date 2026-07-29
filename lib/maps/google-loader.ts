import type { GoogleMapsApi } from './google-types'
import { mapDiag } from './diagnostics'
import { googleMapsBrowserKey } from './provider'

// ONE memoised loader for the Google Maps JavaScript API.
//
// Every canvas that wants Google calls `loadGoogleMaps()`. The script tag is injected once
// per document, no matter how many maps mount, and every caller shares the same promise.
//
// 🔴 RESOLVE ON GOOGLE'S `callback`, NEVER ON THE SCRIPT'S `load` EVENT.
// `https://maps.googleapis.com/maps/api/js` does NOT return the Maps API. It returns a ~13 KB
// bootstrap that defines only `google.maps.Load` / `.modules` / `.__gjsload__` and then
// appends a SECOND script (`…/maps-api-v3/api/js/<ver>/main.js`), which is what actually
// attaches `Map`, `Marker`, `InfoWindow`, `LatLngBounds`, `Circle` and `SymbolPath`. A
// script-inserted tag is async, so our tag's `load` event fires at the end of the bootstrap's
// synchronous run — strictly BEFORE main.js executes. Gating on `load` therefore found an
// empty namespace 100% of the time and rejected on every first mount, which silently pinned
// production to the MapLibre fallback. That is not a race: it never won. The `callback`
// parameter is the documented handshake, and it is precisely what `loading=async` exists to
// pair with. `lib/maps/google-loader.test.ts` locks this in.
//
// FAIL-SAFE CONTRACT: this REJECTS rather than throwing at import time, and it rejects on a
// missing key, a script that fails to load (blocked, offline), a load that signals ready
// without the API attached, a prior auth failure, and a watchdog timeout.
// `components/maps/map-canvas.tsx` catches that rejection and re-renders the MapLibre canvas
// in place — so a misconfigured key degrades to a working map instead of a dead box.
//
// 🔴 AN AUTH FAILURE DOES NOT REJECT. A bad key, a denied referrer, a disabled API or a
// billing account that was never activated all return HTTP 200 for the script and let
// `new maps.Map()` succeed; Google then paints its own grey "can't load Google Maps"
// watermark and calls `window.gm_authFailure`. Nothing rejects, so without the hook below the
// fallback never fires and the member is left staring at Google's error tile. We install that
// hook at injection time and fan it out to every mounted canvas.
//
// CSP: the script host and its XHR targets are allowlisted in next.config.ts. The Google set
// is COMPLETE and needed no change for this fix — `script-src` and `connect-src` carry
// maps.googleapis.com + maps.gstatic.com, `img-src` allows `https:` (tiles), `style-src`
// allows fonts.googleapis.com and `font-src` fonts.gstatic.com (the Roboto stylesheet the API
// injects). There is a test asserting it (components/maps/maps-wiring.test.ts).

const SCRIPT_ID = 'frequency-google-maps-js'
const LOADER_SRC = 'https://maps.googleapis.com/maps/api/js'

// The global Google calls once the API is genuinely ready. Passed as `&callback=`, so the
// literal must match the property name on `LoaderGlobals` below.
const CALLBACK_NAME = '__frequencyGoogleMapsReady'

// `weekly` is Google's rolling channel; `quarterly` would pin harder but ages out.
const API_VERSION = 'weekly'

// Backstop for a script that is blocked by an extension, hangs, or loads without ever calling
// back. Without it a stalled load leaves the canvas as an empty div forever, because nothing
// rejects and the seam is never told to fall back. Generous enough for a slow phone.
const LOAD_TIMEOUT_MS = 10_000

/** Every rejection message the loader can produce, so callers can report a real reason. */
const REASON = {
  server: 'Google Maps can only load in the browser',
  noKey: 'NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY is not set',
  scriptError: 'Google Maps script failed to load',
  noSurface: 'Google Maps signalled ready without the expected API surface',
  authFailure:
    'Google Maps rejected the browsable key (billing not activated, referrer denied, API not enabled, or bad key)',
  timeout: `Google Maps did not initialise within ${LOAD_TIMEOUT_MS}ms`,
} as const

type GoogleGlobal = { maps?: Partial<GoogleMapsApi> }

/** The globals this module reads or installs. `__frequencyGoogleMapsReady` must stay spelled
 *  the same as `CALLBACK_NAME`. */
type LoaderGlobals = {
  google?: GoogleGlobal
  gm_authFailure?: () => void
  __frequencyGoogleMapsReady?: () => void
}

function globals(): LoaderGlobals {
  return globalThis as unknown as LoaderGlobals
}

let pending: Promise<GoogleMapsApi> | null = null

/** Sticky once Google tells us the key is not usable. No later mount should retry Google:
 *  the answer will not change within this document, and each retry paints a grey error tile. */
let authFailed = false

/** Promises waiting on the shared script. Settled by the callback, or by an auth failure. */
const waiters = new Set<(err?: Error) => void>()

/** Mounted canvases that want to know if the key is rejected AFTER their map was built. */
const authListeners = new Set<() => void>()

function flush(err?: Error): void {
  const current = [...waiters]
  waiters.clear()
  for (const w of current) w(err)
}

/** True when the loaded namespace carries everything google-canvas.tsx constructs. */
function isReady(maps: Partial<GoogleMapsApi> | undefined): maps is GoogleMapsApi {
  return Boolean(
    maps?.Map && maps.Marker && maps.InfoWindow && maps.LatLngBounds && maps.Circle && maps.SymbolPath,
  )
}

function readGlobal(): Partial<GoogleMapsApi> | undefined {
  return globals().google?.maps
}

/** Install the `&callback=` target once. Google invokes it after main.js has attached the API. */
function installReadyCallback(): void {
  const g = globals()
  if (typeof g.__frequencyGoogleMapsReady === 'function') return
  g.__frequencyGoogleMapsReady = () => flush()
}

/** Install Google's auth-failure hook once. This is the ONLY signal for a bad key. */
function installAuthFailureHook(): void {
  const g = globals()
  if (typeof g.gm_authFailure === 'function') return
  g.gm_authFailure = () => {
    authFailed = true
    pending = null
    mapDiag('maps.google_auth_failure', {
      reason: REASON.authFailure,
      // Never the key itself: it lands in screenshots and bug reports.
      keyPresent: Boolean(googleMapsBrowserKey()),
      origin: typeof location === 'undefined' ? null : location.origin,
      fix: 'Check billing is activated, the HTTP-referrer restrictions match this origin (pathful, e.g. https://example.com/*), and Maps JavaScript API is ENABLED (not merely allowed on the key).',
    })
    flush(new Error(REASON.authFailure))
    for (const listener of [...authListeners]) listener()
  }
}

/**
 * Subscribe to Google's auth failure. Fires when Google rejects the key AFTER the API loaded
 * — the case that never rejects a promise. Returns an unsubscribe function.
 */
export function onGoogleMapsAuthFailure(listener: () => void): () => void {
  authListeners.add(listener)
  return () => {
    authListeners.delete(listener)
  }
}

/** True once Google has rejected the key in this document. */
export function googleMapsAuthFailed(): boolean {
  return authFailed
}

/**
 * Resolve with the Google Maps API namespace, injecting the script on first call.
 * Rejects (never throws synchronously) when there is no browsable key, the key was already
 * rejected, the script fails, or nothing initialises within the watchdog window.
 */
export function loadGoogleMaps(): Promise<GoogleMapsApi> {
  if (pending) return pending

  pending = new Promise<GoogleMapsApi>((resolve, reject) => {
    if (typeof document === 'undefined') {
      reject(new Error(REASON.server))
      return
    }

    if (authFailed) {
      reject(new Error(REASON.authFailure))
      return
    }

    const key = googleMapsBrowserKey()
    if (!key) {
      reject(new Error(REASON.noKey))
      return
    }

    // Already present (a second mount, or an earlier page in the same document).
    const existingApi = readGlobal()
    if (isReady(existingApi)) {
      resolve(existingApi)
      return
    }

    let settled = false
    let timer: ReturnType<typeof setTimeout> | null = null

    const finish = (err: Error | null, maps?: GoogleMapsApi) => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      waiters.delete(waiter)
      if (err) reject(err)
      else resolve(maps as GoogleMapsApi)
    }

    const waiter = (err?: Error) => {
      if (err) {
        finish(err)
        return
      }
      const maps = readGlobal()
      if (isReady(maps)) finish(null, maps)
      else finish(new Error(REASON.noSurface))
    }

    waiters.add(waiter)
    installReadyCallback()
    installAuthFailureHook()

    timer = setTimeout(() => finish(new Error(REASON.timeout)), LOAD_TIMEOUT_MS)

    const existingScript = document.getElementById(SCRIPT_ID)
    if (existingScript) {
      // A previous attempt already injected it. Its `load` event may have fired long ago, so
      // waiting on `load` here would hang forever — the shared callback (or the watchdog)
      // settles this promise instead. Only a transport error is still worth listening for.
      existingScript.addEventListener('error', () => finish(new Error(REASON.scriptError)), {
        once: true,
      })
      return
    }

    const url = new URL(LOADER_SRC)
    url.searchParams.set('key', key)
    url.searchParams.set('v', API_VERSION)
    // `marker` is not requested: `Marker` ships in the legacy namespace unconditionally, and
    // the classic marker needs no Map ID. See components/maps/google-canvas.tsx for why.
    url.searchParams.set('libraries', 'core,maps')
    url.searchParams.set('loading', 'async')
    url.searchParams.set('callback', CALLBACK_NAME)

    const script = document.createElement('script')
    script.id = SCRIPT_ID
    script.src = url.toString()
    script.async = true
    // NO `load` listener, deliberately. See the note at the top of this file: `load` fires
    // before Google's real API script has run, so it can only ever produce a false negative.
    script.addEventListener('error', () => finish(new Error(REASON.scriptError)), { once: true })
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

/** Test-only: forget the memoised promise and every installed global so a suite can exercise
 *  the first-call path. */
export function resetGoogleMapsLoaderForTests(): void {
  pending = null
  authFailed = false
  waiters.clear()
  authListeners.clear()
  const g = globals()
  delete g.__frequencyGoogleMapsReady
  delete g.gm_authFailure
}
