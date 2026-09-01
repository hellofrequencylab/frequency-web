#!/usr/bin/env node
// THE CLIENT/SERVER BOUNDARY — no browser bundle may reach the service-role client (LIVE-037).
//
// WHY THIS EXISTS. `lib/supabase/admin.ts` opens Supabase with SUPABASE_SERVICE_ROLE_KEY and
// bypasses RLS entirely. It must never be reachable from a `'use client'` module, because
// everything statically reachable from a client entry point is PARSED IN THE BROWSER whether or
// not it renders. The failure is never a client component calling the admin client on purpose —
// it is a client component importing a CONSTANT out of a module that also opens it, and the whole
// graph following. Eleven separate paths in this repo had exactly that shape: a role ladder, a
// list of tip amounts, a set of listing kinds, a topic vocabulary.
//
// WHY NOT A LIST OF PATHS. The backlog row this closes enumerated ten of them by hand, and its
// probe asserted each named file carried `import 'server-only'`. That probe was wrong twice:
//   · it MISSED an eleventh path (components/spaces/email/composer-shell -> lib/spaces/email-topics
//     -> lib/comms/contact-preferences -> admin), because a hand-kept list only ever knows what
//     was known the day it was written, and
//   · it PRESCRIBED THE WRONG REMEDY for lib/season-ranks.ts, a pure vocabulary module about
//     twenty client components import. Adding `server-only` there would have broken the build;
//     the actual fix was to REMOVE a re-export. A probe that mandates a remedy rather than
//     measuring a consequence will eventually demand the wrong one.
// So this gate measures the consequence: it walks the real import graph and asks whether any
// client entry point can reach the admin client. No baseline, no allowlist, no per-file list —
// it passes or it names the path.
//
// WHAT COUNTS AS A BOUNDARY. Traversal stops at:
//   · `'use server'` files — a Server Action is compiled to a reference stub on the client, so the
//     module's body never enters the browser bundle. Counting these produced 40+ false positives.
//   · `import 'server-only'` files — the module cannot be in a client graph at all; if one ever is,
//     the Next build fails by name. Reaching one FROM a client module is reported separately below.
//   · a DYNAMIC `await import('...')` — this repo's deliberate, documented mitigation. A dynamic
//     import is bundled as a SEPARATE ASYNC CHUNK, so it is not parsed on first load; both
//     lib/layout/page-chrome.ts and lib/apps/overrides.ts say so in the comment above the call
//     ("keeps this server-only dependency out of the module's top level ... stay client-safe").
//     Counting those as leaks reported 47 entry points where 20 were real — a gate that cries wolf
//     earns an allowlist, and then it reads as coverage. Dynamic-only paths are PRINTED as a note
//     and do not fail. The residual they leave is real but different: dead weight in the client
//     build output, never fetched, never eagerly parsed.
//
// WHAT IT ENFORCES:
//   1. NO CLIENT MODULE STATICALLY REACHES THE ADMIN CLIENT, through any chain of ordinary
//      modules. Static reachability is the one that costs every visitor: everything statically
//      reachable from a client entry point is parsed in the browser whether or not it renders.
//   2. NO CLIENT MODULE IMPORTS A `server-only` MODULE. The Next build already fails on this; this
//      gate reports it in a plain sentence in CI, seconds in, instead of inside a build log.
//
// WHAT IT CANNOT SEE, so green here is not "no secret can reach the browser":
//   · RUNTIME reachability. This is a static import graph. A string built at runtime and fed to a
//     dynamic import is invisible, as is anything reached through a barrel re-export chain the
//     resolver below cannot follow (it resolves `@/` and relative paths, .ts/.tsx and /index only).
//   · TYPE-ONLY imports are skipped, because `import type` is erased at compile time and carries
//     no runtime graph. A type-only path to the admin client is not a leak.
//   · OTHER secrets. This gate is about ONE module. A different server-only credential imported
//     into a client component is not in its field of view.
//   · Whether the service-role KEY is set, or whether any of this code runs at all.
//
// Exit codes: 0 clean · 1 a client entry point reaches server-only ground · 79 PROBE_INDETERMINATE
// (the admin client is not where this gate expects it, so "no findings" would be a lie).
//
// Usage: node scripts/check-client-server-boundary.mjs [--probe]

import { readdirSync, readFileSync } from 'node:fs'
import { join, dirname, normalize } from 'node:path'

const ADMIN = 'lib/supabase/admin.ts'
const ROOTS = ['app', 'components', 'lib', 'hooks']
const QUIET = process.argv.includes('--probe')

const say = (...a) => { if (!QUIET) console.log(...a) }

// ── Collect the source set ────────────────────────────────────────────────────────────────
const files = []
function walk(dir) {
  let entries
  try { entries = readdirSync(dir, { withFileTypes: true }) } catch { return }
  for (const e of entries) {
    const p = join(dir, e.name)
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name.startsWith('.')) continue
      walk(p)
    } else if (/\.(ts|tsx)$/.test(p) && !/\.(test|spec)\.[tj]sx?$/.test(p)) {
      files.push(p)
    }
  }
}
// `walk` already swallows ENOENT/ENOTDIR from its own readdirSync, so a stat here only
// asked the filesystem a second question whose answer could differ (ADR-1185).
for (const r of ROOTS) walk(r)

if (!files.includes(ADMIN)) {
  console.error(`PROBE_INDETERMINATE: ${ADMIN} not found. This gate cannot look, so it will not`)
  console.error('report a clean bill of health. If the admin client moved, update ADMIN here.')
  process.exit(79)
}

const src = new Map(files.map((f) => [f, readFileSync(f, 'utf8')]))

// ── Resolve an import specifier to a file in the set ──────────────────────────────────────
function resolve(spec, from) {
  let base
  if (spec.startsWith('@/')) base = spec.slice(2)
  else if (spec.startsWith('.')) base = normalize(join(dirname(from), spec))
  else return null // a package, not our source
  for (const c of [`${base}.ts`, `${base}.tsx`, join(base, 'index.ts'), join(base, 'index.tsx')]) {
    if (src.has(c)) return c
  }
  return null
}

// BOTH import forms, matching scripts/check-admin-client.mjs: a static `from '...'` and the
// dynamic `await import('...')`. A gate you can step around by changing import syntax is not a gate.
const STATIC_RE = /(?:^|\n)\s*(?:import|export)\s[^;]*?from\s*['"]([^'"]+)['"]/g
const BARE_RE = /(?:^|\n)\s*import\s*['"]([^'"]+)['"]/g
const DYNAMIC_RE = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g

// Edges are kept SEPARATE by kind: a static import is eagerly parsed in the browser, a dynamic
// one is a lazily-fetched chunk. Collapsing them is the difference between 20 findings and 47.
function edgesOf(file) {
  const text = src.get(file)
  const staticOut = new Set()
  const dynamicOut = new Set()
  for (const [re, sink] of [[STATIC_RE, staticOut], [BARE_RE, staticOut], [DYNAMIC_RE, dynamicOut]]) {
    re.lastIndex = 0
    let m
    while ((m = re.exec(text))) {
      // `import type { X } from` / `export type { X } from` erase at compile time: no runtime graph.
      if (/^\s*(?:import|export)\s+type\s/.test(m[0])) continue
      const r = resolve(m[1], file)
      if (r) sink.add(r)
    }
  }
  return { staticOut, dynamicOut }
}

const edges = new Map(files.map((f) => [f, edgesOf(f)]))
const deps = new Map(files.map((f) => [f, edges.get(f).staticOut]))
const lazy = new Map(files.map((f) => [f, edges.get(f).dynamicOut]))

const isClient = (f) => /^\s*['"]use client['"]/.test(src.get(f) || '')
const isUseServer = (f) => /^\s*['"]use server['"]/.test(src.get(f) || '')
const isServerOnly = (f) => /(?:^|\n)\s*import\s+['"]server-only['"]/.test(src.get(f) || '')

// ── Walk forward from every client entry point ────────────────────────────────────────────
const reaches = []      // client module -> ... -> admin
const touchesGuard = [] // client module -> a `server-only` module (the build fails on these)

for (const entry of files) {
  if (!isClient(entry)) continue
  const seen = new Set([entry])
  const queue = [[entry, [entry]]]
  while (queue.length) {
    const [cur, path] = queue.shift()
    for (const next of deps.get(cur) || []) {
      if (seen.has(next)) continue
      seen.add(next)
      const trail = [...path, next]
      if (next === ADMIN) { reaches.push(trail); continue }
      if (isUseServer(next)) continue          // Server Action: stub on the client
      if (isServerOnly(next)) { touchesGuard.push(trail); continue }
      queue.push([next, trail])
    }
  }
}

// ── Report ────────────────────────────────────────────────────────────────────────────────
const fmt = (trail) => trail.join('\n       -> ')

if (reaches.length || touchesGuard.length) {
  // Shortest path first: the shortest chain is usually the one to cut.
  reaches.sort((a, b) => a.length - b.length)
  touchesGuard.sort((a, b) => a.length - b.length)

  if (reaches.length) {
    console.error(`\n${reaches.length} client entry point(s) reach the service-role client (${ADMIN}):\n`)
    for (const t of reaches) console.error(`  ${fmt(t)}\n`)
  }
  if (touchesGuard.length) {
    console.error(`\n${touchesGuard.length} client entry point(s) import a \`server-only\` module (the build fails on these):\n`)
    for (const t of touchesGuard) console.error(`  ${fmt(t)}\n`)
  }
  console.error('THE FIX is not to delete the import: extract the leaf the client actually needs into a')
  console.error('dependency-free module, re-export it from the old home so no server caller changes, and')
  console.error("leave `import 'server-only'` on the original. See lib/spaces/membership-core.ts.")
  process.exit(1)
}

// A dynamic edge into the admin client, from a module a client entry point can reach. Not a
// failure (separate chunk, never eagerly parsed) — printed so the mitigation stays VISIBLE and
// nobody mistakes this gate for proof the module is absent from the client build entirely.
const lazyHolders = files.filter((f) => (lazy.get(f) || new Set()).has(ADMIN))
if (lazyHolders.length) {
  say(`  note: ${lazyHolders.length} module(s) reach it through a DYNAMIC import (separate chunk, not`)
  say('        eagerly parsed, so not a finding): ' + lazyHolders.join(', '))
}

const clientCount = files.filter(isClient).length
say(`✓ client/server boundary: ${clientCount} client entry points, none reach ${ADMIN}.`)
say(`  (${files.length} modules walked across ${ROOTS.join(', ')}.)`)
process.exit(0)
