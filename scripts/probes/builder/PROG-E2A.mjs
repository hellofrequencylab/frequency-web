// PROG-E2A: the block-system counter counts the five real systems, and PROG-E2's probe can read the file.
// Consequences measured: the manifest names the canon's five entry points (EDITOR-ARCHITECTURE section 2.1) and
// neither of the two non-systems; every manifest path exists, so the count is a count of real files; the gate
// itself holds; and the parent probe, run as a child process, reads the real number and fails on it while it is
// above 1 (it names the number it read, which the old inline reader never could).
import fs from 'node:fs'
import { spawnSync } from 'node:child_process'
const bad = []

const led = JSON.parse(fs.readFileSync('scripts/block-baselines.json', 'utf8'))
const entry = (led.entries ?? []).find((e) => e.key === 'block-systems')
if (!entry) bad.push('block-baselines.json has no block-systems entry')
const manifest = entry?.patterns ?? []

for (const p of ['lib/entity-blocks/registry.ts', 'lib/page-editor/config.tsx', 'lib/spotlight/blocks/schema.ts']) {
  // A system leaves the manifest only by being folded: its entry file is gone from the tree.
  if (!manifest.includes(p) && fs.existsSync(p)) bad.push(`the manifest does not name ${p}, which is still in the tree`)
}
// The Space profile catalog: named while it exists; once folded, the file must really be gone.
if (!manifest.includes('lib/spaces/profile-blocks.ts') && fs.existsSync('lib/spaces/profile-blocks.ts')) bad.push('the manifest does not name lib/spaces/profile-blocks.ts, which is still in the tree')
for (const p of manifest) {
  if (/product-block\.ts$|element-catalog\.ts$/.test(p)) bad.push(`the manifest still names ${p}, which is not a block system`)
  if (p === 'components/spotlight') bad.push('the manifest still names the components/spotlight directory, which can never disappear')
}
if (entry && typeof entry.baseline === 'number') {
  const present = manifest.filter((p) => fs.existsSync(p)).length
  if (present !== entry.baseline) bad.push(`the baseline is ${entry.baseline} but ${present} manifest paths exist`)
}

const gate = spawnSync(process.execPath, ['scripts/check-block-baselines.mjs'], { encoding: 'utf8' })
if (gate.status !== 0) bad.push(`check:block-baselines fails: ${(gate.stderr || gate.stdout).trim().split('\n')[0]}`)

if (!fs.existsSync('scripts/probes/builder/PROG-E2.mjs')) bad.push('PROG-E2 has no probe script that reads entries[]')
else if (entry && typeof entry.baseline === 'number') {
  const parent = spawnSync(process.execPath, ['scripts/probes/builder/PROG-E2.mjs'], { encoding: 'utf8' })
  // The E2 target is 2 since ADR-1955 (owner approval, Daniel, 2026-11-16 17:52Z); it was 1.
  const TARGET = 2
  if (entry.baseline > TARGET) {
    if (parent.status === 0) bad.push(`the PROG-E2 probe passes while block-systems is ${entry.baseline}`)
    else if (!parent.stderr.includes(`block-systems is ${entry.baseline}`)) bad.push(`the PROG-E2 probe failed without reading the number: ${parent.stderr.trim()}`)
  } else if (parent.status !== 0 && !/block_type_usage/.test(parent.stderr)) {
    bad.push(`the PROG-E2 probe cannot read a baseline of ${entry.baseline}: ${parent.stderr.trim()}`)
  }
}

if (bad.length) {
  console.error(bad.join('\n'))
  process.exit(1)
}
