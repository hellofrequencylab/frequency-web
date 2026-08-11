#!/usr/bin/env node
// Self-host MapLibre's web worker so the vector basemap actually paints.
//
// ── WHAT BREAKS WITHOUT THIS ────────────────────────────────────────────────────────────────
// maplibre-gl 6 externalised its worker into two sibling ES modules. Turbopack handles the
// FIRST hop correctly: `new URL('./maplibre-gl-worker.mjs', import.meta.url)` inside the bundled
// library is rewritten to the emitted asset, hash and all —
//   .../maplibre-gl-worker.10-8go4bzg9tg.mjs
// Measured in .next/static/chunks: `import.meta.url` appears ZERO times in the shipped chunk.
//
// The SECOND hop is the one that fails. The emitted worker asset is a byte copy of the package
// file, so its own first line is still
//   import { ... } from "./maplibre-gl-shared.mjs"
// an unhashed specifier that Turbopack never rewrote, because it rewrites references in the code
// it BUNDLES, not inside assets it copies. The shared module ships as
// `maplibre-gl-shared.<hash>.mjs`, so the worker's import resolves to a URL that does not exist.
//
// Verified in a headless Chromium against a real `next build` output, serving .next/static:
//   worker onerror: load failed
//   404 /_next/static/media/maplibre-gl-shared.mjs
// The worker never starts, no tile is ever decoded, and the map paints as a blank cream
// rectangle with the marker still drawn on top — which is exactly the symptom the repo's own
// notes described, while blaming the wrong hop and while claiming a v5 pin that package.json has
// never carried (it has been ^6.x since 9c81b8d; #2076 bumped 6.1.0 → 6.2.0).
//
// ── THE FIX ─────────────────────────────────────────────────────────────────────────────────
// Copy BOTH files, unhashed, into public/maplibre/ so they sit beside each other exactly as they
// do inside the package. `./maplibre-gl-shared.mjs` then resolves, because the worker is served
// from a directory where that name is real. lib/maps/provider.ts points config.WORKER_URL at the
// copy. Same-origin, so MapLibre loads it directly with no blob shim.
//
// Why not downgrade to v5: package.json has never actually been on 5, Dependabot would re-bump
// it, and nothing in components/maps needs a v6 API — the whole surface is Map/Marker/Popup/
// LngLatBounds/NavigationControl/GeolocateControl/GeoJSONSource, stable across both majors.
//
// ── WHY THIS IS A SCRIPT AND NOT TWO COMMITTED FILES ────────────────────────────────────────
// A vendored copy is a copy that goes stale silently, and a STALE worker is worse than none: it
// loads, mismatches the bundled library's protocol, and fails in a way that looks like a tile
// problem. Regenerating from node_modules on every build makes the version skew unrepresentable.
// scripts/copy-maplibre-worker.test.ts pins the assumptions below so a package layout change
// fails a test instead of a basemap.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SRC_DIR = join(ROOT, 'node_modules', 'maplibre-gl', 'dist')
const OUT_DIR = join(ROOT, 'public', 'maplibre')

/** The two files the worker realm needs, and nothing else — `maplibre-gl-shared.mjs` has no
 *  imports of its own, so this pair is the complete closure. */
export const WORKER_FILES = ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs']

/** The specifier the worker uses for its sibling. If maplibre ever changes this, co-locating the
 *  two files stops being the fix and we need to know at build time, not from a blank map. */
export const EXPECTED_SIBLING_SPECIFIER = './maplibre-gl-shared.mjs'

/** The public path the worker is served from. Mirrored in lib/maps/provider.ts. */
export const PUBLIC_WORKER_PATH = '/maplibre/maplibre-gl-worker.mjs'

export function copyMaplibreWorker({ srcDir = SRC_DIR, outDir = OUT_DIR, quiet = false } = {}) {
  if (!existsSync(srcDir)) {
    throw new Error(
      `copy-maplibre-worker: ${srcDir} does not exist. Install dependencies before building.`,
    )
  }

  const sources = WORKER_FILES.map((name) => {
    const from = join(srcDir, name)
    if (!existsSync(from)) {
      throw new Error(
        `copy-maplibre-worker: maplibre-gl no longer ships dist/${name}. The worker layout ` +
          `changed; re-check whether self-hosting is still the right fix before editing this list.`,
      )
    }
    return { name, from, body: readFileSync(from) }
  })

  // The whole reason the copy works. Assert it rather than assume it: if the worker stopped
  // importing its sibling by that exact relative name, placing them together fixes nothing and
  // the basemap would go blank with every gate still green.
  const worker = sources.find((s) => s.name === 'maplibre-gl-worker.mjs')
  if (!worker.body.toString('utf8').includes(EXPECTED_SIBLING_SPECIFIER)) {
    throw new Error(
      `copy-maplibre-worker: the worker no longer imports '${EXPECTED_SIBLING_SPECIFIER}'. ` +
        `Co-locating the files is only a fix while that specifier is relative and unhashed.`,
    )
  }

  mkdirSync(outDir, { recursive: true })
  for (const { name, body } of sources) writeFileSync(join(outDir, name), body)

  if (!quiet) {
    const kb = (n) => `${Math.round(n / 1024)} kB`
    console.log(
      `✓ MapLibre worker self-hosted at ${PUBLIC_WORKER_PATH} ` +
        `(${sources.map((s) => `${s.name} ${kb(s.body.length)}`).join(', ')})`,
    )
  }
  return sources.map((s) => s.name)
}

// Run when invoked directly; importable for the test.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    copyMaplibreWorker()
  } catch (err) {
    console.error(`✗ ${err.message}`)
    process.exit(1)
  }
}
