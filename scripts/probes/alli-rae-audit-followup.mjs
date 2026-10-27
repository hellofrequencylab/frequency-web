#!/usr/bin/env node
// LIVE-1498: the follow-up to the Alli Rae audit (LIVE-1497): the phone sheet carries the design's section labels and
// contact block, the Designer header collapses at the design's 900px (not the house's 940), the body link is the design's
// terracotta underline, all scoped to the Designer skin, and the source's typos stay corrected.
import { readFileSync } from 'node:fs'

const r = (f) => readFileSync(f, 'utf8')
const bad = []
const need = (file, needles) => {
  const s = r(file)
  for (const n of needles) if (!s.includes(n)) bad.push(`${file} lost ${n}`)
}
need('components/sites/house-menu.tsx', ['data-menu-group', 'data-menu-foot'])
need('components/sites/house-header.tsx', ['menuFoot', 'group: l.label'])
need('components/sites/designer-chrome.tsx', ['phoneMenuFoot'])
need('components/sites/designer-css.ts', ['const BP = 900', '[data-menu-group]', '[data-menu-foot]', '--dz-link-hover'])
need('lib/theme/designer.ts', ['--dz-link:', '--dz-link-weight'])
const css = r('components/sites/designer-css.ts')
if (/max-width:939px|min-width:940px/.test(css)) bad.push('designer-css.ts still breaks the header at the house 940')
const site = r('lib/sites/alli-rae-site.ts')
for (const typo of ['Design-First-Thinking', 'Kindy fill out', 'your in the process', 'have have', 'Ground- Up', "it's oversized"]) {
  if (site.includes(typo)) bad.push(`alli-rae-site.ts carries the typo "${typo}"`)
}

if (bad.length) {
  console.error(bad.map((b) => `✗ ${b}`).join('\n'))
  process.exit(1)
}
console.log('Alli Rae follow-up details are in place.')
