// PROG-E2C: the Spotlight block kit sits beside the one block registry, and every Spotlight type is a registry row.
// Consequences measured:
//   1. the old kit file is gone and nothing under app, components or lib imports it;
//   2. every type in the kit's BlockType union is an ENTITY_BLOCKS row a member may hold (loaded from the real
//      registry), so the kit names no block the registry does not;
//   3. the goldens that froze storage, validation and rendered markup before the move are still in the tree;
//   4. the block-system ratchet recorded the fold (3 or lower; later folds only lower it).
import fs from 'node:fs'
import path from 'node:path'
const bad = []

const OLD = 'lib/spotlight/blocks/schema.ts'
const KIT = 'lib/entity-blocks/spotlight.ts'
if (fs.existsSync(OLD)) bad.push(`${OLD} still exists: the Spotlight kit is still counted as its own system`)
if (!fs.existsSync(KIT)) bad.push(`${KIT} does not exist`)
else {
  const src = fs.readFileSync(KIT, 'utf8')
  const union = src.match(/export type BlockType =([^\n]+)/)
  const types = union ? [...union[1].matchAll(/'([a-z]+)'/g)].map((m) => m[1]) : []
  if (types.length !== 9) bad.push(`the kit's BlockType union reads ${types.length} types, expected the nine`)
  const { ENTITY_BLOCKS, blockSupportsKind } = await import('../../../lib/entity-blocks/registry.ts')
  for (const id of types) {
    const row = ENTITY_BLOCKS.find((b) => b.id === id)
    if (!row) bad.push(`${id} is a Spotlight type with no ENTITY_BLOCKS row`)
    else if (!blockSupportsKind(row, 'member')) bad.push(`${id} is a Spotlight type the registry does not let a member hold`)
  }
}

const IMPORTS_OLD = /from\s+['"](?:[^'"]*spotlight\/blocks\/schema|\.\/schema)(?:\.ts)?['"]/
const walk = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p)
    else if (/\.(ts|tsx|mts|mjs)$/.test(e.name) && p.startsWith(path.join('lib', 'spotlight')) && IMPORTS_OLD.test(fs.readFileSync(p, 'utf8'))) bad.push(`${p} still imports the old kit`)
    else if (/\.(ts|tsx|mts|mjs)$/.test(e.name) && /spotlight\/blocks\/schema['"]/.test(fs.readFileSync(p, 'utf8'))) bad.push(`${p} still imports the old kit`)
  }
}
for (const dir of ['app', 'components', 'lib']) walk(dir)

if (!fs.existsSync('lib/entity-blocks/spotlight.golden.test.tsx')) bad.push('the goldens that freeze the Spotlight kit are gone')

const led = JSON.parse(fs.readFileSync('scripts/block-baselines.json', 'utf8'))
const entry = (led.entries ?? []).find((e) => e.key === 'block-systems')
if (!entry || typeof entry.baseline !== 'number' || entry.baseline > 3) bad.push(`block-systems reads ${entry?.baseline}; the fold must be recorded (3 or lower)`)

if (bad.length) {
  console.error(bad.join('\n'))
  process.exit(1)
}
