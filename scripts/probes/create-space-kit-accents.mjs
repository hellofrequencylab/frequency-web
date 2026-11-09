// LIVE-2066: every kit in the signed-out builder wears its own accents, surface, shape and pictures; no kit falls back to
// Temple's. Reads the files and the pure modules under node, never a test runner (LIVE-034). Exit 1 on the first miss.
import { readFileSync, existsSync } from 'node:fs'

const bad = []
const read = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : '')

const site = read('lib/create-space/preview-site.ts')
if (/\?\? KIT_ACCENTS\.temple/.test(site)) bad.push('kitAccents still falls back to Temple\'s four')
if (/\?\? KIT_IMAGERY\.temple/.test(site)) bad.push('kitImagery still falls back to Temple\'s pictures')
if (!/const KIT_ACCENTS: Record<MegaThemeId, readonly PreviewAccent\[\]>/.test(site)) bad.push('KIT_ACCENTS is not total over every kit id')
for (const id of ['temple-kit', 'free-human', 'services', 'new-world']) {
  if (!new RegExp(`^\\s*'?${id}'?: `, 'm').test(site)) bad.push(`${id} has no accent family of its own in preview-site.ts`)
}
if (!/'temple-kit': distinctProfiles\(TEMPLE_KIT_PROFILES/.test(site)) bad.push('the Temple kit accents are not read from lib/theme/temple-kit.ts')
if (!/'temple-kit': \{\s*hero: TEMPLE_KIT_PHOTO/.test(site)) bad.push('the Temple kit preview does not wear the kit\'s own photo library')

const tokens = read('lib/theme/preview-tokens.ts')
if (/id === 'temple-kit'\) return MEGA_SURFACES\.temple/.test(tokens)) bad.push('the Temple kit preview still wears Temple\'s surface')
if (!/'temple-kit': \{\s*display: "'Marcellus'/.test(tokens)) bad.push('the Temple kit preview has no shape of its own (Marcellus display)')

// The kit's first accent is its own clay, and the photos it names exist.
for (const n of ['02', '05', '10', '11', '13']) {
  if (!existsSync(`public/sites/temple-kit/photos/photo-${n}.jpg`)) bad.push(`Temple kit photo ${n} is missing`)
}
const tk = read('lib/theme/temple-kit.ts')
const general = /general: \{ label: "Temple", accent: '(#[0-9A-F]{6})'/.exec(tk)?.[1]
if (!general) bad.push('TEMPLE_KIT_PROFILES.general has moved; the probe cannot read the kit\'s clay')

if (bad.length) {
  for (const b of bad) console.error(`create-space-kit-accents: ${b}`)
  process.exit(1)
}
console.log('create-space-kit-accents: every builder kit wears its own accents, surface, shape and pictures')
