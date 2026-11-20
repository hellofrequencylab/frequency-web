#!/usr/bin/env node
// PERF-032: /about and the five seeker articles (how-to-start-a-circle, how-to-build-community,
// loneliness, friendship-as-an-adult, how-to-be-more-social) render with the platform block set
// (lib/page-editor/platform-config.tsx) and import their own template, never the whole block library
// (lib/page-editor/config.tsx, also reached through templates/index.ts) or a site-kit block. Before, each
// shipped the 183 KB site-kit client chunk to draw none of it. Static import walk, type-only imports skipped.
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..')
const EXTS = ['.tsx', '.ts', '/index.tsx', '/index.ts', '.js', '.mjs']
function resolve(from, spec) {
  let base
  if (spec.startsWith('@/')) base = path.join(ROOT, spec.slice(2))
  else if (spec.startsWith('.')) base = path.resolve(path.dirname(from), spec)
  else return null
  if (fs.existsSync(base) && fs.statSync(base).isFile()) return base
  for (const e of EXTS) if (fs.existsSync(base + e)) return base + e
  return null
}
const cache = new Map()
function deps(f) {
  if (cache.has(f)) return cache.get(f)
  const src = fs.readFileSync(f, 'utf8')
  const out = []
  for (const m of src.matchAll(/^\s*(?:import|export)\s+(?!type\b)[^'"]*?from\s+['"]([^'"]+)['"]/gm)) { const r = resolve(f, m[1]); if (r) out.push(r) }
  for (const m of src.matchAll(/^\s*import\s+['"]([^'"]+)['"]/gm)) { const r = resolve(f, m[1]); if (r) out.push(r) }
  cache.set(f, out)
  return out
}
const KIT = /^components\/page-editor\/blocks\/(wildheart|network|temple|midnight|designer|free-human|services|mindless|new-world|roles)[-./]/
const isTarget = (f) => { const r = path.relative(ROOT, f); return r === 'lib/page-editor/config.tsx' || KIT.test(r) }
const PAGES = ['about', 'how-to-start-a-circle', 'how-to-build-community', 'loneliness', 'friendship-as-an-adult', 'how-to-be-more-social'].map((s) => `app/(marketing)/${s}/page.tsx`)
const bad = []
for (const page of PAGES) {
  const start = path.join(ROOT, page)
  const prev = new Map([[start, null]])
  const q = [start]
  let hit = null
  while (q.length && !hit) {
    const f = q.shift()
    for (const d of deps(f)) {
      if (prev.has(d)) continue
      prev.set(d, f)
      if (isTarget(d)) { hit = d; break }
      q.push(d)
    }
  }
  if (hit) {
    const chain = []
    for (let c = hit; c; c = prev.get(c)) chain.unshift(path.relative(ROOT, c))
    bad.push(chain.join(' -> '))
  }
}
if (bad.length) {
  console.error(`PERF-032 FAIL: ${bad.length} platform page(s) import the whole block library or a site-kit block:\n  ${bad.join('\n  ')}`)
  process.exit(1)
}
// The pages must still render through the platform set, not lose their block body.
const noPlatform = PAGES.filter((p) => !/platformConfig/.test(fs.readFileSync(path.join(ROOT, p), 'utf8')))
if (noPlatform.length) { console.error(`PERF-032 FAIL: no platformConfig render in ${noPlatform.join(', ')}`); process.exit(1) }
console.log(`PERF-032 ok: ${PAGES.length} platform pages render with the platform block set and never import a site kit`)
