// The Network Theme Kit's design system is on file and fully claimed: a snapshot folder exists and every inventory
// file matches a rule. Fails on main before the intake (no docs/design-systems/network).
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ruleFor } from '../lib/design-system.mjs'

const dir = 'docs/design-systems/network'
let bad = 0
for (const f of ['rules.json', 'inventory.json', 'tokens.json', 'copy.json', 'baseline.json']) {
  if (!existsSync(join(dir, f))) {
    console.error(`network: ${f} is missing`)
    bad++
  }
}
if (!bad) {
  const { rules } = JSON.parse(readFileSync(join(dir, 'rules.json'), 'utf8'))
  const inv = JSON.parse(readFileSync(join(dir, 'inventory.json'), 'utf8'))
  if (inv.length < 190) {
    console.error(`network: inventory holds ${inv.length} files, expected the full 200`)
    bad++
  }
  for (const f of inv.filter((x) => !ruleFor(rules, x.path))) {
    console.error(`network: no rule claims ${f.path}`)
    bad++
  }
}
process.exit(bad ? 1 : 0)
