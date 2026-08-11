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
  const loader = readFileSync('lib/maps/google-loader.ts', 'utf8')

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
    // The REASON travels with the fallback. It used to be `onErrorRef.current?.()` — six
    // distinct diagnostic strings thrown away at the one place that knew which had happened,
    // which is how a deterministic loader bug read as a key or CSP problem for three rounds.
    expect(google).toMatch(/onErrorRef\.current\?\.\(\s*error instanceof Error/)
    expect(google).not.toContain('onErrorRef.current?.()')
  })

  it('an auth failure ALSO falls back, even though it never rejects', () => {
    // A key with billing not activated, a denied referrer or a disabled API returns HTTP 200,
    // lets `new maps.Map()` succeed, and reports itself ONLY through `window.gm_authFailure`.
    // Nothing rejects, so without this subscription the member is left on Google's grey
    // "can't load Google Maps correctly" tile instead of the MapLibre map we already ship.
    expect(loader).toContain('gm_authFailure')
    expect(loader).toContain('onGoogleMapsAuthFailure')
    expect(google).toContain('onGoogleMapsAuthFailure')
  })

  it('both engines are client-only', () => {
    expect(canvas).toContain("dynamic(() => import('./maplibre-canvas'), { ssr: false })")
    expect(canvas).toContain("dynamic(() => import('./google-canvas'), { ssr: false })")
  })
})

describe('the Google loader waits for Google, not for the script tag', () => {
  const loader = readFileSync('lib/maps/google-loader.ts', 'utf8')

  it('settles on the `callback` handshake and never on the script `load` event', () => {
    // maps/api/js is a BOOTSTRAP. It defines google.maps.Load/.modules/.__gjsload__ and then
    // appends a second script (main.js) which is what attaches Map/Marker/InfoWindow/etc.
    // Our tag's `load` fires before that second script runs, so gating on `load` inspected an
    // empty namespace and rejected on every first mount — silently pinning production to the
    // MapLibre fallback for the whole life of the Google path. Behaviour is covered by
    // lib/maps/google-loader.test.ts; this is the cheap drift guard that keeps a well-meaning
    // "restore the load listener" edit from reintroducing it.
    expect(loader).toContain("url.searchParams.set('callback', CALLBACK_NAME)")
    expect(loader).not.toMatch(/addEventListener\(\s*'load'/)
  })

  it('has a watchdog, so a hung script falls back instead of leaving an empty div', () => {
    expect(loader).toContain('LOAD_TIMEOUT_MS')
    expect(loader).toContain('setTimeout')
  })
})

describe('a map failure announces itself', () => {
  // THE reason this bug survived three rounds: a blank map and no signal anywhere. Every
  // silent path now emits exactly one structured, deduped line naming the build and the cause.
  const diag = readFileSync('lib/maps/diagnostics.ts', 'utf8')
  const canvas = readFileSync('components/maps/map-canvas.tsx', 'utf8')
  const maplibre = readFileSync('components/maps/maplibre-canvas.tsx', 'utf8')
  const loader = readFileSync('lib/maps/google-loader.ts', 'utf8')

  it('the seam logs which provider it fell back from, and why', () => {
    expect(canvas).toContain("mapDiag('maps.provider_fallback'")
    expect(canvas).toContain('reason')
  })

  it('MapLibre reports its own failures instead of dying quietly', () => {
    // MapLibre routes style, sprite, glyph, worker and tile failures into one `error` event
    // that nothing was subscribed to.
    expect(maplibre).toContain("map.on('error'")
    expect(maplibre).toMatch(/mapDiag\(\s*'maps\.maplibre_error'/)
    // The blank-basemap signature: style parses, controls render, no tile ever arrives.
    expect(maplibre).toContain("mapDiag('maps.no_tiles'")
  })

  it('a rejected key is reported, since it is the failure that never throws', () => {
    expect(loader).toContain("mapDiag('maps.google_auth_failure'")
  })

  it('never prints the key itself', () => {
    // A browsable key is public by construction, but a console line travels into screenshots
    // and pasted transcripts. `keyPresent` is a boolean, on purpose.
    expect(loader).toContain('keyPresent')
    expect(diag).toContain('keyPresent')
    for (const src of [diag, canvas, maplibre, loader]) {
      expect(src).not.toMatch(/mapDiag\([^)]*googleMapsBrowserKey\(\)\s*[,}]/)
    }
  })

  it('is deduped, so a failing tile host cannot flood the console', () => {
    expect(diag).toContain('dedupeKey')
    expect(diag).toContain('reported.has')
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

// ── Every map module installs the worker ────────────────────────────────────────────────────
// THE BUG THIS EXISTS FOR, reported by the owner as "/discover isn't working, events with venue
// maps are". Both halves were true, and the split is the whole diagnosis: maps that render
// through <MapCanvas> inherited the worker config that lived at module scope inside
// maplibre-canvas.tsx, and the three modules that construct their own `maplibregl.Map`
// (/discover's locator, the Circles map, the QR scan map) never ran it. Those three painted a
// blank cream rectangle — the exact symptom the worker fix was supposed to have cured.
//
// A blank basemap throws nothing, fails no gate, and looks like a tile or style problem. So the
// invariant is asserted structurally: if you build a map, you install the worker.
describe('every module that builds a MapLibre map installs the worker first', () => {
  // Match CODE, not prose. The first version of this guard scanned raw source and flagged
  // maplibre-interop.test.ts, whose only hit was a comment reading "every `new maplibregl.Map(...)`
  // call site" — the same trap that made a Tailwind class in a comment emit invalid CSS earlier in
  // this sweep. Strip comments first, and skip tests: a spec file renders no basemap.
  const decomment = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

  const buildsAMap = (f: { path: string; src: string }) =>
    !/\.test\.tsx?$/.test(f.path) &&
    f.path !== 'components/maps/maplibre-worker.ts' &&
    /new\s+maplibregl\.Map\s*\(/.test(decomment(f.src))

  const BUILDERS = FILES.filter(buildsAMap)

  it('finds the map builders, so this never passes by scanning nothing', () => {
    // Non-triviality first (house archetype). If a rename empties this list, the suite must fail
    // loudly rather than report a clean bill of health over zero files.
    expect(BUILDERS.length).toBeGreaterThanOrEqual(4)
  })

  it.each(FILES.filter(buildsAMap).map((f) => f.path))(
    '%s calls configureMaplibreWorker()',
    (path) => {
    const src = readFileSync(path, 'utf8')
      expect(
        /configureMaplibreWorker\s*\(\s*\)/.test(src),
        `${path} constructs a maplibregl.Map without installing the worker — the basemap will render blank on every keyless environment. Import configureMaplibreWorker from components/maps/maplibre-worker and call it at module scope.`,
      ).toBe(true)
    },
  )

  it('nobody assigns config.WORKER_URL outside the shared module', () => {
    // A second assignment would re-create the split this fixed: one module configured, the rest
    // silently not. The shared module is idempotent, so there is never a reason to inline it.
    const offenders = FILES.filter(
      (f) =>
        /config\s*\.\s*WORKER_URL\s*=/.test(f.src) && f.path !== 'components/maps/maplibre-worker.ts',
    ).map((f) => f.path)
    expect(offenders).toEqual([])
  })

  it('the shared module actually sets WORKER_URL from the provider', () => {
    // Guards the other direction: a worker module that imports cleanly and configures nothing
    // would satisfy every call site above while restoring the blank map.
    const src = readFileSync('components/maps/maplibre-worker.ts', 'utf8')
    expect(src).toMatch(/config\s*\.\s*WORKER_URL\s*=\s*MAPLIBRE_WORKER_URL/)
    expect(src).toContain("from '@/lib/maps/provider'")
  })
})
