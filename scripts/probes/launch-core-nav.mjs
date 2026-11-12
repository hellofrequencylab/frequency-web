#!/usr/bin/env node
// LIVE-2266: the launch core nav. Store, Housing, Classifieds and the Vault are held until
// after launch (Daniel, 2026-11-11): out of the member footer, off the rail, and /marketplace opens on Market.
// Reads the source rather than spawning a test runner (a probe must not, LIVE-034).
import { readFileSync } from 'node:fs'
const bad = []
const reg = readFileSync('lib/nav/registry.ts', 'utf8')
for (const href of ['/classifieds', '/housing', '/store', '/crew/store']) {
  if (new RegExp(`id: '[a-z-]+', label: '[^']+', href: '${href}'`).test(reg)) bad.push(`footer still links ${href}`)
}
const need = [
  ['lib/verticals/housing.ts', "surface: 'housing'"],
  ['lib/verticals/shop.ts', "surface: 'shop'"],
  ['lib/nav-areas.ts', "surface: 'vault'"],
  ['lib/nav-areas.ts', "surface: 'quest'"],
  ['lib/nav-areas.ts', "surface: 'journeys'"],
]
for (const [f, anchor] of need) {
  const s = readFileSync(f, 'utf8')
  const i = s.indexOf(anchor)
  if (i < 0 || !/railHidden: true/.test(s.slice(i, i + 80))) bad.push(`${f} does not hide its rail row`)
}
if (!/held \? 'market'/.test(readFileSync('app/(main)/marketplace/page.tsx', 'utf8'))) bad.push('/marketplace does not open on Market')
if (bad.length) {
  console.error(bad.join('\n'))
  process.exit(1)
}
console.log('launch core nav holds the Store, Housing, Classifieds and Vault')
