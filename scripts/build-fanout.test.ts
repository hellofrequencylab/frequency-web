import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync, existsSync, globSync } from 'node:fs'
import { join, dirname, resolve, relative } from 'node:path'

// ─────────────────────────────────────────────────────────────────────────────────────────────
// FAN-OUT GUARD: the two heaviest client-only datasets must not be reachable from every route.
//
// 🔴 THE INCIDENT. On 2026-08-11 a deploy died with ENOSPC nineteen minutes into "Deploying
// outputs" (ADR-1002, docs/DEPLOY-SAFETY.md). Vercel copies each function's traced file set into
// that function's OWN directory, so the cost of a module is its size TIMES the number of functions
// that can reach it. `scripts/check-build-budget.mjs` now measures the total. This file guards the
// two lines that followed it down, because a total under budget says nothing about WHY:
//
//   * the @iconify-json collections (~6.9MB) — 337 functions, 2.3GB, because the Loom picker
//     imported the search as a `'use server'` action and the picker is the universal image popup.
//     Now behind app/api/site-icons/route.ts.
//   * heic2any (~1.3MB of libheif wasm) — 381 functions, 491MB, because lib/library/image-shrink.ts
//     is imported by two dozen uploaders and nft reads the dynamic-import specifier out of the
//     emitted SSR chunk. Now behind lib/library/heic-decode.ts + an outputFileTracingExcludes entry.
//
// TWO HALVES, on purpose. The SOURCE half runs everywhere, including CI, and catches the change
// that would cause a regression (a second importer, a deleted config line). The TRACE half only
// runs where a build exists — CI never builds, Vercel does — and is the only half that MEASURES.
// Neither is redundant: the source half cannot see a bundler rename that silently voids the
// tracing exclude, and the trace half cannot run on a PR.
//
// House archetype: components/maps/maps-wiring.test.ts (read the source, assert the wiring, assert
// non-triviality first so a moved or emptied file cannot pass vacuously).
// ─────────────────────────────────────────────────────────────────────────────────────────────

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), '..')
const ROOTS = ['app', 'components', 'lib']

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

const FILES = ROOTS.flatMap((r) => walk(join(ROOT, r))).map((p) => ({
  path: relative(ROOT, p).replaceAll('\\', '/'),
  src: readFileSync(p, 'utf8'),
}))

const isTest = (p: string) => /\.test\.tsx?$/.test(p)

/** Modules allowed to pull the full @iconify-json collections into a server graph. Adding a row
 *  here costs ~6.9MB x every function that can reach the new importer — measure before you do. */
const ICON_DATA_IMPORTERS = [
  'lib/loom/site-icons.ts', // behind GET /api/site-icons — one function
  'components/ui/icon.tsx', // the RSC <Icon> primitive — two pages compose it
]

/** The one module allowed to name heic2any. */
const HEIC_IMPORTER = 'lib/library/heic-decode.ts'

/** The exact next.config.ts entry that keeps that module's chunk out of the server traces. */
const HEIC_CHUNK_EXCLUDE = './.next/server/chunks/**/*heic2any*'

describe('the icon collections are reachable from a route handler, not from every uploader', () => {
  it('is non-trivial (guards a vacuous pass)', () => {
    expect(FILES.length).toBeGreaterThan(500)
    const search = FILES.find((f) => f.path === 'lib/loom/site-icons.ts')
    expect(search).toBeDefined()
    expect(search!.src).toContain("@iconify-json/lucide/icons.json")
    expect(search!.src).toContain('export async function searchSiteIcons')
  })

  it('only the sanctioned modules import the collection JSON', () => {
    const offenders = FILES.filter(
      (f) =>
        !isTest(f.path) &&
        !ICON_DATA_IMPORTERS.includes(f.path) &&
        /@iconify-json\/[a-z]+\/icons\.json/.test(f.src),
    ).map((f) => f.path)
    expect(offenders).toEqual([])
  })

  it('the route handler is the only server door to the search', () => {
    const route = FILES.find((f) => f.path === 'app/api/site-icons/route.ts')
    expect(route).toBeDefined()
    expect(route!.src).toContain("from '@/lib/loom/site-icons'")

    const importers = FILES.filter(
      (f) =>
        !isTest(f.path) &&
        f.path !== 'app/api/site-icons/route.ts' &&
        /from '(@\/lib\/loom\/site-icons|\.\/site-icons)'/.test(f.src),
    ).map((f) => f.path)
    expect(importers).toEqual([])
  })

  it('the Loom picker reaches the icons over HTTP, not through a server action', () => {
    const picker = FILES.find((f) => f.path === 'components/loom/loom-picker.tsx')
    expect(picker).toBeDefined()
    expect(picker!.src).toContain("from '@/lib/loom/site-icons-client'")
    expect(picker!.src).toContain('fetchSiteIcons(')
    // The whole point: no import of the heavy module, not even a type one that could lose its
    // `type` keyword in a later edit.
    expect(picker!.src).not.toContain("from '@/lib/loom/site-icons'")
  })

  it('the client-side module stays light (nothing heavy may ride along with the picker)', () => {
    const client = FILES.find((f) => f.path === 'lib/loom/site-icons-client.ts')
    expect(client).toBeDefined()
    expect(client!.src).not.toContain('@iconify')
    // No imports at all today. If that ever changes, whatever is added is copied into every
    // function that can open the picker.
    expect(/^\s*import\s/m.test(client!.src)).toBe(false)
  })
})

describe('the HEIC decoder has exactly one door, and the trace excludes it', () => {
  it('is non-trivial (guards a vacuous pass)', () => {
    const decoder = FILES.find((f) => f.path === HEIC_IMPORTER)
    expect(decoder).toBeDefined()
    expect(decoder!.src).toContain("await import('heic2any')")
    expect(decoder!.src).toContain('export async function decodeHeicToJpeg')
  })

  it('nothing else in the repo names heic2any', () => {
    const offenders = FILES.filter(
      (f) => f.path !== HEIC_IMPORTER && !isTest(f.path) && /['"]heic2any['"]/.test(f.src),
    ).map((f) => f.path)
    expect(offenders).toEqual([])
  })

  it('image-shrink reaches the decoder through that door', () => {
    const shrink = FILES.find((f) => f.path === 'lib/library/image-shrink.ts')
    expect(shrink).toBeDefined()
    expect(shrink!.src).toContain("await import('./heic-decode')")
  })

  it('next.config.ts still drops the heic2any chunk from every function trace', () => {
    const config = readFileSync(join(ROOT, 'next.config.ts'), 'utf8')
    expect(config).toContain('outputFileTracingExcludes')
    // The exclude is keyed on the chunk NAME. If Turbopack ever stops putting "heic2any" in it,
    // this line silently stops matching and 491MB comes back — which is what the trace half below
    // is for. Keep both.
    expect(config).toContain(HEIC_CHUNK_EXCLUDE)
  })
})

// ── The measuring half. Reads what the last `pnpm build` actually wrote. ─────────────────────

const SERVER_DIR = join(ROOT, '.next', 'server')
const HAS_BUILD = existsSync(SERVER_DIR) && globSync('**/*.nft.json', { cwd: SERVER_DIR }).length > 0

describe.skipIf(!HAS_BUILD)('the traced artifact agrees (needs a `pnpm build`)', () => {
  const traces = globSync('**/*.nft.json', { cwd: SERVER_DIR })

  /** function trace -> the absolute files it carries */
  const carried = traces.map((rel) => {
    const traceFile = join(SERVER_DIR, rel)
    let files: string[] = []
    try {
      files = JSON.parse(readFileSync(traceFile, 'utf8')).files ?? []
    } catch {
      files = []
    }
    const base = dirname(traceFile)
    return { fn: rel, files: files.map((f) => resolve(base, f)) }
  })

  /** How many functions carry a file this predicate accepts. */
  const countCarrying = (match: (abs: string) => boolean) =>
    carried.filter((c) => c.files.some(match)).length

  it('is non-trivial (a broken read must not pass this suite vacuously)', () => {
    expect(traces.length).toBeGreaterThan(100)
    // A control: the app-page runtime is in essentially every function. If this is not widely
    // carried, the traces did not parse and every count below is a false zero.
    expect(countCarrying((f) => f.includes('app-page-turbo.runtime.prod'))).toBeGreaterThan(
      traces.length / 2,
    )
  })

  it('the icon collections are carried by a handful of functions, not hundreds', () => {
    // The chunk name is a content hash, so it has to be found by CONTENT. Only server chunks big
    // enough to BE the collections are opened (~6.9MB), which keeps this to a couple of reads.
    const chunkDir = join(SERVER_DIR, 'chunks')
    const big = existsSync(chunkDir)
      ? globSync('**/*.js', { cwd: chunkDir })
          .map((r) => join(chunkDir, r))
          .filter((abs) => {
            try {
              return statSync(abs).size > 2 * 1024 * 1024
            } catch {
              return false
            }
          })
      : []
    const iconChunks = new Set(
      big.filter((abs) => {
        const src = readFileSync(abs, 'utf8')
        // Two glyph names that only exist in the installed sets, from two different families.
        return src.includes('flower-lotus') && src.includes('a-arrow-down')
      }),
    )
    expect(iconChunks.size).toBeGreaterThan(0) // the data must still be SOMEWHERE
    const fns = countCarrying((f) => iconChunks.has(f))
    // Measured before: 337. The floor is not 1 — components/ui/icon.tsx legitimately renders in
    // two pages (admin library, onboarding sequence preview) on top of the route handler. Raising
    // this number means a new server surface pulled in ~6.9MB times every route beneath it.
    expect(fns).toBeLessThanOrEqual(8)
  })

  it('heic2any is in no function trace at all', () => {
    // Measured before: 381 functions x 1.29MB = 491MB. It runs only in a browser, so the correct
    // number is zero. A non-zero count means the tracing exclude stopped matching.
    expect(countCarrying((f) => /heic2any/i.test(f))).toBe(0)
  })
})
