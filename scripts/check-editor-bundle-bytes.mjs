#!/usr/bin/env node
// EDITOR BYTES IN THE BUILT BUNDLE: the bundle-byte instrument (PROG-E0 task 18, PROG-E0B).
//
// E0's CRDT gate is "zero editor bytes public". scripts/check-editor-crdt-importers.mjs pins the
// SOURCE entry point (who may import yjs). It cannot see what the compiler did with those imports.
// This reads the artifact: which built client chunks carry the CRDT runtime, which routes name
// those chunks, and how many bytes that is.
//
// BLOCKING IN `postbuild` SINCE 2026-11-16 (PROG-E0C). It shipped advisory (PROG-E0B) because a
// build-blocking gate that has never seen a real artifact is the 2026-08-11 incident with the roles
// reversed (docs/DEPLOY-SAFETY.md). The production build of main then printed it green: 633 routes
// read, `/(main)/pages/canvas/page 116.6 KB`, no route outside the editor named. That reading
// confirmed the three things fixtures could not: the manifest shape resolves to chunks on disk, the
// route names match EDITOR_ROUTES, and the literals survive the production minifier.
//
// EXIT CODES. 0 clean. 1 a LEAK: a route outside the editor names a chunk that carries the runtime.
// 79 CANNOT LOOK: no `.next`, no route manifests, no carrier anywhere, the editor route gone from
// the artifact, chunk names that resolve to nothing on disk, most manifests unreadable, or its own
// crash. Cannot-look fails the build, the same way the sibling gates treat an artifact they cannot
// read (check:build-budget, check:og-trace, check:build-fanout, check:notfound-routes all exit
// non-zero on a missing `.next`, and check:shell-weight fails on an empty measured set): a gate that
// did not look has not passed. Two conditions are a loud WARNING line and not a failure, because a
// healthy build can produce them: a single manifest that will not load (the siblings skip one
// unreadable trace the same way, with a floor), and an editor route that names no carrier (the
// canvas moved behind a client-side `import()`, which is allowed).
// `--warn-only` is the advisory stage it came from: it measures, prints, and exits 0 on every arm.
// It must not be in `postbuild`; the last test in scripts/check-editor-bundle-bytes.test.ts fails a
// re-added `--warn-only` or `|| true` as a silent demotion.
//
// HOW IT READS.
//   1. Every client chunk under `.next/static/` is searched for a runtime fingerprint (string
//      literals that survive minification, each proven present in the installed package by the
//      sibling test). A chunk with a hit is a CARRIER. `static/` only: the SSR copies under
//      `server/` carry the same literals and would turn every server render into a false leak.
//   2. Every `*_client-reference-manifest.js` under `.next/server/app` is one route. The chunks it
//      names (`entryJSFiles` and each `clientModules[*].chunks`) are what that route can load.
//   3. A carrier named by a route outside EDITOR_ROUTES is a LEAK. Carriers named by an editor
//      route are the editor's byte count. Carriers no manifest names are lazy (`import()` from a
//      client module) and are reported as their own number.
//
// WHAT IT CANNOT SEE, said here so a green line is not over-read:
//   - A lazy carrier reached by `import()` from a PUBLIC client module. No manifest names it, so
//     it lands in the "lazy" number, not the leak list. The source guard covers that entry point.
//   - lib/editor-crdt modules that import no runtime (channel.ts, awareness.ts) have no literal a
//     minifier keeps. yjs is the marker: every module that makes a document imports it.
//   - Chunk names are matched by basename so either a bare path or a `/_next/` URL resolves. If a
//     compiler upgrade changes the shape so that no named chunk is a file under `static/`, that is
//     the cannot-look arm above, not a pass.
//
// Usage: node scripts/check-editor-bundle-bytes.mjs [--warn-only]

import { existsSync, globSync, readFileSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { invokedDirectly } from './lib/invoked-directly.mjs'

export const NAME = 'check:editor-bundle-bytes'
export const INDETERMINATE = 79

/** Literals that mark the CRDT runtime in a minified chunk. `source` is where the sibling test
 *  proves the literal still exists, so a package upgrade that drops one fails a test rather than
 *  blinding the instrument. */
export const FINGERPRINTS = [
  { pkg: 'yjs', needles: ['Yjs was already imported. This breaks constructor checks'], source: 'node_modules/yjs/dist/yjs.mjs' },
  { pkg: 'yjs', needles: ['__ $YJS$ __'], source: 'node_modules/yjs/dist/yjs.mjs' },
  // The sync plugin's key. Quoted, because the bare word is too short to trust on its own.
  { pkg: 'y-prosemirror', needles: ['"y-sync"', "'y-sync'", '`y-sync`'], source: 'node_modules/y-prosemirror/src/plugins/keys.js' },
]

/** Routes that are allowed to carry the runtime: the editor's own surfaces. Matched against the
 *  route name derived from the manifest's path under `.next/server/app`. Every other route is
 *  treated as public for this purpose, which is stricter than "signed out" on purpose: a member
 *  page that is not an editor should not pay for multiplayer either. */
export const EDITOR_ROUTES = [/^\/\(main\)\/pages\/canvas\//]

const isEditorRoute = (route, editorRoutes) => editorRoutes.some((re) => re.test(route))

/** Every chunk file name one manifest entry refers to, as basenames. */
export function chunkRefs(entry) {
  const out = new Set()
  const take = (v) => {
    if (typeof v !== 'string') return
    const clean = v.split('?')[0]
    if (clean.endsWith('.js')) out.add(path.posix.basename(clean))
  }
  for (const files of Object.values(entry?.entryJSFiles ?? {})) if (Array.isArray(files)) files.forEach(take)
  for (const mod of Object.values(entry?.clientModules ?? {})) if (Array.isArray(mod?.chunks)) mod.chunks.forEach(take)
  return [...out]
}

/** Which packages' fingerprints appear in one chunk's text. */
export function packagesIn(text, fingerprints = FINGERPRINTS) {
  const found = new Set()
  for (const f of fingerprints) if (f.needles.some((n) => text.includes(n))) found.add(f.pkg)
  return [...found]
}

/**
 * The verdict, pure. `routes` is one entry per manifest ({ route, chunks: basenames });
 * `carriers` is one entry per chunk that holds the runtime ({ chunk, bytes, packages }).
 * `chunksOnDisk` (basenames of every client chunk) and `skipped` (manifests that would not load)
 * come from `readArtifact`; both are optional so the verdict can be table-tested without a tree.
 *
 * @param {{ routes: { route: string, chunks: string[] }[], carriers: { chunk: string, bytes: number, packages: string[] }[],
 *   chunksOnDisk?: string[], skipped?: string[], editorRoutes?: RegExp[] }} input
 * @returns {{ state: 'clean' | 'leak' | 'indeterminate', reason: string, warnings: string[], skipped: number, routesRead: number,
 *   carrierBytes: number, leaks: { route: string, chunk: string, bytes: number, packages: string[] }[],
 *   editor: { route: string, bytes: number, chunks: string[] }[], editorBytes: number,
 *   lazy: { chunks: string[], bytes: number } }}
 */
export function verdict({ routes, carriers, chunksOnDisk, skipped = [], editorRoutes = EDITOR_ROUTES }) {
  const byName = new Map(carriers.map((c) => [c.chunk, c]))
  const carrierBytes = carriers.reduce((s, c) => s + c.bytes, 0)
  const leaks = []
  const editor = []
  const named = new Set()
  const editorChunks = new Set()
  for (const r of routes) {
    const hits = [...new Set(r.chunks)].filter((c) => byName.has(c))
    for (const c of hits) named.add(c)
    if (isEditorRoute(r.route, editorRoutes)) {
      for (const c of hits) editorChunks.add(c)
      editor.push({ route: r.route, bytes: hits.reduce((s, c) => s + byName.get(c).bytes, 0), chunks: hits })
    } else {
      for (const c of hits) leaks.push({ route: r.route, chunk: c, bytes: byName.get(c).bytes, packages: byName.get(c).packages })
    }
  }
  const lazyChunks = carriers.filter((c) => !named.has(c.chunk))
  // Loud, and not a failure: a healthy build can produce either (see the header).
  const warnings = []
  if (skipped.length) {
    warnings.push(`${skipped.length} route manifest(s) would not load and were NOT checked (first: ${skipped[0]})`)
  }
  if (editor.length > 0 && editorChunks.size === 0 && carriers.length > 0) {
    warnings.push('the editor route names no chunk that carries the runtime, so every carrier is lazy: confirm the canvas still loads it')
  }
  const base = {
    warnings,
    skipped: skipped.length,
    routesRead: routes.length,
    carrierBytes,
    leaks,
    editor,
    editorBytes: [...editorChunks].reduce((s, c) => s + byName.get(c).bytes, 0),
    lazy: { chunks: lazyChunks.map((c) => c.chunk), bytes: lazyChunks.reduce((s, c) => s + c.bytes, 0) },
  }
  // A leak is reported before the cannot-look arms: a small fixture that trips one must still prove this one.
  if (leaks.length) {
    const where = new Set(leaks.map((l) => l.route)).size
    return { ...base, state: 'leak', reason: `the CRDT runtime is in a chunk named by ${where} route(s) outside the editor` }
  }
  if (routes.length === 0) return { ...base, state: 'indeterminate', reason: 'read no route manifests, so no route was checked' }
  if (skipped.length > routes.length) {
    return { ...base, state: 'indeterminate', reason: `${skipped.length} route manifests would not load against ${routes.length} read, so the manifest format changed` }
  }
  if (chunksOnDisk) {
    const onDisk = new Set(chunksOnDisk)
    if (!routes.some((r) => r.chunks.some((c) => onDisk.has(c)))) {
      return {
        ...base,
        state: 'indeterminate',
        reason: 'no chunk named by any route manifest is a file under .next/static, so the manifest shape changed and no route was really checked',
      }
    }
  }
  if (carriers.length === 0) {
    return {
      ...base,
      state: 'indeterminate',
      reason: 'found the CRDT runtime in no client chunk at all, but the canvas ships it: the fingerprints or the scan root are wrong',
    }
  }
  if (editor.length === 0) {
    return { ...base, state: 'indeterminate', reason: 'no manifest matched EDITOR_ROUTES, so the editor route moved and the allowlist is stale' }
  }
  return { ...base, state: 'clean', reason: `no route outside the editor names a chunk that carries the CRDT runtime (${routes.length} routes read)` }
}

/**
 * Read a `.next` directory into the lists `verdict` takes. Throws on an unreadable artifact.
 * @param {string} nextDir
 * @returns {{ routes: { route: string, chunks: string[] }[], carriers: { chunk: string, bytes: number, packages: string[] }[],
 *   chunksOnDisk: string[], skipped: string[] }}
 */
export function readArtifact(nextDir) {
  /** @type {{ chunk: string, bytes: number, packages: string[] }[]} */
  const carriers = []
  /** @type {string[]} */
  const chunksOnDisk = []
  for (const rel of globSync('static/**/*.js', { cwd: nextDir })) {
    const file = path.join(nextDir, rel)
    const stat = statSync(file)
    if (!stat.isFile()) continue // a directory that happens to end in .js is not a chunk
    chunksOnDisk.push(path.basename(rel))
    const packages = packagesIn(readFileSync(file, 'utf8'))
    if (packages.length) carriers.push({ chunk: path.basename(rel), bytes: stat.size, packages })
  }

  /** @type {{ route: string, chunks: string[] }[]} */
  const routes = []
  /** @type {string[]} */
  const skipped = []
  const require_ = createRequire(import.meta.url)
  const hadSelf = 'self' in globalThis
  if (!hadSelf) globalThis.self = globalThis // the manifests assign to `self`; give them one outside a browser
  try {
    for (const rel of globSync('server/app/**/*_client-reference-manifest.js', { cwd: nextDir }).sort()) {
      globalThis.__RSC_MANIFEST = {}
      try {
        require_(path.join(nextDir, rel))
      } catch {
        skipped.push(rel) // one route not read. Never silent: the verdict warns, and fails past a floor.
        continue
      }
      const chunks = new Set()
      for (const entry of Object.values(globalThis.__RSC_MANIFEST ?? {})) for (const c of chunkRefs(entry)) chunks.add(c)
      const route = '/' + rel.split(path.sep).join('/').replace(/^server\/app\//, '').replace(/_client-reference-manifest\.js$/, '')
      routes.push({ route, chunks: [...chunks] })
    }
  } finally {
    delete globalThis.__RSC_MANIFEST
    if (!hadSelf) delete globalThis.self
  }
  return { routes, carriers, chunksOnDisk, skipped }
}

const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`

/** The lines to print. The FIRST is the gate line scripts/read-build-log.mjs collects. */
export function report(v, { warnOnly = false } = {}) {
  const mark = v.state === 'clean' ? '✅' : warnOnly ? '⚠️' : '❌'
  const mode = warnOnly ? ' (warn-only, cannot fail this build)' : ''
  const lines = [`${mark} ${NAME} - ${v.state === 'indeterminate' ? 'COULD NOT LOOK: ' : ''}${v.reason}${mode}`]
  for (const w of v.warnings ?? []) lines.push(`   ⚠️ ${w}`)
  lines.push(`   editor routes: ${kb(v.editorBytes)} in ${new Set(v.editor.flatMap((e) => e.chunks)).size} chunk(s) that carry the runtime`)
  for (const e of v.editor) lines.push(`     ${e.route}  ${kb(e.bytes)}`)
  lines.push(`   lazy, named by no route manifest: ${kb(v.lazy.bytes)} in ${v.lazy.chunks.length} chunk(s)`)
  lines.push(`   every chunk that carries it: ${kb(v.carrierBytes)}; routes read: ${v.routesRead}`)
  if (v.leaks.length) {
    lines.push('   routes outside the editor that name a carrier chunk (first 20):')
    for (const l of v.leaks.slice(0, 20)) lines.push(`     ${l.route}  ->  ${l.chunk} (${kb(l.bytes)}; ${l.packages.join(', ')})`)
    if (v.leaks.length > 20) lines.push(`     and ${v.leaks.length - 20} more`)
    lines.push('   Fix the import that pulled it in (move it behind the editor, or behind a dynamic import). Do not widen EDITOR_ROUTES to hide it.')
  }
  if (v.state === 'indeterminate') {
    lines.push('   This is the gate failing to read the artifact, not a finding about it. See docs/RUNBOOKS.md, "Editor bytes in the bundle".')
  }
  return lines
}

function main() {
  const warnOnly = process.argv.includes('--warn-only')
  // Installed before anything can throw. A crash is cannot-look: it fails the build, and warn-only swallows it.
  const crashed = (err) => {
    console.log(`${warnOnly ? '⚠️' : '❌'} ${NAME} - CRASHED before it could report${warnOnly ? ' and is being ignored (warn-only, cannot fail this build)' : ', so nothing was checked'}`)
    console.log(`   ${err?.stack ?? err}`)
    process.exit(warnOnly ? 0 : INDETERMINATE)
  }
  process.on('uncaughtException', crashed)
  process.on('unhandledRejection', crashed)

  const nextDir = path.join(process.cwd(), '.next')
  if (!existsSync(nextDir)) {
    console.log(`${warnOnly ? '⚠️' : '❌'} ${NAME} - no .next/ directory, so nothing was measured. This runs after a build.${warnOnly ? ' (warn-only)' : ''}`)
    process.exit(warnOnly ? 0 : INDETERMINATE)
  }
  const v = verdict(readArtifact(nextDir))
  for (const line of report(v, { warnOnly })) console.log(line)
  if (warnOnly) process.exit(0)
  process.exit(v.state === 'clean' ? 0 : v.state === 'leak' ? 1 : INDETERMINATE)
}

if (invokedDirectly(import.meta.url)) main()
