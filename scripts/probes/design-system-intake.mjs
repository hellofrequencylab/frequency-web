// Every file of every committed design-system snapshot is claimed by a rule, and each snapshot carries its
// token and copy captures. Fails if a theme's rules leave a file unclaimed (a file nobody accounted for).
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ruleFor } from '../lib/design-system.mjs'

const base = 'docs/design-systems'
// theme-cohesion holds the theme audit's hole baseline (LIVE-1850), not a theme's design-system snapshot.
const NOT_A_SNAPSHOT = new Set(['theme-cohesion'])
const themes = readdirSync(base, { withFileTypes: true }).filter((e) => e.isDirectory() && !NOT_A_SNAPSHOT.has(e.name)).map((e) => e.name)
if (!themes.length) {
  console.error('no design-system snapshots under docs/design-systems')
  process.exit(1)
}
let bad = 0
for (const t of themes) {
  for (const f of ['rules.json', 'inventory.json', 'tokens.json', 'copy.json', 'baseline.json']) {
    if (!existsSync(join(base, t, f))) {
      console.error(`${t}: ${f} is missing`)
      bad++
    }
  }
  if (bad) continue
  const { rules } = JSON.parse(readFileSync(join(base, t, 'rules.json'), 'utf8'))
  const inv = JSON.parse(readFileSync(join(base, t, 'inventory.json'), 'utf8'))
  const open = inv.filter((f) => !ruleFor(rules, f.path))
  for (const f of open) console.error(`${t}: no rule claims ${f.path}`)
  bad += open.length
}
process.exit(bad ? 1 : 0)
