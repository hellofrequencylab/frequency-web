#!/usr/bin/env node
// LIVE-1300: Royal Temple's Home is the design's own page, built from registered Temple blocks in the design's order.
//
// Fails when a Temple block leaves the registry, the website palette or the planner's own-render list, when the
// Home blocks leave the design's order, when the Temple template stops opening on them, when the skin carries a raw
// color, or when the page stops loading the recurring series the week and cards read.
import { readFileSync } from 'node:fs'

const r = (f) => readFileSync(f, 'utf8')
const bad = []
const TYPES = ['TempleHero', 'TempleEvents', 'TempleWeek', 'TempleTiers', 'TempleSeasons', 'TempleRetreat', 'TempleFAQ', 'TempleFollow']

const blocks = r('components/page-editor/blocks/temple.tsx')
for (const t of TYPES) if (!new RegExp(`\\b${t}:\\s*block\\(`).test(blocks)) bad.push(`${t} is not a registered block`)
if (!r('lib/page-editor/config.tsx').includes('...templeComponents')) bad.push('the Temple blocks are not in the editor config')
if (!r('lib/page-editor/palette-scope.ts').includes("'temple'")) bad.push('the temple category is not on the website palette')
if (!r('lib/sites/menswork-page.ts').includes("type.startsWith('Temple')")) bad.push('the planner does not draw Temple blocks as their own render')

const home = r('lib/sites/temple-home.ts')
const at = TYPES.map((t) => home.indexOf(`type: '${t}'`))
if (at.some((i) => i < 0) || at.some((v, i) => i && v < at[i - 1])) bad.push('the Home blocks are not the design order')
if (!r('lib/sites/editor/templates.ts').includes('templeHomeBlocks()')) bad.push('the Temple template does not open on the design Home')

const css = r('components/sites/temple-blocks-css.ts')
if (/#[0-9a-fA-F]{3,8}\b/.test(css.replace(/\[data-[^\]]*\]/g, '')) || /rgba?\(/.test(css)) bad.push('temple-blocks-css.ts carries a raw color')
if (!r('components/sites/temple-css.ts').includes('TEMPLE_BLOCKS_CSS')) bad.push('the Temple skin does not include the block sheet')

if (!/getSpaceSeriesRows/.test(r('components/sites/site-page.tsx'))) bad.push('the site page does not load the series rows')
if (!r('scripts/seed-temple-home.mts').includes('space_private_state')) bad.push('the Home seed is gone')

if (bad.length) {
  console.error('LIVE-1300: ' + bad.join('; '))
  process.exit(1)
}
console.log('LIVE-1300: the Temple Home blocks are registered, ordered, tokened and fed live events.')
