// PROG-E9 (Editor E9, Loom authoring): an operator composes a function without a deploy.
//
// Measures the whole consequence, in three arms, and names each that is missing:
//   1. the integrity gate is real: check:loom-integrity is a package script backed by a file, its vitest home is
//      named in guard-wiring, and arm A (validateLoomFunction) and the primitive manifest exist. Shipped 2026-11-14.
//   2. a store persists declarations only through the validator: lib/loom/store.ts exists, touches loom_functions
//      and calls validateLoomFunction before it writes. Needs the loom_functions table (a migration).
//   3. an operator surface composes one: a file under app/ reaches the store. Needs arm 2.
// Fails until all three hold, so the row cannot close on the gate alone.
import fs from 'node:fs'
import path from 'node:path'

const bad = []
const read = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '')

const scripts = JSON.parse(read('package.json') || '{}').scripts ?? {}
const gateFile = ((scripts['check:loom-integrity'] ?? '').match(/scripts\/[\w./-]+\.mjs/) || [])[0]
if (!gateFile || !fs.existsSync(gateFile)) bad.push('arm 1: check:loom-integrity is not a package script backed by a file')
if (!/'check:loom-integrity':\s*'scripts\/check-loom-integrity\.test\.ts'/.test(read('scripts/guard-wiring.test.ts'))) bad.push('arm 1: the gate has no vitest home in guard-wiring')
if (!/export function validateLoomFunction\(/.test(read('lib/loom/functions/validate.ts'))) bad.push('arm 1: arm A (validateLoomFunction) is missing')
if (!/export const LOOM_PRIMITIVES\b/.test(read('lib/loom/functions/primitives.ts'))) bad.push('arm 1: the primitive manifest is missing')

const store = read('lib/loom/store.ts')
if (!store) bad.push('arm 2: lib/loom/store.ts does not exist (needs the loom_functions table)')
else if (!/\.from\(\s*['"]loom_functions['"]\s*\)/.test(store) || !/validateLoomFunction\(/.test(store)) bad.push('arm 2: the store must write loom_functions only through validateLoomFunction')

const files = []
const walk = (d) => {
  if (!fs.existsSync(d)) return
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name)
    if (e.isDirectory()) walk(p)
    else if (/\.tsx?$/.test(e.name) && !/\.test\./.test(e.name)) files.push(p)
  }
}
walk('app')
if (!files.some((f) => /@\/lib\/loom\/store['"]/.test(read(f)))) bad.push('arm 3: no operator surface under app/ reaches the Loom store')

if (bad.length) {
  console.error('PROG-E9: ' + bad.join('; '))
  process.exit(1)
}
