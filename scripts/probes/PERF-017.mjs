#!/usr/bin/env node
// PERF-017: the Spaces directory on a phone (owner, 2026-11-19: "The Spaces page takes a long time to load on mobile").
// Every card drew its photo as a CSS background, which a browser fetches for every card at once, and a Space with no
// cover fell back to a 200 to 430 KB brand photo. The consequences: card photos are lazy <img> elements, and the
// no-cover fallback is a 640px copy of at most 100 KB.
import assert from 'node:assert/strict'
import { existsSync, readFileSync, statSync } from 'node:fs'

const read = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : '')
const body = read('components/frequency/members/spaces/spaces-body.tsx')
const tile = body.slice(body.indexOf('function SpaceTile'), body.indexOf('export function FqSpacesBody'))
assert.ok(tile.length > 0, 'the Spaces tile is gone, so this probe looks at nothing')
assert.ok(!/backgroundImage/.test(tile), 'a Space card still draws its photo as a CSS background, fetched for every card at once')
assert.ok(/<img className="fqm-ph-img" src=\{art\} alt="" loading="lazy" decoding="async" \/>/.test(tile), 'a Space card photo is not a lazy image')
assert.ok(/fqPlaceholderCardArt\(s\.slug\)/.test(tile), 'a Space with no cover still falls back to the full-size brand photo')
assert.ok(/\.fqm-card>\.ph>\.fqm-ph-img\{position:absolute;inset:0;width:100%;height:100%;object-fit:cover/.test(read('app/themes/frequency/members-b.css')), 'the card photo has no cover styling')

const art = read('lib/frequency/placeholder-art.ts')
const photos = [...art.slice(art.indexOf('const PHOTOS'), art.indexOf('] as const')).matchAll(/'([a-z0-9-]+\.jpg)'/g)].map((m) => m[1])
assert.ok(photos.length >= 10, `read only ${photos.length} placeholder photos, so this check did not look`)
const heavy = photos.filter((f) => {
  const p = `public/brand/frequency/photos/sm/${f}`
  return !existsSync(p) || statSync(p).size > 100_000
})
assert.equal(heavy.length, 0, `placeholder photos with no 640px copy under 100 KB: ${heavy.join(', ')}`)
console.log(`PERF-017: Space cards load lazily, and all ${photos.length} fallback photos have a small copy`)
