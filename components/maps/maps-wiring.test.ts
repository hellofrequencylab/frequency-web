import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

// DRIFT GUARD for the map seam (ADR-901).
//
// The seam only holds if map surfaces COMPOSE <MapCanvas> instead of reaching for a map
// library. A ninth hand-rolled canvas would silently reintroduce every problem the seam
// exists to solve at once: a second provider decision, a second popup-escaping story, a
// second place the browsable key could leak, and a surface that keeps rendering MapLibre
// after the rest of the app has moved to Google.
//
// House archetype: components/events/series-wiring.test.ts — read the source, assert the
// wiring, and assert non-triviality first so a moved/emptied file cannot pass vacuously.

const ROOTS = ['app', 'components', 'lib']

/** Every .ts/.tsx file under the roots, as { path, src }. */
function walk(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next') continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...walk(full))
    else if (/\.tsx?$/.test(entry)) out.push(full)
  }
  return out
}

const FILES = ROOTS.flatMap(walk).map((p) => ({ path: p, src: readFileSync(p, 'utf8') }))

// The seam itself, plus the one loader that is allowed to name Google's script host.
const SEAM = ['components/maps/', 'lib/maps/']

// NOT YET MIGRATED, on purpose. These three are the data-driven canvases (GeoJSON sources +
// data-driven circle paint + symbol layers), which the four-primitive contract does not yet
// express. They still render MapLibre and still work. Deleting a row here is how the debt
// gets paid: the file must move onto <MapCanvas> instead.
const PENDING_MIGRATION = [
  'components/circles/circle-map.tsx',
  'components/discover/discover-map.tsx',
  'app/(main)/admin/qr/scan-map.tsx',
]

const isSeam = (p: string) => SEAM.some((s) => p.replaceAll('\\', '/').includes(s))
const isPending = (p: string) => PENDING_MIGRATION.some((s) => p.replaceAll('\\', '/').endsWith(s))

describe('the map seam is the only door to a map engine', () => {
  it('is non-trivial (guards a vacuous pass)', () => {
    expect(FILES.length).toBeGreaterThan(500)
    const canvas = FILES.find((f) => f.path.endsWith('components/maps/map-canvas.tsx'))
    expect(canvas).toBeDefined()
    expect(canvas!.src.length).toBeGreaterThan(600)
  })

  it('nothing outside the seam imports a map library', () => {
    const offenders = FILES.filter(
      (f) =>
        !isSeam(f.path) &&
        !isPending(f.path) &&
        !f.path.endsWith('maps-wiring.test.ts') &&
        /from\s+['"]maplibre-gl['"]/.test(f.src),
    ).map((f) => f.path)
    expect(offenders).toEqual([])
  })

  it('nothing outside the seam names the Google Maps script host', () => {
    const offenders = FILES.filter(
      (f) =>
        !isSeam(f.path) &&
        !f.path.endsWith('maps-wiring.test.ts') &&
        !f.path.endsWith('next.config.ts') &&
        f.src.includes('maps.googleapis.com/maps/api/js'),
    ).map((f) => f.path)
    expect(offenders).toEqual([])
  })

  it('the browsable key is read in exactly one module, and never alongside the server key', () => {
    const readers = FILES.filter(
      (f) =>
        !f.path.endsWith('maps-wiring.test.ts') &&
        !f.path.endsWith('provider.test.ts') &&
        f.src.includes('process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY'),
    ).map((f) => f.path.replaceAll('\\', '/'))
    expect(readers).toEqual(['lib/maps/provider.ts'])

    // The SERVER Places key must never be inlined into a browser bundle. If this ever fails,
    // a secret has been published — treat it as an incident, not a test failure.
    const leaked = FILES.filter(
      (f) =>
        !f.path.endsWith('maps-wiring.test.ts') &&
        /NEXT_PUBLIC_[A-Z_]*GOOGLE_MAPS_API_KEY/.test(f.src),
    ).map((f) => f.path)
    expect(leaked).toEqual([])
  })
})

describe('each migrated surface composes the template rather than hand-rolling a map', () => {
  const MIGRATED = [
    'components/events/event-venue-map.tsx',
    'components/events/events-map.tsx',
    'components/events/event-location-picker.tsx',
    'components/connections/group-map.tsx',
    'components/marketplace/listing-location-map-canvas.tsx',
  ]

  for (const rel of MIGRATED) {
    it(`${rel} composes <MapCanvas>`, () => {
      const src = readFileSync(rel, 'utf8')
      expect(src).toContain("from '@/components/maps/map-canvas'")
      expect(src).toContain('<MapCanvas')
      // No engine, no hand-rolled framing, no per-file provider decision.
      expect(src).not.toContain('maplibre-gl')
      expect(src).not.toContain('new maplibregl.')
      expect(src).not.toContain('NEXT_PUBLIC_MAP_STYLE')
      expect(src).not.toContain('setHTML')
    })
  }
})

describe('the seam degrades instead of breaking', () => {
  const canvas = readFileSync('components/maps/map-canvas.tsx', 'utf8')
  const google = readFileSync('components/maps/google-canvas.tsx', 'utf8')

  it('renders MapLibre whenever the provider is not google', () => {
    expect(canvas).toContain('mapProvider()')
    expect(canvas).toContain('<MapLibreCanvas')
    expect(canvas).toContain('<GoogleCanvas')
  })

  it('a runtime Google failure falls back to MapLibre in place', () => {
    // Without this the seam would show a dead box for a bad key / denied referrer / quota.
    expect(canvas).toContain('onProviderError')
    expect(canvas).toContain('setGoogleUnavailable(true)')
    expect(google).toContain('.catch(')
    expect(google).toContain('onErrorRef.current?.()')
  })

  it('both engines are client-only', () => {
    expect(canvas).toContain("dynamic(() => import('./maplibre-canvas'), { ssr: false })")
    expect(canvas).toContain("dynamic(() => import('./google-canvas'), { ssr: false })")
  })
})

describe('popup bodies are DOM, not HTML strings', () => {
  it('no map file builds popup markup by concatenation', () => {
    // A pin title is fully attacker-controlled. The seam builds nodes and assigns
    // textContent, so there is no HTML parse step to subvert — and therefore no escapeHtml
    // helper to forget to call.
    const popup = readFileSync('components/maps/popup-content.ts', 'utf8')
    expect(popup).toContain('textContent')
    expect(popup).not.toContain('innerHTML')

    for (const rel of ['components/maps/maplibre-canvas.tsx', 'components/maps/google-canvas.tsx']) {
      const src = readFileSync(rel, 'utf8')
      expect(src).toContain('buildPopupContent')
      expect(src).not.toContain('setHTML')
    }
  })
})

describe('the CSP carries every host the Google path needs', () => {
  const config = readFileSync('next.config.ts', 'utf8')
  const directive = (name: string) => {
    const line = config.split('\n').find((l) => l.includes(`${name} 'self'`))
    expect(line, `${name} not found in next.config.ts`).toBeDefined()
    return line as string
  }

  it('script-src and connect-src allow the loader and its XHR targets', () => {
    for (const name of ['script-src', 'connect-src']) {
      const line = directive(name)
      expect(line).toContain('https://maps.googleapis.com')
      expect(line).toContain('https://maps.gstatic.com')
    }
  })

  it('the Roboto stylesheet the Maps API injects is allowed', () => {
    expect(directive('style-src')).toContain('https://fonts.googleapis.com')
    expect(directive('font-src')).toContain('https://fonts.gstatic.com')
  })

  it('the keyless MapLibre path keeps its tile host', () => {
    expect(directive('connect-src')).toContain('https://tiles.openfreemap.org')
  })
})
