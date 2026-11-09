#!/usr/bin/env node
// LIVE-1491: the six Designer niche kits are registered, and the /themes page says how many looks there are.
//
// Fails when a Designer kit leaves the registry loaders or the kit index, when the kit module stops using the
// shared niche words, or when the /themes lede stops naming its count of kits.
import { readFileSync } from 'node:fs'

const r = (f) => readFileSync(f, 'utf8')
const bad = []
const reg = r('lib/sites/kits/registry.ts')
const rows = (reg.match(/theme: 'Designer'/g) ?? []).length
if (rows !== 6) bad.push(`registry.ts lists ${rows} Designer kits, expected 6`)
if (!reg.includes('designer-variants')) bad.push('registry.ts no longer loads designer-variants')
if (!r('lib/sites/kits/designer-variants.ts').includes('NICHE_SPECS')) bad.push('designer-variants.ts stopped using the shared niche words')
// The count moves each time a theme is offered (owner's phrase 2026-11-04 13:44Z: "rewrite probe LIVE-1491: any count"): the lede must
// still say how many looks there are, whatever the number.
if (!/\b[A-Z][a-z]+ looks for your website/.test(r('lib/seo/frequency-pages.ts'))) bad.push('the /themes lede no longer says how many looks there are')

if (bad.length) {
  console.error(bad.map((b) => `✗ ${b}`).join('\n'))
  process.exit(1)
}
console.log('Designer kits registered; /themes names its count of looks.')
