import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// The provider decision is the whole safety story of the Google migration (ADR-901): with no
// browsable key every map must keep rendering MapLibre, so no environment — local dev, a
// preview deploy, CI, a self-host — ever loses its maps by omission.
//
// The key is read as a module-level constant (it has to be: NEXT_PUBLIC_* is inlined at
// build time and only a static member access is replaced), so each case re-imports the
// module with a fresh env.

async function freshProvider() {
  vi.resetModules()
  return import('./provider')
}

describe('mapProvider', () => {
  beforeEach(() => {
    vi.resetModules()
  })
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('falls back to MapLibre when the browsable key is absent', async () => {
    vi.stubEnv('NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY', '')
    const { mapProvider, googleMapsBrowserKey } = await freshProvider()
    expect(mapProvider()).toBe('maplibre')
    expect(googleMapsBrowserKey()).toBeNull()
  })

  it('falls back to MapLibre when the key is present but blank', async () => {
    vi.stubEnv('NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY', '   ')
    const { mapProvider } = await freshProvider()
    expect(mapProvider()).toBe('maplibre')
  })

  it('selects Google when a browsable key is configured', async () => {
    vi.stubEnv('NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY', 'AIza-test-browser-key')
    const { mapProvider, googleMapsBrowserKey } = await freshProvider()
    expect(mapProvider()).toBe('google')
    expect(googleMapsBrowserKey()).toBe('AIza-test-browser-key')
  })

  it('never reads the SERVER Places key', async () => {
    // A browsable key is world-readable. Reading GOOGLE_MAPS_API_KEY here would publish the
    // Places key and expose the billing account.
    vi.stubEnv('GOOGLE_MAPS_API_KEY', 'server-only-secret')
    vi.stubEnv('NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY', '')
    const { mapProvider, googleMapsBrowserKey } = await freshProvider()
    expect(mapProvider()).toBe('maplibre')
    expect(googleMapsBrowserKey()).toBeNull()
  })

  it('keeps the keyless MapLibre style as the default', async () => {
    vi.stubEnv('NEXT_PUBLIC_MAP_STYLE', '')
    const { MAPLIBRE_STYLE } = await freshProvider()
    expect(MAPLIBRE_STYLE).toBe('https://tiles.openfreemap.org/styles/positron')
  })

  it('honours a style override', async () => {
    vi.stubEnv('NEXT_PUBLIC_MAP_STYLE', 'https://example.test/style.json')
    const { MAPLIBRE_STYLE } = await freshProvider()
    expect(MAPLIBRE_STYLE).toBe('https://example.test/style.json')
  })

  it('leaves the MapLibre worker URL empty unless explicitly configured', async () => {
    vi.stubEnv('NEXT_PUBLIC_MAPLIBRE_WORKER_URL', '')
    const { MAPLIBRE_WORKER_URL } = await freshProvider()
    expect(MAPLIBRE_WORKER_URL).toBe('')
  })
})

describe('googleMapsMapId', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('is null when unset, so the Google canvas uses default styling', async () => {
    vi.stubEnv('NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID', '')
    const { googleMapsMapId } = await freshProvider()
    expect(googleMapsMapId()).toBeNull()
  })

  it('returns the configured Cloud style id', async () => {
    vi.stubEnv('NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID', 'dawn_cream')
    const { googleMapsMapId } = await freshProvider()
    expect(googleMapsMapId()).toBe('dawn_cream')
  })
})
