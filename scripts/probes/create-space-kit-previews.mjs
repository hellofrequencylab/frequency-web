// LIVE-2102: the Free Human and Services builder previews wear their own shape, surface and pictures; SHAPE and
// KIT_IMAGERY are total over every kit id, so no kit falls back to Temple's shape or the gathering photos. Reads the
// files under node, never a test runner (LIVE-034). Exit 1 on the first miss.
import { readFileSync, existsSync } from 'node:fs'

const bad = []
const read = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : '')

const tokens = read('lib/theme/preview-tokens.ts')
if (!/const SHAPE: Record<MegaThemeId, Shape> = \{/.test(tokens)) bad.push('SHAPE is not total over every kit id')
if (/SHAPE\[id\] \?\? SHAPE\.temple/.test(tokens)) bad.push('previewTokens still falls back to Temple\'s shape')
if (!/'free-human': \{\s*display: "'Cormorant Garamond'/.test(tokens)) bad.push('the Free Human preview has no shape of its own (Cormorant Garamond display)')
if (!/services: \{\s*display: "'Bricolage Grotesque'/.test(tokens)) bad.push('the Services preview has no shape of its own (Bricolage display)')
if (!/Cormorant\+Garamond:ital,wght@0,400;0,600;1,400;1,600/.test(tokens)) bad.push('the preview font sheet does not load Cormorant Garamond at 400 for Free Human\'s body copy')
if (!/'new-world', 'services', 'free-human',/.test(tokens)) bad.push('free-human is not in the preview kit order, so it cannot reach the builder when it is un-hidden')

const site = read('lib/create-space/preview-site.ts')
if (!/const KIT_IMAGERY: Record<MegaThemeId, KitImagery> = \{/.test(site)) bad.push('KIT_IMAGERY is not total over every kit id')
if (/KIT_IMAGERY\[kit\] \?\? FREQUENCY_IMAGERY/.test(site)) bad.push('kitImagery still falls back to the gathering photos')
if (!/'free-human': \{\s*hero: FREE_HUMAN_PHOTO\('heritage-a-virgin'\)/.test(site)) bad.push('the Free Human preview does not wear the kit\'s own photo library')
if (!/services: \{\s*hero: (NEW_WORLD_PHOTO|'\/sites\/services\/hero-squeegee\.webp')/.test(site)) bad.push('the Services preview has no pictures of its own')

for (const n of ['heritage-a-virgin', 'founder-audrey', 'place-daisies', 'light-sun', 'light-floating-candles', 'light-lanterns', 'light-honey-dipper']) {
  if (!existsSync(`public/sites/free-human/photos/${n}.webp`)) bad.push(`Free Human photo ${n} is missing`)
}

if (bad.length) {
  for (const b of bad) console.error(`create-space-kit-previews: ${b}`)
  process.exit(1)
}
console.log('create-space-kit-previews: Free Human and Services builder previews wear their own shape and pictures')
