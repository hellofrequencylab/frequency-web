#!/usr/bin/env node
// LIVE-1792: the Network and Designer Theme Kit pages open and run like Nocturne's: the theme's name large with the buttons
// left and the preview right, the four surfaces joined by a dotted line, then Nocturne's sections in Nocturne's order.
// Fails on main (headline "Design it once", no joined surfaces, no Inside the kit, Thirteen kits, Built right or Setup).
import { readFileSync } from 'node:fs'

const bad = []
for (const [file, p] of [
  ['components/frequency/site/pages/themes/frequency-network.tsx', 'nf'],
  ['components/frequency/site/pages/themes/frequency-designer.tsx', 'df'],
]) {
  const s = readFileSync(file, 'utf8')
  for (const need of [`${p}-name`, `${p}-aft`, `${p}-cascade`, `${p}-thread`, 'id="inside"', 'id="kits"', 'id="built"', 'id="steps"']) {
    if (!s.includes(need)) bad.push(`${file} has no ${need}`)
  }
}
if (bad.length) {
  console.error(bad.join('\n'))
  process.exit(1)
}
console.log('theme-pages-nocturne-layout: ok')
