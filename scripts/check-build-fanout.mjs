#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// FAN-OUT GATE ON THE TRACED ARTIFACT (scan2 L8-01, 2026-09-05).
//
// `check:build-budget` measures the TOTAL the deploy writes. This gate measures WHY. The three
// lines that followed the 2026-08-11 ENOSPC incident down (ADR-1002, ADR-1008, ADR-1010) were each
// a small module copied into hundreds of functions, and a total under budget says nothing about a
// new one of those until the day it does not fit:
//
//   * the @iconify-json collections (~6.9MB): 337 functions, 2.3GB, before the search moved behind
//     app/api/site-icons/route.ts. Now carried by a handful.
//   * heic2any (~1.3MB of libheif wasm): 381 functions, 491MB, before lib/library/heic-decode.ts and
//     the outputFileTracingExcludes entry in next.config.ts. It runs only in a browser; the correct
//     count is zero.
//   * the whole of `public/` (12.25MB): 62 functions, 759.5MB, because four OG modules read a
//     placeholder through `join(process.cwd(), 'public', <variable>)` and @vercel/nft globbed the
//     directory. Now literal reads in lib/og/local-image.ts, keyed by the placeholder union.
//
// These five checks lived in scripts/build-fanout.test.ts under `describe.skipIf(!HAS_BUILD)`, and
// ran NOWHERE: CI never builds, and postbuild ran only the four .mjs gates. Vitest reported them as
// "6 skipped" on every PR for three weeks. They now run here, after every real build, with the
// thresholds the tests carried. build-fanout.test.ts keeps the SOURCE half and exercises this file
// against a fixture tree (a planted violation and a clean case), so the gate has a test on every PR.
//
// Runs AFTER `pnpm build` (postbuild) and reads the .nft.json traces that build just wrote, in the
// same way check:build-budget and check:og-trace do. Importable: the measuring and judging halves
// are exported so the fixture test can drive them without a build.
// ─────────────────────────────────────────────────────────────────────────────
import { readFileSync, existsSync, globSync, statSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

// ── THE THRESHOLDS, exactly as the skipped tests carried them ─────────────────────────────────

/** Non-triviality floor. A build that produced fewer traces than this is not the build this gate
 *  knows how to judge: production has read 496-499 functions on every deploy since 2026-08-18
 *  (AGENTS.md, Deploy safety), so 450 is roughly 10% of route deletions below the real count. A
 *  count under it means the trace layout changed or the build did not finish, and every count
 *  below would be a false zero. Lower it only beside a measured production reading.
 *
 *  2026-09-05 (scan2, the measured reading): the first real artifact this gate saw (preview
 *  afd733e, then production) read 456 functions, not 496-499; the 496 figure came from a tree
 *  three weeks older, and every production build on 2026-09-05 has read 456. A floor of 450 sat
 *  six route deletions under the real count, so 400 is the same 10% band the paragraph above
 *  intended, measured rather than assumed. A broken trace layout still reads as zero. */
export const MIN_FUNCTIONS = 400

/** The app-page runtime is in essentially every function. If fewer than this share carry it, the
 *  traces did not parse and every count below is a false zero. */
export const MIN_RUNTIME_SHARE = 0.5

/** Measured before: 337. The floor is not 1 because components/ui/icon.tsx legitimately renders in
 *  two pages on top of the route handler. Raising this means a new server surface pulled ~6.9MB
 *  times every route beneath it. */
export const MAX_ICON_FUNCTIONS = 8

/** The six cover placeholders are the ONLY site photos any trace may carry. Measured before the
 *  literal readers: 43, the signature of a directory glob. */
export const MAX_SITE_PHOTOS = 6

/** The blunt instrument: 5 faces + 6 covers + the mark + hero.jpg, with a little room. A glob shows
 *  up as a file COUNT no set of literal reads would produce (69 before, 10 after). */
export const MAX_PUBLIC_PER_FUNCTION = 14

/** Only server chunks big enough to BE the icon collections are opened. */
export const ICON_CHUNK_MIN_BYTES = 2 * 1024 * 1024

/** Two glyph names that only exist in the installed sets, from two different families. The chunk
 *  name is a content hash, so the collections have to be found by content. */
export const ICON_GLYPHS = ['flower-lotus', 'a-arrow-down']

/** Everything a function is allowed to carry out of public/, and the reason it may. */
export function sanctionedPublic(f) {
  return (
    // the OG faces (lib/og/load-nunito.ts + the narrowed next.config.ts include keys)
    f.includes('/public/fonts/') ||
    // the help + root card's photo, read by a literal path in both
    f.endsWith('/public/images/hero.jpg') ||
    // the watermark and the six cover placeholders, read by lib/og/local-image.ts
    f.endsWith('/public/images/Frequency-Logo-Round-Icon-white.png') ||
    /\/public\/images\/site\/[^/]+\.jpg$/.test(f)
  )
}

const toPosix = (p) => p.split(path.sep).join('/')

/**
 * Read every function trace under `<root>/.next/server` and count what this gate cares about.
 * Pure over the file system: no printing, no exit. Returns `null` when there is nothing to read.
 */
export function measureFanout(root) {
  const serverDir = path.join(root, '.next', 'server')
  if (!existsSync(serverDir)) return null
  const traces = globSync('**/*.nft.json', { cwd: serverDir })
  if (traces.length === 0) return null

  /** function trace -> the absolute (posix) files it carries, deduplicated */
  const carried = []
  for (const rel of traces) {
    const traceFile = path.join(serverDir, rel)
    let files
    try {
      files = JSON.parse(readFileSync(traceFile, 'utf8')).files
    } catch {
      continue // a trace we cannot read is not evidence either way; the floor catches a broken read
    }
    if (!Array.isArray(files)) continue
    const base = path.dirname(traceFile)
    carried.push({ fn: toPosix(rel), files: new Set(files.map((f) => toPosix(path.resolve(base, f)))) })
  }

  const countCarrying = (match) => carried.filter((c) => [...c.files].some(match)).length

  // The icon collections, found by content among the big server chunks.
  const chunkDir = path.join(serverDir, 'chunks')
  const iconChunks = new Set()
  // Read in one step under try/catch: a chunk that vanishes between the listing and the read is
  // skipped, never a crash, and there is no check-then-use window on the size test.
  let chunkFiles = []
  try {
    chunkFiles = globSync('**/*.js', { cwd: chunkDir })
  } catch {
    chunkFiles = []
  }
  for (const rel of chunkFiles) {
    const abs = path.join(chunkDir, rel)
    let src
    try {
      const st = statSync(abs)
      if (st.size <= ICON_CHUNK_MIN_BYTES) continue
      src = readFileSync(abs, 'utf8')
    } catch {
      continue
    }
    if (ICON_GLYPHS.every((g) => src.includes(g))) iconChunks.add(toPosix(abs))
  }

  const publicOffenders = new Set()
  const sitePhotos = new Set()
  let worstPublic = { fn: null, count: 0 }
  for (const c of carried) {
    let publicCount = 0
    for (const f of c.files) {
      if (!f.includes('/public/')) continue
      publicCount += 1
      if (!sanctionedPublic(f)) publicOffenders.add(path.relative(root, f).split(path.sep).join('/'))
      if (f.includes('/public/images/site/')) sitePhotos.add(path.relative(root, f).split(path.sep).join('/'))
    }
    if (publicCount > worstPublic.count) worstPublic = { fn: c.fn, count: publicCount }
  }

  return {
    functions: carried.length,
    traceFiles: traces.length,
    runtimeCarriers: countCarrying((f) => f.includes('app-page-turbo.runtime.prod')),
    iconChunks: iconChunks.size,
    iconFunctions: countCarrying((f) => iconChunks.has(f)),
    heicFunctions: countCarrying((f) => /heic2any/i.test(f)),
    publicOffenders: [...publicOffenders].sort(),
    sitePhotos: [...sitePhotos].sort(),
    coverCarriers: countCarrying((f) => f.endsWith('/public/images/site/community-dinner.jpg')),
    markCarriers: countCarrying((f) => f.endsWith('/public/images/Frequency-Logo-Round-Icon-white.png')),
    worstPublic,
  }
}

/**
 * Judge a measurement. Returns the failures (each a paragraph for the log) and the summary lines
 * a passing run prints. `limits` exists so the fixture test can prove each arm fires without
 * building 450 traces for every case; production runs with the defaults.
 */
export function evaluate(m, limits = {}) {
  const L = {
    minFunctions: MIN_FUNCTIONS,
    minRuntimeShare: MIN_RUNTIME_SHARE,
    maxIconFunctions: MAX_ICON_FUNCTIONS,
    maxSitePhotos: MAX_SITE_PHOTOS,
    maxPublicPerFunction: MAX_PUBLIC_PER_FUNCTION,
    ...limits,
  }
  const failures = []

  // ── Non-triviality first. A gate that reads nothing must not report a clean artifact. ──
  if (!m) {
    failures.push('no .next/server traces to read. Run `pnpm build` first; a build that wrote no traces is not one this gate can vouch for.')
    return { failures, lines: [] }
  }
  if (m.functions < L.minFunctions) {
    failures.push(
      `only ${m.functions} function trace(s) read, under the ${L.minFunctions} floor.\n` +
        `   Production has read 496-499 on every deploy since 2026-08-18. Either the build did not\n` +
        `   finish, or the .nft.json layout changed and every count below is a false zero. Do not\n` +
        `   lower the floor to pass; find out which.`,
    )
  }
  if (m.runtimeCarriers <= m.functions * L.minRuntimeShare) {
    failures.push(
      `the app-page runtime is carried by ${m.runtimeCarriers} of ${m.functions} functions.\n` +
        `   It is in essentially every function on a real build, so a low share means the trace\n` +
        `   file lists did not parse or their paths no longer resolve. Every count below is suspect.`,
    )
  }
  if (m.iconChunks === 0) {
    failures.push(
      `no server chunk carries the icon collections (looked for ${ICON_GLYPHS.join(' + ')} in\n` +
        `   chunks over ${ICON_CHUNK_MIN_BYTES / 1024 / 1024}MB). The data must still ship SOMEWHERE for\n` +
        `   GET /api/site-icons; either the search route lost it, or the chunk shape changed and the\n` +
        `   icon count below is a false zero.`,
    )
  }
  if (m.coverCarriers === 0 || m.markCarriers === 0) {
    failures.push(
      `the cover placeholders no longer SHIP (community-dinner.jpg in ${m.coverCarriers} function(s),\n` +
        `   the round mark in ${m.markCarriers}). A fix that merely stopped tracing them would pass every\n` +
        `   other check here and serve share cards with a blank background.`,
    )
  }

  // ── The measurements. ──
  if (m.iconFunctions > L.maxIconFunctions) {
    failures.push(
      `the icon collections are carried by ${m.iconFunctions} function(s) (budget ${L.maxIconFunctions}).\n` +
        `   Measured before the fix: 337 functions, 2.3GB. A new server surface imported\n` +
        `   lib/loom/site-icons or @iconify-json/*/icons.json; the picker must reach the search over\n` +
        `   HTTP (app/api/site-icons/route.ts), never through a server action. See ADR-1008.`,
    )
  }
  if (m.heicFunctions > 0) {
    failures.push(
      `heic2any is in ${m.heicFunctions} function trace(s); the correct number is zero.\n` +
        `   It runs only in a browser. Measured before: 381 functions x 1.29MB = 491MB. The\n` +
        `   outputFileTracingExcludes entry in next.config.ts stopped matching the chunk name, or a\n` +
        `   second module started naming the package. See ADR-1008.`,
    )
  }
  if (m.publicOffenders.length > 0) {
    failures.push(
      `${m.publicOffenders.length} file(s) from public/ are carried by a function although nothing reads\n` +
        `   them from disk. This is the signature of @vercel/nft globbing the directory because a path\n` +
        `   was built out of a variable (ADR-1010). Measured before: 56 files, led by public/maplibre.\n` +
        `   First offenders:\n` +
        m.publicOffenders
          .slice(0, 12)
          .map((f) => `     ${f}`)
          .join('\n'),
    )
  }
  if (m.sitePhotos.length > L.maxSitePhotos) {
    failures.push(
      `${m.sitePhotos.length} distinct site photos are in the traces (at most ${L.maxSitePhotos}, the\n` +
        `   cover placeholders). Measured before: 43. The reader in lib/og/local-image.ts must stay a\n` +
        `   set of literal reads keyed by CoverPlaceholderPath.`,
    )
  }
  if (m.worstPublic.count > L.maxPublicPerFunction) {
    failures.push(
      `${m.worstPublic.fn} carries ${m.worstPublic.count} public/ files (at most ${L.maxPublicPerFunction}).\n` +
        `   The ceiling is 5 faces + 6 covers + the mark + hero.jpg with a little room; a count no set\n` +
        `   of literal reads would produce means the directory came back. Measured before: 69.`,
    )
  }

  const lines = [
    `${m.functions} functions read (floor ${L.minFunctions}); the app-page runtime is in ${m.runtimeCarriers} of them.`,
    `icon collections: ${m.iconChunks} chunk(s), carried by ${m.iconFunctions} function(s) (budget ${L.maxIconFunctions}).`,
    `heic2any: in ${m.heicFunctions} function(s) (must be 0).`,
    `public/: ${m.publicOffenders.length} unsanctioned file(s); ${m.sitePhotos.length} site photo(s) (at most ${L.maxSitePhotos}); ` +
      `worst function carries ${m.worstPublic.count} (at most ${L.maxPublicPerFunction}).`,
    `placeholders ship: community-dinner.jpg in ${m.coverCarriers}, the round mark in ${m.markCarriers}.`,
  ]
  return { failures, lines }
}

/** The CLI. `--root <dir>` points at a tree other than the working directory (the fixture test). */
export function main(argv = process.argv.slice(2)) {
  const rootFlag = argv.indexOf('--root')
  const root = rootFlag !== -1 && argv[rootFlag + 1] ? path.resolve(argv[rootFlag + 1]) : process.cwd()

  if (!existsSync(path.join(root, '.next', 'server'))) {
    console.error('check:build-fanout — no .next/server. Run `pnpm build` first.')
    return 1
  }

  // Same honesty line as check:og-trace (HYG-014): a LOCAL read is a smoke test, not evidence.
  if (process.env.VERCEL !== '1') {
    console.warn(
      'ℹ️  check:build-fanout is reading a LOCAL .next, not the deploy artifact. Its verdict is a smoke\n' +
        '   test, NOT evidence about production. Read the `postbuild` output of the real deployment.',
    )
  }

  const m = measureFanout(root)
  const { failures, lines } = evaluate(m)

  if (failures.length > 0) {
    console.error(`\n🔴 check:build-fanout — ${failures.length} problem(s) in the traced artifact.\n`)
    for (const f of failures) console.error(`   ✗ ${f}\n`)
    if (lines.length > 0) {
      console.error('   Measured:')
      for (const l of lines) console.error(`     ${l}`)
    }
    console.error(
      '\n   Fix the fan-out, never the number: anything reachable from a root layout, a ROOT metadata\n' +
        '   file, or a shared server module is multiplied by every route beneath it (DEPLOY-SAFETY.md).\n',
    )
    return 1
  }

  console.log('✅ check:build-fanout — the three fan-out lines from ADR-1002 are still closed.')
  for (const l of lines) console.log(`   ${l}`)
  return 0
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  process.exit(main())
}
