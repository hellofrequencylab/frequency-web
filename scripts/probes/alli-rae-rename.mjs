#!/usr/bin/env node
// LIVE-1495: the Alli Rae site address is alliraebuilddesign.frequencylocal.com, and the rename script stays guarded.
//
// Fails when the slug constant drifts, the footer buttons stop naming it, or the rename script loses its guards,
// backup or rollback.
import { readFileSync } from 'node:fs'

const site = readFileSync('lib/sites/alli-rae-site.ts', 'utf8')
const script = readFileSync('scripts/seed-alli-rae-rename.mts', 'utf8')
const bad = []
if (!site.includes("ALLI_RAE_SLUG = 'alliraebuilddesign'")) bad.push('alli-rae-site.ts no longer names the alliraebuilddesign slug')
if (!site.includes('/spaces/${ALLI_RAE_SLUG}/ready-to-build')) bad.push('the footer buttons no longer follow the slug')
for (const n of ['zz_backup_alli_rae_rename_20261027', 'exactly one Space', 'already exists', 'ROLLBACK']) if (!script.includes(n)) bad.push(`the rename script lost ${n}`)
if (bad.length) {
  console.error(bad.map((b) => `✗ ${b}`).join('\n'))
  process.exit(1)
}
console.log('Alli Rae lives at alliraebuilddesign, with a guarded, reversible rename.')
