#!/usr/bin/env node
// LIVE-1360 (ADR-1881): a Space's Mega Theme and niche are stored in preferences.megaTheme.
//
// Fails when the model file loses its map or its storage key, when Space creation stops seeding the niche,
// or when the owner profile save stops writing the choice.
import { readFileSync } from 'node:fs'

const bad = []
const read = (f) => readFileSync(f, 'utf8')
const mega = read('lib/theme/mega-theme.ts')
for (const needle of ['export const MEGA_THEMES', 'export const MEGA_NICHES', 'export function readMegaTheme', 'export function withMegaTheme', 'next.megaTheme']) {
  if (!mega.includes(needle)) bad.push(`lib/theme/mega-theme.ts lost: ${needle}`)
}
if (!read('lib/spaces/provision.ts').includes('withMegaTheme({}, picked)')) bad.push('Space creation no longer seeds the niche')
if (!read('lib/spaces/profile-settings.ts').includes('withMegaTheme(prefs,')) bad.push('the owner profile save no longer writes the Mega Theme choice')

if (bad.length) {
  console.error(bad.join('\n'))
  process.exit(1)
}
console.log('mega theme: storage, creation seed and owner save are wired')
