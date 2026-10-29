// The Designer small marks (Glyph, Seal, Ornament) exist in one file the intake rules point at, and the blocks draw them.
// Fails on main (nine known gaps for the three marks).
import { readFileSync, existsSync } from 'node:fs'

let bad = 0
const fail = (m) => {
  console.error(`designer-kit marks: ${m}`)
  bad++
}
const rules = JSON.parse(readFileSync('docs/design-systems/designer/rules.json', 'utf8')).rules
for (const g of ['components/elements/Seal.*', 'components/elements/Ornament.*', 'components/core/Glyph.*']) {
  const r = rules.find((x) => x.glob === g)
  if (r?.kind !== 'built' || !existsSync(r.target)) fail(`${g} is not claimed by a file that exists`)
}
const ids = JSON.parse(readFileSync('docs/design-systems/designer/baseline.json', 'utf8')).ids
for (const n of ['Glyph', 'Seal', 'Ornament']) if (ids.some((i) => i.startsWith('missing:') && i.includes(`/${n}.`))) fail(`${n} still has known gaps`)
const block = readFileSync('components/page-editor/blocks/designer.tsx', 'utf8')
if (!block.includes("from '@/components/sites/designer-glyph'") || !block.includes('<Ornament') || !block.includes('<Seal')) fail('the blocks do not draw the marks')
process.exit(bad ? 1 : 0)
