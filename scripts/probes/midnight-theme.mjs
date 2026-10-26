#!/usr/bin/env node
// LIVE-1365 (ADR-1885): Midnight is a registered, fully tokened site theme carrying the design's 13 blocks.
//
// Fails when 'midnight' leaves the site theme registry or the editor theme list, when the contract loses its
// entry, when a skin or block sheet carries a raw color, when the faces are loaded from the root layout, when a
// design block leaves the registry or the website palette, or when the Spotlight preset leaves the token set.
import { readFileSync } from 'node:fs'

const r = (f) => readFileSync(f, 'utf8')
const bad = []
const TYPES = ['MidnightHero', 'MidnightLive', 'MidnightDoors', 'MidnightOfferings', 'MidnightJourneys', 'MidnightGatherings', 'MidnightMembership', 'MidnightProof', 'MidnightShop', 'MidnightLibrary', 'MidnightLetter', 'MidnightFAQ', 'MidnightCTA']

const style = r('lib/theme/site-style.ts')
if (!style.includes("id: 'midnight'") || !style.includes("| 'midnight'")) bad.push('midnight is not in the site theme registry')
if (!r('lib/sites/editor/state.ts').includes("'Midnight'")) bad.push('Midnight is not in the editor theme list')
if (!r('lib/sites/editor/theme-contract.json').includes('"Midnight"')) bad.push('theme-contract.json has no Midnight entry')

const raw = (s) => /#[0-9a-fA-F]{3,8}\b/.test(s.replace(/\[data-[^\]]*\]/g, '')) || /rgba?\(/.test(s)
for (const f of ['components/sites/midnight-css.ts', 'components/sites/midnight-blocks-css.ts']) if (raw(r(f))) bad.push(`${f} carries a raw color`)
if (!r('components/sites/midnight-css.ts').includes('MIDNIGHT_BLOCKS_CSS')) bad.push('the Midnight skin does not include the block sheet')

if (/midnight-fonts|--font-mn-/.test(r('app/layout.tsx'))) bad.push('the Midnight faces are loaded from the root layout')
if (!/midnight-fonts/.test(r('components/sites/site-page.tsx'))) bad.push('the site page no longer loads the Midnight faces')

const blocks = r('components/page-editor/blocks/midnight.tsx')
for (const t of TYPES) if (!new RegExp(`\\b${t}\\b`).test(blocks)) bad.push(`${t} is not a registered block`)
if (!r('lib/page-editor/config.tsx').includes('...midnightComponents')) bad.push('the Midnight blocks are not in the editor config')
if (!r('lib/page-editor/palette-scope.ts').includes("'midnight'")) bad.push('the midnight category is not on the website palette')
if (!r('lib/sites/menswork-page.ts').includes("type.startsWith('Midnight')")) bad.push('the planner does not draw Midnight blocks as their own render')
if (!r('lib/sites/editor/templates.ts').includes('midnightHomeBlocks()')) bad.push('the Midnight template does not open on the design Home')
if (!/MIDNIGHT_SURFACE/.test(r('lib/spotlight/theme.ts'))) bad.push('the Spotlight preset no longer reads the Midnight token set')

if (bad.length) {
  console.error('LIVE-1365: ' + bad.join('; '))
  process.exit(1)
}
console.log('midnight-theme: registered, tokened, 13 blocks, faces on the site page only')
