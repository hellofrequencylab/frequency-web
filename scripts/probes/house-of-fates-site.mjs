#!/usr/bin/env node
// LIVE-1505: House of Fates ships as a Midnight kit site, with its content, photos and guarded update script in the tree.
//
// Fails when the site module loses its published editor state, when the update script leaves the guarded
// transaction, when the practice blocks leave the page editor, or when the photos leave public/.
import { existsSync, readFileSync, readdirSync } from 'node:fs'

const r = (f) => readFileSync(f, 'utf8')
const bad = []
const site = r('lib/sites/house-of-fates-site.ts')
for (const needle of ['export function houseOfFatesEditorState', 'export function houseOfFatesSitePages', 'HOF_BOOKING_LIVE']) {
  if (!site.includes(needle)) bad.push(`house-of-fates-site.ts has no ${needle}`)
}
if (!existsSync('public/sites/house-of-fates') || readdirSync('public/sites/house-of-fates').length < 10) bad.push('the House of Fates photos are missing from public/sites/house-of-fates')
const seed = r('scripts/seed-house-of-fates-update.mts')
for (const needle of ['zz_backup_house_of_fates_update_20261027', 'save_website_editor', 'rev <> 1']) {
  if (!seed.includes(needle)) bad.push(`the update script no longer carries ${needle}`)
}
if (!r('lib/page-editor/config.tsx').includes('midnightPracticeComponents')) bad.push('the Midnight practice blocks are not registered in the page editor')

if (bad.length) {
  console.error(bad.map((b) => `✗ ${b}`).join('\n'))
  process.exit(1)
}
console.log('House of Fates site module, photos, practice blocks and guarded update are in place.')
