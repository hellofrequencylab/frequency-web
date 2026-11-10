#!/usr/bin/env node
// EDITOR BYTES ON THE PUBLIC RENDER — the import-site ratchet (PROG-E0 task 18,
// docs/EDITOR-ARCHITECTURE.md §7.3 and the "Multiplayer ⇄ the render path" row).
//
// A visitor must not pay one kilobyte for multiplayer editing. That regression arrives through an
// innocent shared import, not a decision. This gate pins the ENTRY POINT of that regression: the
// only modules that may import the CRDT runtime (`yjs`, `y-*`) or anything under
// `lib/editor-crdt/` are `lib/editor-crdt/` itself and the files named, one per line, in
// scripts/editor-crdt-importers.txt (editor-only modules; empty today). A new importer fails here
// by name, so adding one is a reviewable line in a diff that says why it is editor-only.
//
// WHAT IT PROVES: no module outside the allowlist imports the CRDT runtime or lib/editor-crdt/
// (static, dynamic and `export ... from` forms; type-only imports are erased and skipped).
// WHAT IT CANNOT SEE: that an ALLOWLISTED file is itself unreachable from a public route, and
// bytes as measured in a built bundle (the "bundle-byte instrument" E0 still owes: a bundle
// analyzer over the Vercel build). Green here is a necessary condition, not the whole claim.
//
// Non-triviality (ADR-962): it must find lib/editor-crdt/node-ydoc.ts and see `yjs` imported
// inside lib/editor-crdt/, or it exits 79 rather than print a ✓ over nothing.
//
// Usage: node scripts/check-editor-crdt-importers.mjs

import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const ROOTS = ['app', 'components', 'lib']
const HOME = 'lib/editor-crdt/'
const ALLOWLIST = 'scripts/editor-crdt-importers.txt'
const MIN_FILES = 3500
const CRDT = /^(yjs|y-[a-z0-9-]+|lib0(\/.*)?|(@\/|(\.\.?\/)+)(lib\/)?(editor-crdt)(\/.*)?)$/

const files = []
function walk(dir) {
  let entries
  try { entries = readdirSync(dir, { withFileTypes: true }) } catch { return }
  for (const e of entries) {
    const p = join(dir, e.name)
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name.startsWith('.')) continue
      walk(p)
    } else if (/\.(ts|tsx|mjs|js)$/.test(p) && !/\.(test|spec)\.[tj]sx?$/.test(p)) files.push(p)
  }
}
for (const r of ROOTS) walk(r)

const allowed = new Set(
  existsSync(ALLOWLIST)
    ? readFileSync(ALLOWLIST, 'utf8').split('\n').map((l) => l.replace(/#.*/, '').trim()).filter(Boolean)
    : [],
)

// static `import x from 'm'` / `export * from 'm'` (not `import type`), and `import('m')`.
const STATIC = /(?:^|[;\n])\s*(?:import|export)\s+(?!type\b)[^'"`;]*?from\s*['"]([^'"]+)['"]|(?:^|[;\n])\s*import\s*['"]([^'"]+)['"]|\bimport\(\s*['"]([^'"]+)['"]\s*\)/g

function importsOf(text) {
  const out = []
  for (const m of text.matchAll(STATIC)) out.push(m[1] ?? m[2] ?? m[3])
  return out
}

let sawHome = false
let sawYjsInHome = false
const offenders = []
for (const f of files) {
  const specs = importsOf(readFileSync(f, 'utf8'))
  const hits = specs.filter((s) => CRDT.test(s) || s.includes('editor-crdt'))
  if (f.startsWith(HOME)) {
    sawHome = true
    if (specs.includes('yjs')) sawYjsInHome = true
    continue
  }
  if (hits.length && !allowed.has(f)) offenders.push([f, hits])
}

// Report a leak BEFORE the floors: a small fixture that trips a floor must still prove the arm.
if (offenders.length) {
  console.error('✗ editor-crdt importers: the CRDT runtime is imported outside lib/editor-crdt/ and outside the allowlist.')
  for (const [f, h] of offenders) console.error(`  ${f}  ->  ${h.join(', ')}`)
  console.error(`\nEverything a module imports is parsed by whoever loads it. If this file is editor-only, add it to ${ALLOWLIST}`)
  console.error('with a comment saying why no visitor bundle reaches it. If it is shared, move the import behind the editor.')
  process.exit(1)
}
if (!sawHome || !sawYjsInHome || files.length < MIN_FILES) {
  console.error(`PROBE_INDETERMINATE: walked ${files.length} file(s); lib/editor-crdt found: ${sawHome}; yjs seen there: ${sawYjsInHome}.`)
  console.error('This gate cannot look, so it will not report a clean bill of health.')
  process.exit(79)
}

console.log(`✓ editor-crdt importers: ${files.length} modules walked, nothing outside lib/editor-crdt/ (and ${allowed.size} allowlisted) imports the CRDT runtime.`)
