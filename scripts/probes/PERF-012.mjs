// PERF-012: a photo is web-sized in the browser before it is stored (owner ruling 2026-11-19:
// shrink at upload, never the paid image optimizer).
import { readFileSync } from 'node:fs'

const src = readFileSync('lib/library/image-shrink.ts', 'utf8')
const bad = []
const bytes = src.match(/export const WEB_SIZE_BYTES = (\d+) \* 1024\n/)
const dim = src.match(/export const WEB_MAX_DIM = (\d+)\n/)
if (!bytes) bad.push('there is no web-size threshold')
else if (Number(bytes[1]) > 1024) bad.push(`the web-size threshold is ${bytes[1]} KB, so a 1 MB photo is stored as uploaded`)
if (!dim) bad.push('there is no web-size longest edge')
else if (Number(dim[1]) > 2560 || Number(dim[1]) < 1600) bad.push(`the web-size longest edge is ${dim[1]}px (want 1600 to 2560)`)
if (!/if \(!wantsWebSizing\(file\.type, file\.size\)\) return file/.test(src)) bad.push('the shrink still starts at the upload ceiling, not the web-size threshold')
if (!/encodeAt\(bitmap, WEB_MAX_DIM, WEB_QUALITY, type\)/.test(src)) bad.push('no web-size encode runs')
if (!/best\.size >= file\.size\) return file/.test(src)) bad.push('a re-encode that is not smaller could replace the original')
// The optimizer must not be the answer for Space block photos (the ruling).
for (const f of ['components/entity-blocks/content-block-view.tsx', 'components/entity-blocks/design-block-view.tsx']) {
  if (/_next\/image/.test(readFileSync(f, 'utf8'))) bad.push(`${f} routes photos through the image optimizer`)
}
if (bad.length) {
  console.error('PERF-012: ' + bad.join('; '))
  process.exit(1)
}
console.log('PERF-012: uploads over the web-size threshold are re-encoded in the browser, and Space photos do not use the optimizer')
