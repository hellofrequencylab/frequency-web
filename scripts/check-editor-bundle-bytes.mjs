#!/usr/bin/env node
// EDITOR BYTES IN THE BUILT BUNDLE: the bundle-byte instrument (PROG-E0 task 18, PROG-E0B).
//
// E0's CRDT gate is "zero editor bytes public". scripts/check-editor-crdt-importers.mjs pins the
// SOURCE entry point (who may import yjs). It cannot see what the compiler did with those imports.
// This reads the artifact: which built client chunks carry the CRDT runtime, which routes name
// those chunks, and how many bytes that is.
//
// ADVISORY, AND THAT IS THE WHOLE CONTRACT TODAY. It has never read a real artifact (this box
// cannot build), and a build-blocking gate that has never seen a real artifact is the 2026-08-11
// incident with the roles reversed (docs/DEPLOY-SAFETY.md). So by default it measures, prints one
// gate line, and exits 0 on every arm: a leak, a missing `.next`, an unreadable manifest, its own
// crash. `--strict` is the on-demand and future-blocking spelling (leak exits 1, cannot-look exits
// 79). Arming it in `postbuild` needs one real reading first; the pin that makes that a reviewable
// diff is the last test in scripts/check-editor-bundle-bytes.test.ts.
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
//   - `clientModules[*].chunks` has not been confirmed against a Turbopack artifact. Chunk names
//     are matched by basename so either a bare path or a `/_next/` URL resolves; if the shape is
//     something else the editor route reads as 0 bytes and the carriers all read as lazy, which
//     the first real log will show.
//
// Usage: node scripts/check-editor-bundle-bytes.mjs [--strict]

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
 *
 * @returns {{ state: 'clean' | 'leak' | 'indeterminate', reason: string, routesRead: number,
 *   carrierBytes: number, leaks: { route: string, chunk: string, bytes: number, packages: string[] }[],
 *   editor: { route: string, bytes: number, chunks: string[] }[], editorBytes: number,
 *   lazy: { chunks: string[], bytes: number } }}
 */
export function verdict({ routes, carriers, editorRoutes = EDITOR_ROUTES }) {
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
  const base = {
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

/** Read a `.next` directory into the two lists `verdict` takes. Throws on an unreadable artifact. */
export function readArtifact(nextDir) {
  const carriers = []
  for (const rel of globSync('static/**/*.js', { cwd: nextDir })) {
    const file = path.join(nextDir, rel)
    const packages = packagesIn(readFileSync(file, 'utf8'))
    if (packages.length) carriers.push({ chunk: path.basename(rel), bytes: statSync(file).size, packages })
  }

  const routes = []
  const require_ = createRequire(import.meta.url)
  const hadSelf = 'self' in globalThis
  if (!hadSelf) globalThis.self = globalThis // the manifests assign to `self`; give them one outside a browser
  try {
    for (const rel of globSync('server/app/**/*_client-reference-manifest.js', { cwd: nextDir }).sort()) {
      globalThis.__RSC_MANIFEST = {}
      try {
        require_(path.join(nextDir, rel))
      } catch {
        continue // one unreadable manifest is one route not read; the count printed says how many were
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
  return { routes, carriers }
}

const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`

/** The lines to print. The FIRST is the gate line scripts/read-build-log.mjs collects. */
export function report(v, { strict = false } = {}) {
  const mark = v.state === 'clean' ? '✅' : strict && v.state === 'leak' ? '❌' : '⚠️'
  const mode = strict ? '' : ' (advisory, cannot fail this build)'
  const lines = [`${mark} ${NAME} - ${v.reason}${mode}`]
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
  return lines
}

function main() {
  const strict = process.argv.includes('--strict')
  // Installed before anything can throw. Advisory means no exit path is non-zero, a crash included.
  const crashed = (err) => {
    console.log(`⚠️ ${NAME} - CRASHED before it could report${strict ? '' : ' and is being ignored (advisory, cannot fail this build)'}`)
    console.log(`   ${err?.stack ?? err}`)
    process.exit(strict ? INDETERMINATE : 0)
  }
  process.on('uncaughtException', crashed)
  process.on('unhandledRejection', crashed)

  const nextDir = path.join(process.cwd(), '.next')
  if (!existsSync(nextDir)) {
    console.log(`⚠️ ${NAME} - no .next/ directory, so nothing was measured${strict ? '' : ' (advisory)'}`)
    process.exit(strict ? INDETERMINATE : 0)
  }
  const v = verdict(readArtifact(nextDir))
  for (const line of report(v, { strict })) console.log(line)
  if (!strict) process.exit(0)
  process.exit(v.state === 'clean' ? 0 : v.state === 'leak' ? 1 : INDETERMINATE)
}

if (invokedDirectly(import.meta.url)) main()
