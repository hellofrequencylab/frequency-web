#!/usr/bin/env node
// LIVE-1492: Alli Rae Design & Build ships as a Designer site, with its content and seed script in the tree.
//
// Fails when the site module loses its published editor state, when the seed script leaves the guarded
// transaction, or when the Alli photos leave public/.
import { existsSync, readFileSync, readdirSync } from 'node:fs'

const r = (f) => readFileSync(f, 'utf8')
const bad = []
const site = r('lib/sites/alli-rae-site.ts')
if (!site.includes('export function alliRaeEditorState')) bad.push('alli-rae-site.ts has no alliRaeEditorState')
if (!site.includes('export function alliRaeSitePages')) bad.push('alli-rae-site.ts has no alliRaeSitePages')
if (!existsSync('public/sites/alli-rae') || readdirSync('public/sites/alli-rae').length < 10) bad.push('the Alli Rae photos are missing from public/sites/alli-rae')
const seed = r('scripts/seed-alli-rae.mts')
for (const needle of ['zz_backup_alli_rae_20261027', 'save_website_editor', 'claim_token', "'designer'"]) {
  if (!seed.includes(needle)) bad.push(`the seed script no longer carries ${needle}`)
}

if (bad.length) {
  console.error(bad.map((b) => `✗ ${b}`).join('\n'))
  process.exit(1)
}
console.log('Alli Rae site module, photos and guarded seed are in place.')
