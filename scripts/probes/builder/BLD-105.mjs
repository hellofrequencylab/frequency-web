// BLD-105: the Tune rail is generated. lib/builder/tune.ts projects any block type into two layers (role slots
// first, with their limits; the rest under More) and its test proves, for every adopted role, that the drawn fields
// equal the declared ones. The rail component names no block type, and typing in one field is one undo step.
import fs from 'node:fs'
import path from 'node:path'
const bad = []
const read = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : (bad.push(`missing ${f}`), ''))
if (!/export function tuneProjection\(/.test(read('lib/builder/tune.ts'))) bad.push('tune.ts lacks tuneProjection')
if (!/the rendered fields equal the projection, no more and no fewer/.test(read('lib/builder/tune.test.ts'))) bad.push('the projection test is missing')
const types = new Set([...fs.readFileSync('lib/blocks/roles/roles.ts', 'utf8').matchAll(/from '\.\/(\w+)\.role\.json'/g)].map((m) => JSON.parse(fs.readFileSync(`lib/blocks/roles/${m[1]}.role.json`, 'utf8')).type))
for (const file of fs.readdirSync('components/builder/tune').map((f) => path.join('components/builder/tune', f))) {
  const src = fs.readFileSync(file, 'utf8')
  for (const t of types) if (new RegExp(`['"\`]${t}['"\`]`).test(src)) bad.push(`${file} names the block type ${t}`)
  if (/['"`](Services|Space|Network|Midnight|Temple|Designer)[A-Z]\w*['"`]/.test(src)) bad.push(`${file} names a block type`)
}
const shell = read('components/builder/shell/builder-shell.tsx')
if (!/<TuneRail /.test(shell)) bad.push('the shell must draw the Tune rail for the selected section')
if (!/burst\?: string/.test(read('lib/builder/state.ts'))) bad.push('typing must fold into one undo step (burst)')
if (bad.length) { console.error(bad.join('\n')); process.exit(1) }
