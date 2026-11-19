#!/usr/bin/env node
// SCAN-1300: every structured-data image a row supplies is published as an absolute URL.
// Production crawl 2026-11-19: 20 Space pages carried `"image": "/sites/..."` (a kit logo),
// which validators reject and answer engines cannot fetch.
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('../../lib/jsonld.ts', import.meta.url), 'utf8')
const want = [
  ['the absUrl helper', /export const absUrl = \(src: string/],
  ['spaceSchema logo', /space\.logoUrl \? \[absUrl\(space\.logoUrl\)\]/],
  ['personSchema image', /image: absUrl\(p\.image\)/],
  ['siteEntitySchema images', /cleanStrings\(site\.images\)\.map\(\(src\) => absUrl\(src, url\)\)/],
  ['productSchema image', /p\.image \? \[absUrl\(p\.image\)\]/],
  ['housingListingSchema image', /h\.image \? \[absUrl\(h\.image\)\]/],
]
const missing = want.filter(([, re]) => !re.test(src)).map(([n]) => n)
// No builder may pass a row's raw image straight through.
const raw = src.split('\n').map((l, i) => [l, i + 1]).filter(([l]) => /\[\.\.\.\((?:space\.logoUrl|p\.image|h\.image) \? \[(?:space\.logoUrl|p\.image|h\.image)\]/.test(l))
if (missing.length || raw.length) {
  console.error(`SCAN-1300 FAIL: missing ${missing.join(', ') || 'none'}; raw pass-through at line(s) ${raw.map(([, n]) => n).join(', ') || 'none'}`)
  process.exit(1)
}
console.log('SCAN-1300 ok: every row-supplied structured-data image is made absolute')
