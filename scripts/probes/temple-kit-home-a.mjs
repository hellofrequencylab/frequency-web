#!/usr/bin/env node
// LIVE-1682: the Temple Kit Home, first half. Six registered blocks (hero, live band, gatherings, rooms, offerings,
// steps) in the Temple Kit family, a block sheet with no raw colour in the Temple Kit skin, the design's sample house
// copy with its photo map, and the planner drawing them as the page's own sections.
//
// Fails when a block leaves the family or the editor config, when the sheet carries a raw colour or leaves the skin,
// when the palette loses the templeKit category, when the planner stops leading with the Temple Kit hero, or when the
// older Temple family is edited to hold a Temple Kit block. Run on main it fails: none of it exists.
import { existsSync, readFileSync } from 'node:fs'

const r = (f) => (existsSync(f) ? readFileSync(f, 'utf8') : '')
const bad = []
const TYPES = ['TempleKitHero', 'TempleKitLive', 'TempleKitGatherings', 'TempleKitRooms', 'TempleKitOfferings', 'TempleKitSteps']

const blocks = r('components/page-editor/blocks/temple-kit.tsx')
for (const t of TYPES) if (!new RegExp(`\\b${t}:\\s*block\\(`).test(blocks)) bad.push(`${t} is not a registered block`)
const sheet = r('components/sites/temple-kit-blocks-css.ts')
if (!sheet.includes('TEMPLE_KIT_BLOCKS_CSS')) bad.push('the block sheet is missing')
if (/#[0-9a-fA-F]{3,8}\b|rgba?\(/.test(sheet.replace(/\[data-[^\]]*\]/g, ''))) bad.push('temple-kit-blocks-css.ts carries a raw color')
if (!r('components/sites/temple-kit-css.ts').includes('TEMPLE_KIT_BLOCKS_CSS')) bad.push('the Temple Kit skin does not include the block sheet')
if (!r('lib/page-editor/config.tsx').includes('...templeKitComponents')) bad.push('the Temple Kit blocks are not in the editor config')
if (!r('lib/page-editor/palette-scope.ts').includes("'templeKit'")) bad.push('the templeKit category is not on the website palette')
if (!/TempleKitHero/.test(r('lib/sites/menswork-page.ts'))) bad.push('the planner does not lead with the Temple Kit hero')
if (!r('lib/sites/editor/templates.ts').includes('templeKitHomeBlocks()')) bad.push('the TempleKit template does not open on the design Home')
const home = r('lib/sites/temple-kit-home.ts')
if (!home.includes('TEMPLE_KIT_IMG_MAP') || !home.includes('/sites/temple-kit/photos')) bad.push('the photo map is missing')
if (/TempleKit/.test(r('components/page-editor/blocks/temple.tsx')) || /TempleKit/.test(r('lib/sites/temple-home.ts'))) bad.push('the older Temple family was edited')

if (bad.length) {
  console.error('LIVE-1682: ' + bad.join('; '))
  process.exit(1)
}
console.log('temple-kit-home-a: six blocks registered, sheet tokened, planned as own sections')
