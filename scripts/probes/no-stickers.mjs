#!/usr/bin/env node
// SCAN-1180: Stickers are retired from member Spotlight pages. Fails when the sticker layer still renders or the
// appearance panel still offers it. Run on main it fails: the shell renders SpotlightStickerLayer.
import { existsSync, readFileSync } from 'node:fs'

const read = (f) => (existsSync(f) ? readFileSync(f, 'utf8') : '')
const bad = []
if (existsSync('components/spotlight/sticker-layer.tsx')) bad.push('the sticker layer still exists')
if (/SpotlightStickerLayer/.test(read('components/spotlight/spotlight-shell.tsx'))) bad.push('the Spotlight page still renders stickers')
if (/Stickers/.test(read('components/admin/modules/personal-appearance-module.tsx'))) bad.push('the appearance panel still offers stickers')
if (bad.length) {
  console.error(bad.join('\n'))
  process.exit(1)
}
console.log('ok')
