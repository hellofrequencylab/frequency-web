// PROG-E2: both halves of the E2 gate, read from the files that hold them.
//  (a) the usage index: a migration that ships block_type_usage, so "which tenants place block Y" is answerable
//      before a retirement;
//  (b) the consolidation itself: scripts/block-baselines.json records `block-systems` at exactly 1.
// The earlier inline probe looked for a top-level `block-systems` key (or `counts` / `baselines`), but the file's
// shape is `entries: [{ key, baseline }]`, so it could not pass even at 1. This reads the real shape. The bar is
// unchanged: the migration AND the value 1.
import fs from 'node:fs'
const bad = []

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
  else if (entry.baseline !== 1) bad.push(`${file} block-systems is ${entry.baseline}, the gate is 1`)
  else if (entry.frozen?.value !== 1) bad.push(`${file} block-systems baseline 1 has no matching frozen record`)
}

if (bad.length) {
  console.error('PROG-E2: ' + bad.join('; '))
  process.exit(1)
}
