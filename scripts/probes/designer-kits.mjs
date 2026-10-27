#!/usr/bin/env node
// LIVE-1491: the six Designer niche kits are registered, and the /themes gallery says seven looks.
//
// Fails when a Designer kit leaves the registry loaders or the kit index, when the kit module stops using the
// shared niche words, or when the gallery lede drifts from the seven mega themes.
import { readFileSync } from 'node:fs'

const r = (f) => readFileSync(f, 'utf8')
const bad = []
const reg = r('lib/sites/kits/registry.ts')
const rows = (reg.match(/theme: 'Designer'/g) ?? []).length
if (rows !== 6) bad.push(`registry.ts lists ${rows} Designer kits, expected 6`)
if (!reg.includes('designer-variants')) bad.push('registry.ts no longer loads designer-variants')
if (!r('lib/sites/kits/designer-variants.ts').includes('NICHE_SPECS')) bad.push('designer-variants.ts stopped using the shared niche words')
if (!r('components/frequency/site/pages/themes/frequency-themes.tsx').includes('Seven looks')) bad.push('the /themes gallery lede no longer says Seven looks')

if (bad.length) {
  console.error(bad.map((b) => `✗ ${b}`).join('\n'))
  process.exit(1)
}
console.log('Designer kits registered; gallery says seven looks.')
