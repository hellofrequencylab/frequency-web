import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  MAP_CLUSTER_PAINT,
  MAP_PIN_KINDS,
  MAP_PIN_LAYERS,
  resolvePinPaint,
} from '@/lib/maps/pin-kinds'

// THE PARITY GUARD for the four capabilities ADR-1022 added to the seam: marker click,
// clustering, fullscreen, and pin kinds.
//
// 🔴 THE FAILURE THIS EXISTS FOR. The seam has a primary engine and a FALLBACK, and only one
// of them is ever in front of the person adding a feature. Build "Around You" with a Google
// key in your env and every capability works; ship it, and every keyless environment — local
// dev, previews, CI, self-host, and production the day the key is rotated or the referrer list
// is wrong — silently renders a map with no clustering, no card on tap, and pins that are all
// the same colour under a legend claiming three. Nothing throws. No gate notices. That is
// exactly the swallowed fail-safe docs/DEPLOY-SAFETY.md rule 6 names.
//
// So the parity is asserted structurally, in two layers:
//   1. the two canvases destructure the SAME prop list, key for key (nothing can be
//      implemented on one engine and forgotten on the other), and
//   2. every judgement they could answer differently is imported from a pure module under
//      lib/maps/, and neither canvas re-implements it locally.
//
// House archetype: components/maps/maps-wiring.test.ts — read the source, assert the wiring,
// assert non-triviality first so a moved or emptied file cannot pass vacuously.

const MAPLIBRE = 'components/maps/maplibre-canvas.tsx'
const GOOGLE = 'components/maps/google-canvas.tsx'
const SEAM = 'components/maps/map-canvas.tsx'
const TYPES = 'components/maps/types.ts'
const CLUSTER_MARKER = 'components/maps/cluster-marker.ts'
const CLUSTER = 'lib/maps/cluster.ts'
const PIN_KINDS = 'lib/maps/pin-kinds.ts'

const read = (p: string) => readFileSync(p, 'utf8')

/** Top-level keys of the `MapEngineProps` object type — the contract both engines implement. */
function engineContractKeys(): string[] {
  const src = read(TYPES)
  const start = src.indexOf('export type MapEngineProps = {')
  expect(start, 'MapEngineProps is gone from components/maps/types.ts').toBeGreaterThan(-1)
  const end = src.indexOf('\n}', start)
  const block = src.slice(start, end)
  // Exactly two spaces of indent = a member of the object. Doc-comment continuation lines
  // start with three spaces and a `*`, so they cannot be mistaken for props.
  return [...new Set([...block.matchAll(/^ {2}(\w+)\??:/gm)].map((m) => m[1]!))].sort()
}

/** The prop names a canvas actually destructures from `MapImplProps`. */
function destructuredProps(path: string): string[] {
  const m = read(path).match(/export default function \w+\(\{([\s\S]*?)\}: MapImplProps\)/)
  expect(m, `${path} no longer destructures MapImplProps in its signature`).toBeTruthy()
  return [...new Set([...m![1]!.matchAll(/^\s*(\w+)\s*(?:=|,|$)/gm)].map((x) => x[1]!))].sort()
}

describe('the capability guard is non-trivial', () => {
  it('reads real files with real contents', () => {
    for (const p of [MAPLIBRE, GOOGLE, SEAM, TYPES, CLUSTER_MARKER, CLUSTER, PIN_KINDS]) {
      expect(read(p).length, p).toBeGreaterThan(600)
    }
    expect(engineContractKeys().length).toBeGreaterThanOrEqual(10)
  })
})

describe('both engines expose the same surface', () => {
  it('the contract names every prop the seam promises', () => {
    // If a capability is added to MapEngineProps and neither canvas reads it, it is a lie in a
    // type. This pins the four ADR-1022 additions in particular.
    const keys = engineContractKeys()
    for (const key of ['onPinClick', 'cluster', 'pins', 'draggable']) {
      expect(keys, `MapEngineProps is missing ${key}`).toContain(key)
    }
  })

  it('MapLibre destructures exactly the contract', () => {
    expect(destructuredProps(MAPLIBRE)).toEqual(engineContractKeys())
  })

  it('Google destructures exactly the contract, plus its fallback channel', () => {
    // `onProviderError` is the one asymmetry, and it is inherent: MapLibre is what the seam
    // falls back TO, so it has nothing to report.
    expect(destructuredProps(GOOGLE)).toEqual(
      [...engineContractKeys(), 'onProviderError'].sort(),
    )
  })

  it('fullscreen is the seam s job, not an engine s', () => {
    // `expandable` lives on MapCanvasProps only. An engine that grew its own expand control
    // would be the second overlay implementation in a codebase that already has one.
    const types = read(TYPES)
    expect(types).toContain('export type MapCanvasProps = MapEngineProps & {')
    expect(types).toContain('export type MapImplProps = MapEngineProps & {')
    expect(engineContractKeys()).not.toContain('expandable')
    for (const p of [MAPLIBRE, GOOGLE]) expect(read(p)).not.toContain('expandable')
  })
})

describe('clustering is one algorithm, called by both engines', () => {
  it('both canvases group with the shared function and nothing else', () => {
    for (const p of [MAPLIBRE, GOOGLE]) {
      const src = read(p)
      expect(src, `${p} does not call clusterPoints`).toContain('clusterPoints(')
      expect(src).toContain("from '@/lib/maps/cluster'")
    }
  })

  it('neither engine reaches for its own native clustering', () => {
    // MapLibre would cluster inside a GeoJSON SOURCE (supercluster geometry, style layers, a
    // different popup and click story); Google would need @googlemaps/markerclusterer (a new
    // dependency, a different grid, and weight against a build budget already near its
    // ceiling). Either one makes the two engines behave differently, which is the whole thing
    // this guard prevents.
    const maplibre = read(MAPLIBRE)
    expect(maplibre).not.toMatch(/cluster:\s*true/)
    expect(maplibre).not.toContain('clusterRadius')
    expect(maplibre).not.toContain('clusterMaxZoom')
    expect(read(GOOGLE)).not.toContain('MarkerClusterer')
    expect(read(GOOGLE)).not.toContain('markerclusterer')
  })

  it('a cluster tap does the same thing on both engines', () => {
    for (const p of [MAPLIBRE, GOOGLE]) {
      expect(read(p), `${p} does not use the shared zoom step`).toContain('zoomIntoCluster(')
    }
  })

  it('both engines re-group on the same zoom threshold', () => {
    // Without the shared guard one engine rebuilds markers on every frame of a pinch and the
    // other on none, so "the same" clustering would still feel different.
    for (const p of [MAPLIBRE, GOOGLE]) {
      expect(read(p), `${p} does not gate re-grouping`).toContain('shouldRecluster(')
    }
  })

  it('the tuning lives in exactly one file', () => {
    // A radius or a zoom step copied into a canvas is a value that can be edited on one engine.
    for (const name of ['CLUSTER_DEFAULTS', 'CLUSTER_ZOOM_STEP', 'CLUSTER_ZOOM_EPSILON']) {
      expect(read(CLUSTER), `${name} is not defined in lib/maps/cluster.ts`).toContain(
        `export const ${name}`,
      )
      for (const p of [MAPLIBRE, GOOGLE, SEAM]) {
        expect(read(p), `${p} redeclares ${name}`).not.toContain(`const ${name}`)
      }
    }
  })

  it('the bubble is drawn the same size with the same text on both engines', () => {
    // Google cannot take a DOM element for a classic Marker, so it draws a Symbol while
    // MapLibre draws a div. Both read the diameter and the label from the same two functions,
    // so the drawing PRIMITIVE differs and nothing a member perceives does.
    for (const src of [read(CLUSTER_MARKER), read(GOOGLE)]) {
      expect(src).toContain('clusterDiameterPx(')
      expect(src).toContain('clusterLabel(')
      expect(src).toContain('clusterAccessibleLabel(')
    }
    expect(read(MAPLIBRE)).toContain('buildClusterMarker(')
  })

  it('the algorithm stays pure, so it can be trusted by both and cost neither', () => {
    // No React, no DOM, no map library: a page may import it (or pin-kinds) to draw a legend
    // without pulling a map engine into its bundle (docs/DEPLOY-SAFETY.md §1).
    for (const p of [CLUSTER, PIN_KINDS]) {
      const src = read(p)
      expect(src, `${p} imports something`).not.toMatch(/^import\s/m)
      expect(src).not.toContain('document.')
      expect(src).not.toContain('window.')
    }
  })

  it('picker mode never clusters, on either engine', () => {
    // One pin, being placed by hand. A bubble there would be nonsense, and the two engines
    // must agree it is nonsense.
    for (const p of [MAPLIBRE, GOOGLE]) {
      expect(read(p)).toMatch(/cluster\s*&&\s*!draggable/)
    }
  })
})

describe('a marker click can open the caller s own card', () => {
  it('both engines route the click through the same ref', () => {
    for (const p of [MAPLIBRE, GOOGLE]) {
      const src = read(p)
      expect(src, `${p} has no onPinClick channel`).toContain('onPinClickRef')
      expect(src).toContain('onPinClickRef.current?.(pin)')
    }
  })

  it('both engines suppress their built-in popup when the caller takes the click', () => {
    // Two cards for one tap is worse than either alone. The rule is only useful if BOTH
    // engines apply it, otherwise the fallback double-renders.
    for (const p of [MAPLIBRE, GOOGLE]) {
      const src = read(p)
      expect(src).toMatch(/if\s*\(onPinClickRef\.current\)/)
    }
    // And the popup is still built the safe way when nobody takes the click.
    for (const p of [MAPLIBRE, GOOGLE]) expect(read(p)).toContain('buildPopupContent(')
  })

  it('the keyless engine s markers are reachable from a keyboard', () => {
    // Google's classic markers are focusable and fire `click` on Enter for free. A MapLibre
    // marker is a plain div, so without this the FALLBACK would ship a mouse-only map.
    const src = read(CLUSTER_MARKER)
    expect(src).toContain("setAttribute('role', 'button')")
    expect(src).toContain('tabIndex = 0')
    expect(src).toMatch(/'Enter'/)
    expect(read(MAPLIBRE)).toContain('onMarkerActivate(')
  })
})

describe('pins carry a kind, and one table decides what a kind looks like', () => {
  it('covers the three layers the browsing map draws', () => {
    expect([...MAP_PIN_LAYERS]).toEqual(['event', 'circle', 'space'])
    for (const kind of MAP_PIN_LAYERS) {
      const paint = MAP_PIN_KINDS[kind]
      expect(paint.token, kind).toMatch(/^--color-/)
      expect(paint.fallback, kind).toMatch(/^#[0-9A-Fa-f]{6}$/)
      expect(paint.legend.length, kind).toBeGreaterThan(2)
    }
  })

  it('the three layers are actually distinguishable', () => {
    const tokens = MAP_PIN_LAYERS.map((k) => MAP_PIN_KINDS[k].token)
    expect(new Set(tokens).size).toBe(tokens.length)
  })

  it('changed no existing map: an unkinded pin still paints what it always did', () => {
    // Every pre-ADR-1022 caller passes no kind and either no tone or `primary`. Both must
    // resolve to the same amber they rendered before, or five live surfaces changed colour.
    expect(resolvePinPaint({})).toEqual(MAP_PIN_KINDS.place)
    expect(resolvePinPaint({ kind: 'place' }).token).toBe('--color-primary')
    expect(resolvePinPaint({ tone: 'primary' }).token).toBe('--color-primary')
    expect(resolvePinPaint({ tone: 'secondary' }).token).toBe('--color-info')
    // An explicit tone still wins over a kind, which is what keeps those callers untouched.
    expect(resolvePinPaint({ kind: 'circle', tone: 'secondary' }).token).toBe('--color-info')
  })

  it('every colour carries a concrete fallback, because one engine cannot take a variable', () => {
    // A Google Symbol needs a colour STRING. A canvas that mounts before the stylesheet
    // resolves would otherwise draw an invisible pin on the keyed engine only.
    for (const paint of Object.values(MAP_PIN_KINDS)) {
      expect(paint.fallback).toMatch(/^#[0-9A-Fa-f]{6}$/)
    }
    expect(MAP_CLUSTER_PAINT.fallback).toMatch(/^#[0-9A-Fa-f]{6}$/)
    expect(MAP_CLUSTER_PAINT.textFallback).toMatch(/^#[0-9A-Fa-f]{6}$/)
  })

  it('neither canvas keeps its own colour table', () => {
    // The pre-ADR-1022 shape: a `TONE_VAR` map in each file, so "make Circles green" meant
    // editing two files and hoping they agreed.
    for (const p of [MAPLIBRE, GOOGLE]) {
      const src = read(p)
      expect(src, `${p} still declares a local tone map`).not.toContain('TONE_VAR')
      expect(src).toContain('resolvePinPaint(')
      for (const token of ['--color-signal', '--color-broadcast', '--color-info']) {
        expect(src, `${p} hardcodes ${token}`).not.toContain(token)
      }
    }
  })

  it('a pin can name itself for a screen reader on both engines', () => {
    for (const p of [MAPLIBRE, GOOGLE]) {
      expect(read(p)).toMatch(/pin\.label\?\.trim\(\)\s*\|\|\s*pin\.title\?\.trim\(\)/)
    }
  })
})

describe('fullscreen composes the shared dialog instead of re-solving it', () => {
  const seam = read(SEAM)

  it('uses components/ui/dialog.tsx in its sheet variant', () => {
    expect(seam).toContain("from '@/components/ui/dialog'")
    expect(seam).toContain('<Dialog')
    expect(seam).toContain('align="sheet"')
    expect(seam).toContain('ariaLabel=')
  })

  it('re-solves none of what the dialog already owns', () => {
    // Backdrop, ESC, scroll-lock, focus trap, focus restore, the portal out of a transformed
    // ancestor, and the safe-area insets. The closest prior art (MapBanner in
    // components/circles/circles-map.tsx) hand-rolled the ESC listener and got none of the rest.
    expect(seam).not.toContain('createPortal')
    expect(seam).not.toContain('document.body.style.overflow')
    expect(seam).not.toContain("'Escape'")
    expect(seam).not.toContain('addEventListener')
    expect(seam).not.toContain('fixed inset-0')
    expect(seam).not.toContain('aria-modal')
  })

  it('the expanded map is a second instance, mounted only while it is open', () => {
    // The Dialog renders null when closed, so the heavier full-screen map costs nothing until
    // someone asks for it. Both engines size to their container at construction, so reusing
    // the thumbnail's instance would have produced a stretched map.
    expect(seam).toMatch(/engine\(\{\s*\.\.\.engineProps,\s*interactive:\s*true/)
    expect(seam).toContain('const [expanded, setExpanded] = useState(false)')
  })

  it('is off unless a caller asks for it, so no existing map grew a button', () => {
    expect(seam).toContain('expandable = false')
    expect(seam).toContain('if (!expandable) return engine(engineProps)')
  })

  it('its copy is plain and carries no em dash (docs/CONTENT-VOICE.md)', () => {
    for (const line of ["const EXPAND_LABEL = 'Expand map'", "const COLLAPSE_LABEL = 'Close map'"]) {
      expect(seam).toContain(line)
    }
    const copy = [...seam.matchAll(/const (?:EXPAND|COLLAPSE)_LABEL = '([^']+)'/g)].map((m) => m[1]!)
    expect(copy.length).toBe(2)
    for (const c of copy) expect(c).not.toContain('—')
  })

  it('still keeps both engines behind ssr:false, which fullscreen must not undo', () => {
    expect(seam).toContain("dynamic(() => import('./maplibre-canvas'), { ssr: false })")
    expect(seam).toContain("dynamic(() => import('./google-canvas'), { ssr: false })")
  })
})
