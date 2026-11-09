// LIVE-2082: the signed-out builder's Nocturne preview wears Nocturne's own monochrome pictures, not the warm gathering photos.
import { readFileSync, existsSync } from 'node:fs'

const bad = []
const site = existsSync('lib/create-space/preview-site.ts') ? readFileSync('lib/create-space/preview-site.ts', 'utf8') : ''
if (!/midnight: \{\s*hero: NOCTURNE_PHOTO\('industrial-ribs'\)/.test(site)) bad.push('the Nocturne preview does not wear its own photos')
for (const n of ['industrial-ribs', 'industrial-panel', 'industrial-blades', 'nature-dunes', 'nature-fern', 'nature-grain', 'nature-palm']) {
  if (!existsSync(`public/sites/midnight/photos/${n}.jpg`)) bad.push(`Nocturne photo ${n} is missing`)
}
if (bad.length) {
  console.error(bad.map((b) => `FAIL ${b}`).join('\n'))
  process.exit(1)
}
console.log('ok: the Nocturne preview wears its own pictures')
