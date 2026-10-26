#!/usr/bin/env node
// LIVE-1490 (ADR-1900): Designer is a registered, fully tokened site theme carrying the design's 13 blocks.
//
// Fails when 'designer' leaves the site theme registry or the editor theme list, when the contract loses its
// entry, when a skin or block sheet carries a raw color, when the faces are loaded from the root layout, when a
// design block leaves the registry or the website palette, or when the Spotlight preset leaves the token set.
import { readFileSync } from 'node:fs'

const r = (f) => readFileSync(f, 'utf8')
const bad = []
const TYPES = ['DesignerHero', 'DesignerStatement', 'DesignerPortfolio', 'DesignerSteps', 'DesignerServices', 'DesignerTestimonials', 'DesignerFounder', 'DesignerBand', 'DesignerFAQ', 'DesignerQuote', 'DesignerGallery', 'DesignerClosing', 'DesignerInquiry']

const style = r('lib/theme/site-style.ts')
if (!style.includes("id: 'designer'") || !style.includes("| 'designer'")) bad.push('designer is not in the site theme registry')
if (!r('lib/sites/editor/state.ts').includes("'Designer'")) bad.push('Designer is not in the editor theme list')
if (!r('lib/sites/editor/theme-contract.json').includes('"Designer"')) bad.push('theme-contract.json has no Designer entry')
if (!/id: 'designer'/.test(r('lib/theme/mega-theme.ts'))) bad.push('the mega theme list has no Designer')

const raw = (s) => /#[0-9a-fA-F]{3,8}\b/.test(s.replace(/\[data-[^\]]*\]/g, '')) || /rgba?\(/.test(s)
for (const f of ['components/sites/designer-css.ts', 'components/sites/designer-blocks-css.ts']) if (raw(r(f))) bad.push(`${f} carries a raw color`)
if (!r('components/sites/designer-css.ts').includes('DESIGNER_BLOCKS_CSS')) bad.push('the Designer skin does not include the block sheet')

if (/designer-fonts|--font-dz-/.test(r('app/layout.tsx'))) bad.push('the Designer faces are loaded from the root layout')
if (!/designer-fonts/.test(r('components/sites/site-page.tsx'))) bad.push('the site page no longer loads the Designer faces')

const blocks = r('components/page-editor/blocks/designer.tsx')
for (const t of TYPES) if (!new RegExp(`\\b${t}\\b`).test(blocks)) bad.push(`${t} is not a registered block`)
if (!r('lib/page-editor/config.tsx').includes('...designerComponents')) bad.push('the Designer blocks are not in the editor config')
if (!r('lib/page-editor/palette-scope.ts').includes("'designer'")) bad.push('the designer category is not on the website palette')
if (!r('lib/sites/menswork-page.ts').includes("type.startsWith('Designer')")) bad.push('the planner does not draw Designer blocks as their own render')
if (!r('lib/sites/editor/templates.ts').includes('designerHomeBlocks()')) bad.push('the Designer template does not open on the design Home')
if (!/DESIGNER_SURFACE/.test(r('lib/spotlight/theme.ts'))) bad.push('the Spotlight preset no longer reads the Designer token set')

if (bad.length) {
  console.error('LIVE-1490: ' + bad.join('; '))
  process.exit(1)
}
console.log('designer-theme: registered, tokened, 13 blocks, faces on the site page only')
