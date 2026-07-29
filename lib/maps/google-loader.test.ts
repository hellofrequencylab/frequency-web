// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// THE REGRESSION THIS FILE EXISTS FOR.
//
// `https://maps.googleapis.com/maps/api/js` does not return the Maps API. It returns a small
// bootstrap that defines `google.maps.Load` / `.modules` / `.__gjsload__` and then APPENDS a
// second script (`…/maps-api-v3/api/js/<ver>/main.js`), which is what attaches `Map`,
// `Marker`, `InfoWindow`, `LatLngBounds`, `Circle` and `SymbolPath`. A script-inserted tag is
// async, so our tag's `load` event fires at the end of the bootstrap's synchronous run —
// strictly BEFORE main.js executes.
//
// The loader used to settle on that `load` event, so it inspected an empty namespace and
// rejected on EVERY first mount. The seam dutifully fell back to MapLibre, the `.catch` threw
// the reason away, and production ran on the fallback for the entire life of the Google path
// while looking, from the outside, like a key or CSP problem. The first test below is written
// to FAIL against that old code: `load` alone must not settle anything.
//
// House style: lib/maps/provider.test.ts — re-import the module with a fresh env per case,
// because the browsable key is a build-time-inlined module-level const.

const KEY = 'AIza-test-browser-key'
const SCRIPT_ID = 'frequency-google-maps-js'
const CALLBACK_NAME = '__frequencyGoogleMapsReady'

type Loader = typeof import('./google-loader')

/** A fresh module graph with the browsable key stubbed, so `mapProvider()` picks Google. */
async function freshLoader(key: string = KEY): Promise<Loader> {
  vi.resetModules()
  vi.stubEnv('NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY', key)
  return import('./google-loader')
}

/** The bootstrap-only namespace: exactly what exists when our script tag fires `load`. */
function installBootstrapNamespace(): void {
  ;(globalThis as unknown as { google: unknown }).google = {
    maps: { Load: () => {}, modules: {}, __gjsload__: () => {} },
  }
}

/** The real namespace, as it exists once main.js has run and Google invokes our callback. */
function installFullNamespace(): void {
  ;(globalThis as unknown as { google: unknown }).google = {
    maps: {
      Map: class {},
      Marker: class {},
      InfoWindow: class {},
      LatLngBounds: class {},
      Circle: class {},
      SymbolPath: { CIRCLE: 0 },
    },
  }
}

function scriptTag(): HTMLScriptElement | null {
  return document.getElementById(SCRIPT_ID) as HTMLScriptElement | null
}

function fireCallback(): void {
  ;(globalThis as unknown as Record<string, () => void>)[CALLBACK_NAME]()
}

/** True when `p` has not settled by the next macrotask. */
async function stillPending(p: Promise<unknown>): Promise<boolean> {
  const pendingMarker = Symbol('pending')
  const settled = p.then(
    () => 'resolved' as const,
    () => 'rejected' as const,
  )
  const tick = new Promise<symbol>((r) => setTimeout(() => r(pendingMarker), 0))
  return (await Promise.race([settled, tick])) === pendingMarker
}

beforeEach(() => {
  document.head.innerHTML = ''
  delete (globalThis as unknown as Record<string, unknown>).google
  delete (globalThis as unknown as Record<string, unknown>)[CALLBACK_NAME]
  delete (globalThis as unknown as Record<string, unknown>).gm_authFailure
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('the loader waits for Google, not for the script tag', () => {
  it('does NOT settle on the script `load` event (the bug that pinned production to MapLibre)', async () => {
    const { loadGoogleMaps } = await freshLoader()
    const promise = loadGoogleMaps()
    promise.catch(() => {})

    // What actually exists at `load` time: the bootstrap, and nothing that draws a map.
    installBootstrapNamespace()
    scriptTag()!.dispatchEvent(new Event('load'))

    expect(await stillPending(promise)).toBe(true)
  })

  it('resolves when Google invokes the callback, after main.js has attached the API', async () => {
    const { loadGoogleMaps } = await freshLoader()
    const promise = loadGoogleMaps()

    installBootstrapNamespace()
    scriptTag()!.dispatchEvent(new Event('load'))
    // …then main.js runs and Google calls us back.
    installFullNamespace()
    fireCallback()

    await expect(promise).resolves.toHaveProperty('Map')
  })

  it('requests the callback handshake alongside loading=async', async () => {
    const { loadGoogleMaps } = await freshLoader()
    loadGoogleMaps().catch(() => {})

    const src = new URL(scriptTag()!.src)
    expect(src.searchParams.get('callback')).toBe(CALLBACK_NAME)
    expect(src.searchParams.get('loading')).toBe('async')
    expect(src.searchParams.get('key')).toBe(KEY)
    // The script must not carry a `load` handler that could produce a false negative.
    expect(scriptTag()!.async).toBe(true)
  })

  it('rejects when the callback fires without the API surface we construct', async () => {
    const { loadGoogleMaps } = await freshLoader()
    const promise = loadGoogleMaps()

    installBootstrapNamespace()
    fireCallback()

    await expect(promise).rejects.toThrow(/without the expected API surface/)
  })
})

describe('every failure mode rejects with a reason a developer can act on', () => {
  it('names the missing env var when no browsable key is configured', async () => {
    const { loadGoogleMaps } = await freshLoader('')
    await expect(loadGoogleMaps()).rejects.toThrow('NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY is not set')
  })

  it('rejects when the script itself fails to load (blocked, offline)', async () => {
    const { loadGoogleMaps } = await freshLoader()
    const promise = loadGoogleMaps()
    scriptTag()!.dispatchEvent(new Event('error'))
    await expect(promise).rejects.toThrow('Google Maps script failed to load')
  })

  it('rejects on a watchdog timeout so a hung script still falls back to MapLibre', async () => {
    vi.useFakeTimers()
    const { loadGoogleMaps } = await freshLoader()
    const promise = loadGoogleMaps()
    const assertion = expect(promise).rejects.toThrow(/did not initialise/)
    await vi.advanceTimersByTimeAsync(11_000)
    await assertion
  })
})

describe('an auth failure trips the fallback, because it never rejects on its own', () => {
  it('notifies subscribers and blocks later attempts', async () => {
    // Billing not activated / referrer denied / API not enabled all return HTTP 200 and let
    // `new maps.Map()` succeed. `window.gm_authFailure` is the ONLY signal.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { loadGoogleMaps, onGoogleMapsAuthFailure, googleMapsAuthFailed } = await freshLoader()

    const promise = loadGoogleMaps()
    installFullNamespace()
    fireCallback()
    await expect(promise).resolves.toHaveProperty('Map')

    const notified = vi.fn()
    onGoogleMapsAuthFailure(notified)

    expect(googleMapsAuthFailed()).toBe(false)
    ;(globalThis as unknown as { gm_authFailure: () => void }).gm_authFailure()

    expect(notified).toHaveBeenCalledTimes(1)
    expect(googleMapsAuthFailed()).toBe(true)
    // One structured line, and never the key itself.
    expect(warn).toHaveBeenCalled()
    const line = warn.mock.calls.map((c) => c.join(' ')).join('\n')
    expect(line).toContain('maps.google_auth_failure')
    expect(line).not.toContain(KEY)

    // No later mount may retry: the answer will not change, and each retry paints Google's
    // grey error tile over a map that MapLibre could have drawn.
    await expect(loadGoogleMaps()).rejects.toThrow(/rejected the browsable key/)
  })

  it('unsubscribes cleanly so an unmounted canvas is not called', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { loadGoogleMaps, onGoogleMapsAuthFailure } = await freshLoader()
    loadGoogleMaps().catch(() => {})

    const notified = vi.fn()
    onGoogleMapsAuthFailure(notified)()
    ;(globalThis as unknown as { gm_authFailure: () => void }).gm_authFailure()

    expect(notified).not.toHaveBeenCalled()
  })
})

describe('a second map on the page joins the load instead of hanging on it', () => {
  it('settles a later caller through the shared callback, not a `load` that already fired', async () => {
    const { loadGoogleMaps } = await freshLoader()

    // First mount fails its surface check, which clears the memoised promise but leaves the
    // script in the DOM with its `load` event already spent.
    const first = loadGoogleMaps()
    installBootstrapNamespace()
    scriptTag()!.dispatchEvent(new Event('load'))
    fireCallback()
    await expect(first).rejects.toThrow(/without the expected API surface/)

    // Second mount: the old code attached a `load` listener to a tag that would never fire
    // again, so this promise never settled and the seam was never told to fall back.
    const second = loadGoogleMaps()
    expect(document.querySelectorAll(`#${SCRIPT_ID}`)).toHaveLength(1)

    installFullNamespace()
    fireCallback()
    await expect(second).resolves.toHaveProperty('Map')
  })

  it('resolves immediately when the API is already on the page', async () => {
    installFullNamespace()
    const { loadGoogleMaps } = await freshLoader()
    await expect(loadGoogleMaps()).resolves.toHaveProperty('Map')
    // Nothing injected: the API was already there.
    expect(scriptTag()).toBeNull()
  })
})
