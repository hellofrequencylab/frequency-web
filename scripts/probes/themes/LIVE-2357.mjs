#!/usr/bin/env node
// LIVE-2357 probe: Bold, Wildheart and Nocturne each register the six shared house Spotlight layouts, the public Spotlight draws
// them, and a Space on one of them wears a layout only once its owner picks a look (Blocks stays the default).
import { readFileSync } from 'node:fs'
const read = (f) => readFileSync(new URL(`../../../${f}`, import.meta.url), 'utf8')
const fail = (m) => { console.error(`LIVE-2357: ${m}`); process.exit(1) }
const layouts = read('lib/spotlight/layouts.ts')
for (const [t, p] of [['bold', 'bold-kit'], ['wildheart', 'wildheart-kit'], ['midnight', 'nocturne-kit']]) {
  if (!new RegExp(`${t}: LAYOUT_BLURBS\\.map\\(\\(\\[n, label, blurb\\]\\) => \\(\\{ id: \`${p}:\\$\\{n\\}\``).test(layouts)) fail(`${t} registers no ${p} layouts`)
}
if (!/HOUSE_KIT_OPT_IN[^\n]*'bold', 'wildheart', 'midnight'/.test(layouts)) fail('the house themes are not opt-in for Spaces')
if (!/isHouseKitLayout\(theme\.layout\)/.test(read('components/spotlight/spotlight-shell.tsx'))) fail('the public Spotlight does not draw the house layouts')
if (!/HOUSE_KIT_OPT_IN\.has\(theme\)/.test(read('components/spotlight/themed-space-spotlight.tsx'))) fail('a Space on a house theme is moved without its owner picking a look')
if (!/look: 'blocks'/.test(read('app/(main)/spaces/[slug]/manage/spotlight/page.tsx'))) fail('the Look picker has no Blocks choice for the house themes')
const css = read('components/spotlight/house-kit-layouts-css.ts')
if (/#[0-9a-fA-F]{3,8}\b|\brgba?\(/.test(css)) fail('the house layout sheet carries a literal colour')
console.log('LIVE-2357: Bold, Wildheart and Nocturne wear the six house Spotlight layouts, opt-in for Spaces')
