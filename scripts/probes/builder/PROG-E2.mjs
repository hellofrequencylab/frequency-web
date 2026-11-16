// PROG-E2: both halves of the E2 gate, read from the files that hold them.
//  (a) the usage index: a migration that ships block_type_usage, so "which tenants place block Y" is answerable
//      before a retirement;
//  (b) the consolidation itself: scripts/block-baselines.json records `block-systems` at the E2 target.
// The target is 2 since ADR-1955 (owner ruling, Daniel, 2026-11-16 17:33Z, "Stop at 2 and close PROG-E2"): the
// entity-block registry and the website builder's Puck blocks. It was 1 until then.
// The earlier inline probe looked for a top-level `block-systems` key (or `counts` / `baselines`), but the file's
// shape is `entries: [{ key, baseline }]`, so it could not pass even at 1. This reads the real shape. The bar is
// the migration AND the target value, with a matching frozen record.
import fs from 'node:fs'
const bad = []
const TARGET = 2

const dir = 'supabase/migrations'
const mig = fs.existsSync(dir) && fs.readdirSync(dir).some((f) => /block_type_usage/.test(fs.readFileSync(`${dir}/${f}`, 'utf8')))
if (!mig) bad.push('no block_type_usage usage index in migrations')

const file = 'scripts/block-baselines.json'
let led = null
try {
  led = JSON.parse(fs.readFileSync(file, 'utf8'))
} catch {
  bad.push(`${file} (the section 7.3 ratchet) is missing or unreadable`)
}
if (led) {
  const entry = Array.isArray(led.entries) ? led.entries.find((e) => e && e.key === 'block-systems') : null
  if (!entry) bad.push(`${file} has no entries[] row with key block-systems`)
  else if (typeof entry.baseline !== 'number') bad.push(`${file} block-systems baseline is not a number`)
  else if (entry.baseline > TARGET) bad.push(`${file} block-systems is ${entry.baseline}, the gate is ${TARGET}`)
  else if (entry.frozen?.value !== entry.baseline) bad.push(`${file} block-systems baseline ${entry.baseline} has no matching frozen record`)
}

if (bad.length) {
  console.error('PROG-E2: ' + bad.join('; '))
  process.exit(1)
}
