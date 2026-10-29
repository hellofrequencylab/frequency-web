// The Designer Theme Kit token pass: every design-system token is declared in DESIGNER_TOKENS_CSS with the design's own value,
// or named in rules.json as a deviation with its reason. Fails on main (76 known token gaps).
import { readFileSync } from 'node:fs'

let bad = 0
const fail = (m) => {
  console.error(`designer-kit tokens: ${m}`)
  bad++
}
const ids = JSON.parse(readFileSync('docs/design-systems/designer/baseline.json', 'utf8')).ids
const left = ids.filter((i) => i.startsWith('token:'))
if (left.length) fail(`${left.length} token gaps are still in the baseline (${left.slice(0, 3).join(', ')}...)`)
const rules = JSON.parse(readFileSync('docs/design-systems/designer/rules.json', 'utf8'))
if (!rules.tokenDeviations?.length || rules.tokenDeviations.some((d) => !d.reason)) fail('a token deviation is missing its reason')
const css = readFileSync('lib/theme/designer.ts', 'utf8')
for (const t of ['--color-border-strong:var(--dz-line-strong)', '--color-ink:var(--dz-ink)', '--text-display-h1', '--th-bg', '--mn-solid']) if (!css.includes(t)) fail(`designer.ts does not declare ${t}`)
process.exit(bad ? 1 : 0)
