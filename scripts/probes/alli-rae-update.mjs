#!/usr/bin/env node
// LIVE-1494: the guarded update script for the live Alli Rae Space stays guarded.
//
// Fails when the script loses its revision guard, its backup, the publish through save_website_editor, or the
// footer and menu merge, any of which would let a re-run overwrite an edit Alli made.
import { readFileSync } from 'node:fs'

const s = readFileSync('scripts/seed-alli-rae-update.mts', 'utf8')
const bad = ['zz_backup_alli_rae_update_20261027', 'rev <> 1', 'save_website_editor', 'siteFooter', 'siteMenu', 'ROLLBACK'].filter((n) => !s.includes(n))
if (bad.length) {
  console.error(bad.map((b) => `✗ the update script no longer carries ${b}`).join('\n'))
  process.exit(1)
}
console.log('Alli Rae update script is guarded, backed up and reversible.')
