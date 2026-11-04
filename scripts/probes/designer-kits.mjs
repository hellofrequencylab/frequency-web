#!/usr/bin/env node
// LIVE-1491: the six Designer niche kits are registered, and the /themes page says nine looks.
//
// Fails when a Designer kit leaves the registry loaders or the kit index, when the kit module stops using the
// shared niche words, or when the /themes lede drifts from the nine kits.
import { readFileSync } from 'node:fs'

const r = (f) => readFileSync(f, 'utf8')
const bad = []
const reg = r('lib/sites/kits/registry.ts')
const rows = (reg.match(/theme: 'Designer'/g) ?? []).length
if (rows !== 6) bad.push(`registry.ts lists ${rows} Designer kits, expected 6`)
if (!reg.includes('designer-variants')) bad.push('registry.ts no longer loads designer-variants')
if (!r('lib/sites/kits/designer-variants.ts').includes('NICHE_SPECS')) bad.push('designer-variants.ts stopped using the shared niche words')
if (!r('lib/seo/frequency-pages.ts').includes('Nine looks')) bad.push('the /themes lede no longer says Nine looks')

if (bad.length) {
  console.error(bad.map((b) => `✗ ${b}`).join('\n'))
  process.exit(1)
}
console.log('Designer kits registered; /themes says nine looks.')
