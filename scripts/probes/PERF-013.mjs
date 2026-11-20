#!/usr/bin/env node
// PERF-013: a signed-out public page does not download the Space theme-kit code or the browser database
// client it never uses.
//
// Arm A (static walk, type-only imports skipped, `'use server'` modules not followed below a client
// boundary because their imports never reach the browser): from the root layout, the three public
// layouts and the public pages below, nothing reaches the whole block library or a site-kit block, and
// nothing under a 'use client' boundary statically reaches @supabase/* or lib/supabase/client.
//
// Arm B: the support chat launcher (mounted by the (marketing), (help) and discover layouts) warms its
// panel chunk, which carries supabase-js, on intent (pointer, focus, touch), never on idle or a timer.
// Before, the idle warm downloaded the client on every public visit (Lighthouse 2026-11-19: 94 to 96%
// unused on every template).
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..')
const EXTS = ['.tsx', '.ts', '/index.tsx', '/index.ts', '.js', '.mjs']
function resolve(from, spec) {
  let base
  if (spec.startsWith('@/')) base = path.join(ROOT, spec.slice(2))
  else if (spec.startsWith('.')) base = path.resolve(path.dirname(from), spec)
  else return `npm:${spec}`
  if (fs.existsSync(base) && fs.statSync(base).isFile()) return base
  for (const e of EXTS) if (fs.existsSync(base + e)) return base + e
  return null
}
const info = new Map()
function get(f) {
  if (info.has(f)) return info.get(f)
  if (f.startsWith('npm:')) {
    const r = { deps: [], client: false, server: false }
    info.set(f, r)
    return r
  }
  const src = fs.readFileSync(f, 'utf8')
  const head = src.slice(0, 600)
  const deps = []
  for (const m of src.matchAll(/^\s*(?:import|export)\s+(?!type\b)[^'"]*?from\s+['"]([^'"]+)['"]/gm)) { const r = resolve(f, m[1]); if (r) deps.push(r) }
  for (const m of src.matchAll(/^\s*import\s+['"]([^'"]+)['"]/gm)) { const r = resolve(f, m[1]); if (r) deps.push(r) }
  const r = { deps, client: /^\s*['"]use client['"]/m.test(head), server: /^\s*['"]use server['"]/m.test(head) }
  info.set(f, r)
  return r
}
const rel = (f) => (f.startsWith('npm:') ? f : path.relative(ROOT, f))
const KIT = /^(lib\/page-editor\/config\.tsx|components\/page-editor\/blocks\/(wildheart|network|temple|midnight|designer|free-human|services|mindless|new-world|roles)[-./])/
const DB_CLIENT = /^(npm:@supabase\/|lib\/supabase\/client\.ts$)/

const STARTS = [
  'app/layout.tsx',
  'app/(marketing)/layout.tsx',
  'app/(help)/layout.tsx',
  'app/discover/layout.tsx',
  'app/page.tsx',
  'app/(marketing)/pricing/page.tsx',
  'app/(marketing)/the-community/page.tsx',
  'app/(marketing)/about/page.tsx',
  'app/(marketing)/north-county-san-diego/page.tsx',
  'app/(marketing)/create-a-space/page.tsx',
  'app/(marketing)/for/page.tsx',
  'app/discover/page.tsx',
  'app/discover/cities/[citySlug]/page.tsx',
]

const fails = []
for (const s of STARTS) {
  const start = path.join(ROOT, s)
  if (!fs.existsSync(start)) { fails.push(`${s}: missing (update the probe's page list)`); continue }
  const prev = new Map([[`${start}|0`, null]])
  const q = [[start, false]]
  let hit = null
  while (q.length && !hit) {
    const [f, cl] = q.shift()
    const fi = get(f)
    const c = cl || fi.client
    if (c && fi.server) continue
    for (const d of fi.deps) {
      const dc = c || get(d).client
      const key = `${d}|${dc ? 1 : 0}`
      if (prev.has(key)) continue
      prev.set(key, `${f}|${c ? 1 : 0}`)
      const r = rel(d)
      if (KIT.test(r) || (dc && DB_CLIENT.test(r))) { hit = key; break }
      q.push([d, c])
    }
  }
  if (hit) {
    const chain = []
    for (let k = hit; k; k = prev.get(k)) chain.unshift(rel(k.split('|')[0]))
    fails.push(`${s}: ${chain.join(' -> ')}`)
  }
}

const launcher = fs.readFileSync(path.join(ROOT, 'components/chat/support-chat-launcher.tsx'), 'utf8')
if (/requestIdleCallback|setTimeout\([^)]*loadPanel/.test(launcher)) fails.push('support-chat-launcher still warms the panel (and supabase-js) on idle or a timer')
for (const ev of ['onPointerEnter', 'onFocus']) if (!new RegExp(`${ev}=\\{warm\\}`).test(launcher)) fails.push(`support-chat-launcher does not warm the panel on ${ev}`)
if (!/const warm = \(\) => void loadPanel\(\)/.test(launcher)) fails.push('support-chat-launcher has no intent warm that loads the panel')

if (fails.length) {
  console.error(`PERF-013 FAIL:\n  ${fails.join('\n  ')}`)
  process.exit(1)
}
console.log(`PERF-013 ok: ${STARTS.length} public entry points reach no site-kit code and no browser database client; the chat panel warms on intent only`)
