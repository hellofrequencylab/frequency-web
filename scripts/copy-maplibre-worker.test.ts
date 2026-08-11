import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync, mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  copyMaplibreWorker,
  WORKER_FILES,
  EXPECTED_SIBLING_SPECIFIER,
  PUBLIC_WORKER_PATH,
} from './copy-maplibre-worker.mjs'
import { MAPLIBRE_WORKER_URL } from '../lib/maps/provider'

// Guards the self-hosted MapLibre worker (docs/FINALIZE-PLAN §10.19).
//
// The failure this prevents is the nastiest kind: nothing throws, every gate stays green, and the
// map paints a blank cream rectangle with the marker still drawn on top — which reads as a tile
// or style problem, not a worker problem. It went unnoticed long enough for three separate source
// comments to describe a MapLibre 5 pin that package.json never had.
//
// So these assert the two things the fix actually rests on: that maplibre still ships the pair of
// files we copy, and that the worker still reaches its sibling by an unhashed relative specifier.
// If either stops being true, co-locating the files stops being a fix, and this must fail LOUDLY
// rather than let the basemap go dark again.

describe('the MapLibre worker copy rests on assumptions that are still true', () => {
  it('the installed package still ships both files we self-host', () => {
    for (const name of WORKER_FILES) {
      const p = join('node_modules', 'maplibre-gl', 'dist', name)
      expect(existsSync(p), `maplibre-gl no longer ships dist/${name}`).toBe(true)
    }
  })

  it('the worker still imports its sibling by an unhashed RELATIVE specifier', () => {
    // THE LOAD-BEARING FACT. Turbopack rewrites references in code it bundles, not inside assets
    // it copies, so this line survives into the emitted worker and resolves against whatever
    // directory the worker is served from. Putting the sibling in that directory is the entire fix.
    const worker = readFileSync(join('node_modules', 'maplibre-gl', 'dist', WORKER_FILES[0]), 'utf8')
    expect(worker).toContain(EXPECTED_SIBLING_SPECIFIER)
  })

  it('the sibling has no imports of its own, so the pair is the complete closure', () => {
    // If maplibre-gl-shared ever grows an import, copying two files stops being enough and the
    // worker would 404 on a third. Cheap to assert, impossible to notice otherwise.
    const shared = readFileSync(join('node_modules', 'maplibre-gl', 'dist', WORKER_FILES[1]), 'utf8')
    expect(shared).not.toMatch(/(?:^|\n)\s*import\s.*\sfrom\s*['"]\./)
  })

  it('the provider default points at the path the script writes', () => {
    // Two constants in two files describing one URL is exactly how this drifts. `provider.ts` is
    // read at build time by the browser bundle; the script writes the file. They must agree.
    expect(MAPLIBRE_WORKER_URL).toBe(PUBLIC_WORKER_PATH)
    expect(PUBLIC_WORKER_PATH.startsWith('/maplibre/')).toBe(true)
  })

  it('copies both files, byte-identical, into the output directory', () => {
    const out = join(mkdtempSync(join(tmpdir(), 'mlw-')), 'maplibre')
    copyMaplibreWorker({ outDir: out, quiet: true })
    for (const name of WORKER_FILES) {
      const src = readFileSync(join('node_modules', 'maplibre-gl', 'dist', name))
      expect(readFileSync(join(out, name)).equals(src), `${name} differs from the package copy`).toBe(true)
    }
  })

  it('refuses to write a worker that does not import the sibling it is co-located with', () => {
    // The regression that would make this script a liar: a future maplibre inlines or renames the
    // shared chunk, the copy still "succeeds", and the served worker quietly needs something that
    // is not there. Fabricate that package layout and prove the script stops.
    const fake = mkdtempSync(join(tmpdir(), 'mlw-src-'))
    mkdirSync(fake, { recursive: true })
    writeFileSync(join(fake, WORKER_FILES[0]), 'import { x } from "./somewhere-else.mjs"\n')
    writeFileSync(join(fake, WORKER_FILES[1]), '// shared\n')
    expect(() => copyMaplibreWorker({ srcDir: fake, outDir: join(fake, 'out'), quiet: true })).toThrow(
      /no longer imports/,
    )
  })

  it('fails loudly when a file it expects is missing, rather than writing a partial copy', () => {
    const fake = mkdtempSync(join(tmpdir(), 'mlw-src2-'))
    writeFileSync(join(fake, WORKER_FILES[0]), `import {} from "${EXPECTED_SIBLING_SPECIFIER}"\n`)
    // maplibre-gl-shared.mjs deliberately absent.
    expect(() => copyMaplibreWorker({ srcDir: fake, outDir: join(fake, 'out'), quiet: true })).toThrow(
      /no longer ships/,
    )
  })

  it('the CHECKED-IN copy under public/maplibre is in sync with the installed package', () => {
    // The files are committed, not gitignored, on purpose. `prebuild` regenerates them, but a
    // deploy configured to run `next build` directly would skip that hook — and a missing worker
    // is silent, so the map would go blank with no build error anywhere. Committing them removes
    // the build-order dependency entirely; THIS test removes the staleness risk that creates.
    // A Dependabot bump to maplibre-gl now fails here until the copy is refreshed:
    //   node scripts/copy-maplibre-worker.mjs
    for (const name of WORKER_FILES) {
      const served = join('public', 'maplibre', name)
      expect(existsSync(served), `${served} is missing — run node scripts/copy-maplibre-worker.mjs`).toBe(true)
      const installed = readFileSync(join('node_modules', 'maplibre-gl', 'dist', name))
      expect(
        readFileSync(served).equals(installed),
        `${served} is STALE against the installed maplibre-gl — run node scripts/copy-maplibre-worker.mjs`,
      ).toBe(true)
    }
  })

  it('throws on a missing package directory instead of silently producing nothing', () => {
    // A no-op "success" here would ship a build with no worker at all — the original bug, restored
    // by the very script written to prevent it.
    expect(() => copyMaplibreWorker({ srcDir: join(tmpdir(), 'definitely-not-here') })).toThrow(
      /does not exist/,
    )
  })
})
