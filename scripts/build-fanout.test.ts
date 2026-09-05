import { describe, it, expect, afterAll } from 'vitest'
import { readFileSync, readdirSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join, dirname, resolve, relative } from 'node:path'
import { tmpdir } from 'node:os'
import { execFileSync } from 'node:child_process'
import {
  measureFanout,
  evaluate,
  sanctionedPublic,
  MIN_FUNCTIONS,
  MAX_ICON_FUNCTIONS,
  MAX_SITE_PHOTOS,
  MAX_PUBLIC_PER_FUNCTION,
  ICON_CHUNK_MIN_BYTES,
  ICON_GLYPHS,
} from './check-build-fanout.mjs'

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
// 2026-09-05 (scan2 L8-01): the trace half used to live HERE under `describe.skipIf(!HAS_BUILD)`,
// and ran nowhere: CI never builds and postbuild ran only the four .mjs gates, so vitest printed
// "6 skipped" on every PR and no build ever judged the artifact. It is now
// scripts/check-build-fanout.mjs, a postbuild gate with the same thresholds. The bottom of this
// file drives that gate against fixture trees (a clean build, each planted violation, a build too
// small to trust) so the gate itself has a test on every PR.
//
// House archetype: components/maps/maps-wiring.test.ts (read the source, assert the wiring, assert
// non-triviality first so a moved or emptied file cannot pass vacuously).
// ─────────────────────────────────────────────────────────────────────────────────────────────

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), '..')
const ROOTS = ['app', 'components', 'lib']

function walk(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.next') continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walk(full))
    else if (/\.tsx?$/.test(entry.name)) out.push(full)
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

// ── The measuring half now lives in scripts/check-build-fanout.mjs and runs in postbuild. ──────
// What follows proves the gate: a clean fixture passes, every planted violation fails with its own
// message, and a fixture too small to be a real build fails BEFORE any count is believed.

/** A fixture `.next/server` tree. Every function carries the app-page runtime unless told not to,
 *  so the parse control passes; `extra` adds files to one function by index. */
function plantBuild(opts: {
  functions: number
  runtime?: boolean
  iconChunk?: boolean
  iconCarriers?: number
  extra?: Record<number, string[]>
}): string {
  const root = mkdtempSync(join(tmpdir(), 'build-fanout-'))
  const server = join(root, '.next', 'server')
  mkdirSync(join(server, 'chunks'), { recursive: true })
  // Trace paths are relative to the trace file: app/<route>/page.js.nft.json sits three levels
  // under .next/server, so the repo root is five `..` away.
  const up = '../../../../../'
  if (opts.iconChunk !== false) {
    // Big enough to be opened, and carrying both glyph families the gate looks for.
    writeFileSync(
      join(server, 'chunks', 'icons-abc123.js'),
      `${ICON_GLYPHS.join(' ')} ${'x'.repeat(ICON_CHUNK_MIN_BYTES + 1024)}`,
    )
  }
  const iconCarriers = opts.iconCarriers ?? 3
  for (let i = 0; i < opts.functions; i++) {
    const dir = join(server, 'app', `route-${i}`)
    mkdirSync(dir, { recursive: true })
    const files: string[] = []
    if (opts.runtime !== false) files.push(`${up}node_modules/next/dist/compiled/next-server/app-page-turbo.runtime.prod.js`)
    if (i < iconCarriers) files.push('../../chunks/icons-abc123.js')
    if (i === 0) {
      // The one card function: fonts, the six covers and the mark. Sanctioned, and it makes the
      // "placeholders still ship" control pass.
      files.push(`${up}public/fonts/Nunito-Regular.ttf`)
      files.push(`${up}public/images/Frequency-Logo-Round-Icon-white.png`)
      for (const cover of ['community-dinner', 'a', 'b', 'c', 'd', 'e']) files.push(`${up}public/images/site/${cover}.jpg`)
    }
    for (const f of opts.extra?.[i] ?? []) files.push(f)
    writeFileSync(join(dir, 'page.js.nft.json'), JSON.stringify({ version: 1, files }))
  }
  return root
}

const MJS = resolve(ROOT, 'scripts/check-build-fanout.mjs')
/** Run the CLI against a fixture root and report exit code + combined output. */
function runGate(root: string): { code: number; out: string } {
  try {
    const out = execFileSync(process.execPath, [MJS, '--root', root], { encoding: 'utf8', stdio: 'pipe' })
    return { code: 0, out }
  } catch (e) {
    const err = e as { status: number; stdout: string; stderr: string }
    return { code: err.status, out: `${err.stdout}\n${err.stderr}` }
  }
}

const fixtures: string[] = []
const fixture = (opts: Parameters<typeof plantBuild>[0]) => {
  const root = plantBuild(opts)
  fixtures.push(root)
  return root
}
afterAll(() => {
  for (const f of fixtures) rmSync(f, { recursive: true, force: true })
})

/** Enough functions to clear the floor. The floor itself is proven separately below. */
const ENOUGH = MIN_FUNCTIONS + 10
const up = '../../../../../'

describe('check-build-fanout.mjs: a clean artifact passes', () => {
  it('measures what it says it measures, and the CLI exits 0', () => {
    const root = fixture({ functions: ENOUGH })
    const m = measureFanout(root)!
    expect(m.functions).toBe(ENOUGH)
    expect(m.runtimeCarriers).toBe(ENOUGH)
    expect(m.iconChunks).toBe(1)
    expect(m.iconFunctions).toBe(3)
    expect(m.heicFunctions).toBe(0)
    expect(m.publicOffenders).toEqual([])
    expect(m.sitePhotos.length).toBe(6)
    expect(m.coverCarriers).toBe(1)
    expect(m.markCarriers).toBe(1)
    expect(m.worstPublic.count).toBe(8)
    expect(evaluate(m).failures).toEqual([])

    const { code, out } = runGate(root)
    expect(code).toBe(0)
    expect(out).toContain('✅ check:build-fanout')
    expect(out).toContain(`${ENOUGH} functions read`)
  })

  it('sanctions exactly the public/ files the OG cards read by literal path', () => {
    for (const ok of [
      '/repo/public/fonts/Nunito-Regular.ttf',
      '/repo/public/images/hero.jpg',
      '/repo/public/images/Frequency-Logo-Round-Icon-white.png',
      '/repo/public/images/site/community-dinner.jpg',
    ]) expect(sanctionedPublic(ok), ok).toBe(true)
    for (const bad of [
      '/repo/public/maplibre/maplibre-gl-csp-worker.js',
      '/repo/public/icons/icon-192.png',
      '/repo/public/images/site/nested/photo.jpg',
      '/repo/public/images/site/photo.png',
    ]) expect(sanctionedPublic(bad), bad).toBe(false)
  })
})

describe('check-build-fanout.mjs: every planted violation fails, with its own message', () => {
  it('heic2any in one trace', () => {
    const root = fixture({ functions: ENOUGH, extra: { 5: [`${up}.next/server/chunks/node_modules_heic2any_dist_x.js`] } })
    const { failures } = evaluate(measureFanout(root))
    expect(failures.length).toBe(1)
    expect(failures[0]).toContain('heic2any is in 1 function trace(s)')
    expect(runGate(root).code).toBe(1)
  })

  it('the icon collections carried by one function too many', () => {
    const root = fixture({ functions: ENOUGH, iconCarriers: MAX_ICON_FUNCTIONS + 1 })
    const { failures } = evaluate(measureFanout(root))
    expect(failures.length).toBe(1)
    expect(failures[0]).toContain(`carried by ${MAX_ICON_FUNCTIONS + 1} function(s) (budget ${MAX_ICON_FUNCTIONS})`)
    expect(runGate(root).code).toBe(1)
  })

  it('a public/ file nothing reads (the directory-glob signature)', () => {
    const root = fixture({ functions: ENOUGH, extra: { 7: [`${up}public/maplibre/maplibre-gl-csp-worker.js`] } })
    const { failures } = evaluate(measureFanout(root))
    expect(failures.length).toBe(1)
    expect(failures[0]).toContain('1 file(s) from public/ are carried')
    expect(failures[0]).toContain('public/maplibre/maplibre-gl-csp-worker.js')
    expect(runGate(root).code).toBe(1)
  })

  it('a seventh site photo', () => {
    const root = fixture({ functions: ENOUGH, extra: { 0: [`${up}public/images/site/seventh.jpg`] } })
    const { failures } = evaluate(measureFanout(root))
    expect(failures.length).toBe(1)
    expect(failures[0]).toContain(`${MAX_SITE_PHOTOS + 1} distinct site photos`)
    expect(runGate(root).code).toBe(1)
  })

  it('one function carrying more public/ files than any set of literal reads produces', () => {
    // Fonts are sanctioned one by one, so a pile of them trips only the per-function count.
    const fonts = Array.from({ length: MAX_PUBLIC_PER_FUNCTION + 1 }, (_, i) => `${up}public/fonts/face-${i}.ttf`)
    const root = fixture({ functions: ENOUGH, extra: { 9: fonts } })
    const { failures } = evaluate(measureFanout(root))
    expect(failures.length).toBe(1)
    expect(failures[0]).toContain(`app/route-9/page.js.nft.json carries ${MAX_PUBLIC_PER_FUNCTION + 1} public/ files`)
    expect(runGate(root).code).toBe(1)
  })

  it('the placeholders no longer shipping (a fix that only stopped tracing them)', () => {
    const root = fixture({ functions: ENOUGH })
    const m = measureFanout(root)!
    const { failures } = evaluate({ ...m, coverCarriers: 0 })
    expect(failures.length).toBe(1)
    expect(failures[0]).toContain('no longer SHIP')
  })
})

describe('check-build-fanout.mjs: it refuses to vouch for an artifact it cannot read', () => {
  it('fails under the function floor even when every count is clean', () => {
    const root = fixture({ functions: 40 })
    const m = measureFanout(root)!
    expect(m.heicFunctions).toBe(0)
    expect(m.publicOffenders).toEqual([])
    const { failures } = evaluate(m)
    expect(failures.length).toBe(1)
    expect(failures[0]).toContain(`only 40 function trace(s) read, under the ${MIN_FUNCTIONS} floor`)
    const { code, out } = runGate(root)
    expect(code).toBe(1)
    expect(out).toContain('🔴 check:build-fanout')
  })

  it('the floor sits a little under the real count, not at 1', () => {
    // Production has read 496-499 functions on every deploy since 2026-08-18. A floor of 1 would
    // let a broken trace layout that yields one parseable file pass; a floor above the real count
    // would fail every deploy. 450 is the band between them.
    // 2026-09-05 (scan2): the first real artifact read 456 functions, so the upper bound is the
    // measured count and the floor moved to 400 (the 10% band the comment above meant).
    expect(MIN_FUNCTIONS).toBeGreaterThanOrEqual(300)
    expect(MIN_FUNCTIONS).toBeLessThan(456)
  })

  it('fails when the traces parse but the runtime is not in them (paths no longer resolve)', () => {
    const root = fixture({ functions: ENOUGH, runtime: false })
    const { failures } = evaluate(measureFanout(root))
    expect(failures.some((f) => f.includes('the app-page runtime is carried by 0'))).toBe(true)
  })

  it('fails when no chunk carries the icon data at all (the data must still ship somewhere)', () => {
    const root = fixture({ functions: ENOUGH, iconChunk: false, iconCarriers: 0 })
    const { failures } = evaluate(measureFanout(root))
    expect(failures.length).toBe(1)
    expect(failures[0]).toContain('no server chunk carries the icon collections')
  })

  it('fails with no .next/server at all, from both the API and the CLI', () => {
    const root = mkdtempSync(join(tmpdir(), 'build-fanout-empty-'))
    fixtures.push(root)
    expect(measureFanout(root)).toBeNull()
    expect(evaluate(null).failures[0]).toContain('no .next/server traces')
    expect(runGate(root).code).toBe(1)
  })
})

describe('check-build-fanout.mjs is wired where it can run', () => {
  it('runs in postbuild, blocking, beside the four gates that measure the same artifact', () => {
    // CI never builds, so postbuild is the only place a trace gate can measure anything
    // (DEPLOY-SAFETY.md, ADR-1003). A gate that exists but is not here is L8-01 all over again:
    // the same five checks, skipped on every PR and run on no build.
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { scripts: Record<string, string> }
    const postbuild = pkg.scripts.postbuild ?? ''
    expect(postbuild).toContain('scripts/check-build-fanout.mjs')
    const args = /check-build-fanout\.mjs([^&|;]*)/.exec(postbuild)?.[1] ?? ''
    expect(args.trim(), 'the gate must run bare: a --warn-only here is a silent demotion').toBe('')
    expect(pkg.scripts['check:build-fanout']).toBe('node scripts/check-build-fanout.mjs')
  })
})
