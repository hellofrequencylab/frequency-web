#!/usr/bin/env node
// LIVE-1512: the seven profiles (general, creators, schools, clubs, faith, wellness, markets) are niches a
// Space can say it is building, with words, a starting setup and a picker card each.
//
// Fails when a profile leaves the niche list, loses its kit words, its starting-setup row or its picker card.
import { readFileSync } from 'node:fs'

const PROFILES = ['general', 'creators', 'schools', 'clubs', 'faith', 'wellness', 'markets']
const bad = []
const read = (f) => readFileSync(f, 'utf8')
const mega = read('lib/theme/mega-theme.ts')
const spec = read('lib/sites/kits/niche-spec.ts')
const defaults = read('lib/spaces/niche-defaults.ts')
const picker = read('lib/spaces/space-picker.ts')
for (const id of PROFILES) {
  if (!new RegExp(`'${id}'`).test(mega)) bad.push(`mega-theme.ts lost the ${id} niche`)
  if (!new RegExp(`\\n  ${id}: \\{\\n    id: '${id}'`).test(spec)) bad.push(`niche-spec.ts lost the ${id} words`)
  if (!new RegExp(`\\b${id}: \\{ label:`).test(defaults)) bad.push(`niche-defaults.ts lost the ${id} row`)
  if (!new RegExp(`id: '${id}', label:`).test(picker)) bad.push(`space-picker.ts lost the ${id} card`)
}
if (!/MEGA_NICHES = \[\.\.\.MEGA_CORE_NICHES, \.\.\.MEGA_PROFILE_NICHES\]/.test(mega)) bad.push('MEGA_NICHES no longer joins the core doors and the profiles')

if (bad.length) {
  console.error(bad.join('\n'))
  process.exit(1)
}
console.log('profile niches: seven profiles have words, a starting setup and a picker card')
