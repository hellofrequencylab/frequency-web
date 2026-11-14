// LIVE-2067: the signed-out builder offers New World (preselected on a cold visit) and Services, each with its own
// preview shape and pictures, gated on the one hidden flag (RETIRED_FROM_PICKERS through SITE_THEMES) so each kit reaches
// the builder the moment it is un-hidden and never before. Reads the files under node, never a test runner (LIVE-034).
import { readFileSync, existsSync } from 'node:fs'

const bad = []
const read = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : '')

const tokens = read('lib/theme/preview-tokens.ts')
if (!/PREVIEW_KIT_PREFERENCE: readonly MegaThemeId\[\] = \[\s*'new-world', 'services',/.test(tokens)) bad.push('the picker does not lead with New World then Services')
if (!/PREVIEW_KIT_ORDER: readonly MegaThemeId\[\] = PREVIEW_KIT_PREFERENCE\.filter\(\(id\) => SITE_THEMES\.some/.test(tokens)) bad.push('the picker is not gated on SITE_THEMES (the one hidden flag)')
for (const id of ['new-world', 'services']) {
  if (!new RegExp(`^\\s*'?${id}'?: \\{\\s*display: "'Bricolage Grotesque'`, 'm').test(tokens)) bad.push(`${id} has no preview shape of its own`)
}
if (!/family=Lora:ital@1/.test(tokens)) bad.push('the preview font sheet does not carry Lora italic (the one-word voice)')

const site = read('lib/create-space/preview-site.ts')
if (!/'new-world': \{\s*hero: NEW_WORLD_PHOTO\('beach-joy'\)/.test(site)) bad.push('New World does not wear its own photo library in the preview')
if (!/services: \{\s*hero: (NEW_WORLD_PHOTO|'\/sites\/services\/hero-squeegee\.webp')/.test(site)) bad.push('Services has no preview pictures')
for (const name of ['beach-joy', 'group-hug', 'circle-sunrise', 'hands-up', 'fire-circle', 'garden-picnic', 'cafe-table', 'backyard-class', 'workshop-table', 'beach-gong']) {
  if (!existsSync(`public/sites/new-world/photos/${name}.webp`)) bad.push(`New World photo ${name} is missing`)
}

const wizard = read('lib/spaces/create-wizard.ts')
if (/id !== 'services'|id !== 'new-world'/.test(wizard)) bad.push('WIZARD_THEMES hides Services or New World by hand instead of through SITE_THEMES')
if (!/MEGA_THEMES\.filter\(\(\{ id \}\) => id !== 'free-human' && SITE_THEMES\.some\(\(t\) => t\.id === id\)\)/.test(wizard)) bad.push('WIZARD_THEMES is not gated on SITE_THEMES')
if (!/'new-world' \? 'New World'/.test(wizard)) bad.push('New World has no picker label')

const door = read('lib/create-space/door.ts')
if (!/export const COLD_KIT: MegaThemeId = PREVIEW_KIT_ORDER\.includes\('new-world'\) \? 'new-world' : 'frequency'/.test(door)) bad.push('a cold visit does not start on New World once it is offered')

if (bad.length) {
  for (const b of bad) console.error(`create-space-picker: ${b}`)
  process.exit(1)
}
console.log('create-space-picker: the builder offers New World first and Services, each with its own preview')
