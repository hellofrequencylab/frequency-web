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
//   * the whole of `public/` (12.25MB) — 62 functions, 759.5MB, because four OG modules read a
//     placeholder image through `readFile(join(process.cwd(), 'public', <variable>))`. nft cannot
//     resolve a parameterised path, so it globs the deepest prefix it can — the entire directory —
//     into every function under the segments those cards sit above. Now literal reads in
//     lib/og/local-image.ts, keyed by the closed placeholder union.
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

/** The one module allowed to read an image out of `public/` at runtime. */
const LOCAL_IMAGE_MODULE = 'lib/og/local-image.ts'

/**
 * Every argument a `join(process.cwd(), ...)` call passes AFTER `process.cwd()`, one string per
 * call site, as written in the source. Depth-counted rather than regexed to the first `)`, because
 * `process.cwd()` carries a paren of its own.
 */
function cwdJoinArgs(source: string): string[] {
  // Comment LINES only (`//`, `*`, `/*` in the leading position). The modules that fixed this bug
  // quote the broken call in their own headers to explain it, and a guard that cannot tell an
  // explanation from a regression fails on the very files that document it. Code lines are never
  // stripped, so a real call cannot hide behind this.
  const src = source
    .split('\n')
    .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
    .join('\n')
  const out: string[] = []
  const re = /\b(?:path\.)?join\(\s*process\.cwd\(\)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(src))) {
    const open = src.indexOf('(', m.index)
    let depth = 0
    let i = open
    for (; i < src.length; i++) {
      if (src[i] === '(') depth += 1
      else if (src[i] === ')') {
        depth -= 1
        if (depth === 0) break
      }
    }
    // Drop the leading `process.cwd()`; what remains is the path the tracer has to resolve.
    out.push(src.slice(open + 1, i).replace(/^\s*process\.cwd\(\)\s*,?/, ''))
  }
  return out
}

/** Split an argument list on its top-level commas. */
function splitArgs(args: string): string[] {
  const out: string[] = []
  let depth = 0
  let cur = ''
  for (const ch of args) {
    if (ch === '(' || ch === '[' || ch === '{') depth += 1
    else if (ch === ')' || ch === ']' || ch === '}') depth -= 1
    if (ch === ',' && depth === 0) {
      out.push(cur)
      cur = ''
    } else cur += ch
  }
  if (cur.trim()) out.push(cur)
  return out.map((s) => s.trim()).filter(Boolean)
}

/** A bare string literal — the only thing @vercel/nft can resolve statically. */
const isLiteral = (arg: string) => /^'[^'\\]*'$/.test(arg) || /^"[^"\\]*"$/.test(arg)

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
    // NO imports at all today, which is the strongest form of "light" and the easiest to check
    // (a substring test for '@iconify' would trip over this file's own comments). Anything added
    // here is copied into every function that can open the picker, so adding one is a measurement,
    // not a refactor.
    expect(/^\s*(import|const\s.*=\s*require\()/m.test(client!.src)).toBe(false)
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

describe('every path read out of public/ is a literal, so the tracer never globs the directory', () => {
  it('is non-trivial (guards a vacuous pass)', () => {
    const mod = FILES.find((f) => f.path === LOCAL_IMAGE_MODULE)
    expect(mod).toBeDefined()
    expect(mod!.src).toContain('export async function coverPlaceholderDataUrl')
    expect(mod!.src).toContain('export async function siteMarkDataUrl')
    // The readers must actually be reads, and literal ones. A module that stopped calling readFile
    // would pass every assertion below while shipping cards with no background. Seven: the six
    // cover placeholders plus the Frequency mark.
    expect(mod!.src.match(/readFile\(join\(process\.cwd\(\), 'public\/images/g)?.length).toBe(7)
  })

  it('nothing anywhere builds a process.cwd() path out of a variable', () => {
    // 🔴 THE WHOLE BUG, in one predicate. `join(process.cwd(), 'public', relPath)` is unresolvable
    // to @vercel/nft, which falls back to globbing `public/` — 12.25MB into 62 functions, measured.
    // ADR-1004 is the same mistake against the repo ROOT. Tests are exempt: they read source at
    // runtime by construction and never ship in a function.
    const offenders = FILES.filter((f) => !isTest(f.path)).flatMap((f) =>
      cwdJoinArgs(f.src)
        .filter((args) => !splitArgs(args).every(isLiteral))
        .map((args) => `${f.path}: join(process.cwd(), ${args.trim()})`),
    )
    expect(offenders).toEqual([])
  })

  it('the placeholder set and its readers cannot drift apart', () => {
    // The Record in local-image.ts is keyed by CoverPlaceholderPath, so the COMPILER already
    // rejects a missing reader. This asserts that typing is still in place — weakening the key to
    // `string` would compile and silently allow a placeholder with no literal read behind it.
    const mod = FILES.find((f) => f.path === LOCAL_IMAGE_MODULE)!
    expect(mod.src).toContain('Record<CoverPlaceholderPath, () => Promise<Buffer>>')

    const source = FILES.find((f) => f.path === 'lib/spaces/cover-placeholder.ts')
    expect(source).toBeDefined()
    expect(source!.src).toContain('export type CoverPlaceholderPath')
    const placeholders = [...source!.src.matchAll(/'(\/images\/site\/[^']+)'/g)].map((m) => m[1])
    expect(placeholders.length).toBeGreaterThan(0)
    // Each one is read by name in the reader module (the basename is the literal nft resolves).
    for (const p of placeholders) expect(mod.src).toContain(`'${p.split('/').pop()}'`)
  })

  it('the OG cards reach those images through that module, not through fs', () => {
    // The four modules that used to hold the glob open. A `node:fs` import returning to any of them
    // is how this regresses: the helper gets re-inlined "just for one image" and the directory
    // comes back with it.
    const CARDS = [
      'app/(main)/spaces/[slug]/opengraph-image.tsx',
      'app/(main)/events/[slug]/opengraph-image.tsx',
      'app/events/claim/[token]/opengraph-image.tsx',
      'lib/og/claim-card.tsx',
    ]
    for (const path of CARDS) {
      const card = FILES.find((f) => f.path === path)
      expect(card, path).toBeDefined()
      expect(card!.src, path).toMatch(/from ['"]@\/lib\/og\/local-image['"]/)
      expect(card!.src, path).not.toMatch(/from ['"]node:fs/)
    }
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

  // ── public/ is a WEB directory. Almost none of it belongs in a serverless function. ─────────
  //
  // Measured before the literal readers landed: 62 functions carrying all 69 files, 12.25MB each,
  // 770.4MB of public/ across the build. After: the numbers in each assertion below. The glob had
  // a distinctive signature — a function that carries `public/maplibre` or the PWA icon set is a
  // function that got handed the whole directory, because no server code reads either.

  /** Everything a function is allowed to carry out of public/, and the reason it may. */
  const SANCTIONED_PUBLIC = (f: string) =>
    // the OG faces (lib/og/load-nunito.ts + the narrowed next.config.ts include keys)
    f.includes('/public/fonts/') ||
    // the help + root card's photo, read by a literal path in both
    f.endsWith('/public/images/hero.jpg') ||
    // the watermark and the six cover placeholders, read by lib/og/local-image.ts
    f.endsWith('/public/images/Frequency-Logo-Round-Icon-white.png') ||
    /\/public\/images\/site\/[^/]+\.jpg$/.test(f)

  it('no function carries a file from public/ that nothing reads from disk', () => {
    const offenders = new Set<string>()
    for (const c of carried) {
      for (const f of c.files) {
        if (f.includes('/public/') && !SANCTIONED_PUBLIC(f)) offenders.add(relative(ROOT, f))
      }
    }
    // Measured before: 56 files, led by public/maplibre (a browser bundle), the seven PWA icons,
    // and 37 stock photographs no card can select. Adding a row to SANCTIONED_PUBLIC above is a
    // real decision: it costs that file's size times every function under the segment that reads
    // it. Measure with scripts/check-build-budget.mjs before you do.
    expect([...offenders].sort()).toEqual([])
  })

  it('the cover placeholders reach only the cards, and only as themselves', () => {
    // Non-triviality first: the placeholders must still SHIP. A fix that merely stopped tracing
    // them would pass the assertion above and serve share cards with a blank background.
    expect(
      countCarrying((f) => f.endsWith('/public/images/site/community-dinner.jpg')),
    ).toBeGreaterThan(0)
    expect(
      countCarrying((f) => f.endsWith('/public/images/Frequency-Logo-Round-Icon-white.png')),
    ).toBeGreaterThan(0)

    // The six placeholders are the ONLY site photos in any trace. Measured before: 43 of them, the
    // signature of the directory glob rather than of six literal reads.
    const sitePhotos = new Set<string>()
    for (const c of carried) {
      for (const f of c.files) {
        if (f.includes('/public/images/site/')) sitePhotos.add(relative(ROOT, f))
      }
    }
    expect(sitePhotos.size).toBeLessThanOrEqual(6)
  })

  it('no function carries more than a handful of public/ files', () => {
    // The blunt instrument, and the one that cannot be fooled by a rename: a glob shows up as a
    // file COUNT no set of literal reads would produce. Measured before: 72 in the claim-link
    // functions. The ceiling is the 5 fonts + 6 covers + the mark + hero.jpg, with a little room.
    const worst = Math.max(...carried.map((c) => c.files.filter((f) => f.includes('/public/')).length))
    expect(worst).toBeLessThanOrEqual(14)
  })
})
