// The Designer Theme Kit polish pass: the design-system primitives that the kit builds elsewhere point at the file that
// builds them, and two it never draws (Sigil, MoonPhases) say so. Fails on main (12 known gaps for these four).
import { readFileSync, existsSync } from 'node:fs'

let bad = 0
const fail = (m) => {
  console.error(`designer-kit polish: ${m}`)
  bad++
}
const rules = JSON.parse(readFileSync('docs/design-systems/designer/rules.json', 'utf8')).rules
const rule = (g) => rules.find((r) => r.glob === g)
const arch = rule('components/elements/ArchFrame.*')
if (arch?.kind !== 'built' || !existsSync(arch.target)) fail('ArchFrame is not claimed by a file that exists')
const mark = rule('components/core/BrandMark.*')
if (mark?.kind !== 'built' || !existsSync(mark.target)) fail('BrandMark is not claimed by a file that exists')
for (const g of ['components/elements/MoonPhases.*', 'components/core/Sigil.*']) {
  const r = rule(g)
  if (r?.kind !== 'reference' || !r.reason) fail(`${g} is neither built nor explained`)
}
const ids = JSON.parse(readFileSync('docs/design-systems/designer/baseline.json', 'utf8')).ids
for (const n of ['ArchFrame', 'MoonPhases', 'BrandMark', 'Sigil']) {
  const left = ids.filter((i) => i.startsWith('missing:') && i.includes(`/${n}.`))
  if (left.length) fail(`${n} still has ${left.length} known gaps`)
}
process.exit(bad ? 1 : 0)
