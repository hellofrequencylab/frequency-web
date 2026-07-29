import { describe, it, expect } from 'vitest'
import * as maplibregl from 'maplibre-gl'

// THE ONE MAP TEST THAT ACTUALLY IMPORTS THE LIBRARY.
//
// Every other map test in this repo is a source-text grep (maps-wiring.test.ts,
// provider.test.ts): they read files with readFileSync and assert on strings. That is the
// right shape for a wiring contract, but it means "79 map tests passing" has never once been
// evidence that a map can be constructed. A total interop break — the namespace resolving to
// `{ default: … }` with `maplibregl.Map` undefined — would have passed every single one.
//
// WHY THAT IS A LIVE RISK. maplibre-gl 5.24.0 ships UMD (`main: dist/maplibre-gl.js`) while
// declaring `"type": "module"`, and it publishes no `exports`, `module` or `browser` field.
// Under Node's own ESM loader that combination yields ONLY `default`. It works in the app
// because Turbopack compiles the file as CJS and synthesises the namespace — a bundler
// interop detail, not a guarantee from the package. The namespace import form was introduced
// for maplibre-gl 6 (ESM-only, named exports) and then kept when the library was pinned back
// to 5; that pairing had never shipped before, and nothing tested it.
//
// NOT reverted to `import maplibregl from 'maplibre-gl'`: v5.24.0's dist/maplibre-gl.d.ts has
// no `export default` (its only export block is a named one at the foot of the file), so the
// default-import form is a compile error today regardless of what it used to be.
//
// HONEST SCOPE: this asserts the shape under Vitest's resolver, not Turbopack's. It cannot
// prove the production bundle is fine. What it does do is fail loudly the moment the import
// form and the packaging drift apart again, which is the failure that was previously silent.

describe('maplibre-gl resolves to a usable namespace', () => {
  it('exposes the constructors the canvas builds', () => {
    for (const name of ['Map', 'Marker', 'Popup', 'NavigationControl', 'LngLatBounds'] as const) {
      expect(typeof maplibregl[name], `maplibregl.${name}`).toBe('function')
    }
  })

  it('reaches them directly, not only through a `.default` wrapper', () => {
    // The failure mode: the namespace collapses so that only `maplibregl.default.Map` works
    // and every `new maplibregl.Map(...)` call site silently reads undefined.
    // (`Object.keys` is NOT the check here — Vitest's interop hands back a proxy whose own
    // keys are not the module's named exports, so key counting would fail on a healthy
    // namespace. Property access is what the call sites actually do, so it is what we assert.)
    expect(maplibregl.Map).toBeTypeOf('function')
    expect(new maplibregl.LngLatBounds([0, 0, 1, 1]).isEmpty()).toBe(false)
  })
})
