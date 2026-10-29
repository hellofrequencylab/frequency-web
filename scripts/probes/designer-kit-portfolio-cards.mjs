// The Designer portfolio block has a cards look (the design's Portfolio page): a `display` field, the card markup and its sheet.
// Fails on main (no cards look).
import { readFileSync } from 'node:fs'

let bad = 0
const fail = (m) => {
  console.error(`designer-kit portfolio cards: ${m}`)
  bad++
}
const block = readFileSync('components/page-editor/blocks/designer.tsx', 'utf8')
const css = readFileSync('components/sites/designer-blocks-css.ts', 'utf8')
if (!/display:\s*\{\s*type:\s*'select'/.test(block)) fail('DesignerPortfolio has no display field')
if (!block.includes('dz-tiles')) fail('the cards markup is missing')
if (!css.includes('.dz-tiles{') || !css.includes('.dz-tile-go')) fail('the cards sheet is missing')
process.exit(bad ? 1 : 0)
