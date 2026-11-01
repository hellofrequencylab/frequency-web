#!/usr/bin/env node
// SCAN-1180: Stickers and Top friends are retired from Space and profile layouts. Fails when either is still
// offered in a picker or rendered. Run on main it fails: both blocks are registered and the sticker layer renders.
import { existsSync, readFileSync } from 'node:fs'

const read = (f) => (existsSync(f) ? readFileSync(f, 'utf8') : '')
const bad = []
if (/id:\s*'topfriends'/.test(read('lib/entity-blocks/registry.ts'))) bad.push('Top friends is still in the block registry')
if (existsSync('components/spotlight/sticker-layer.tsx')) bad.push('the sticker layer still exists')
if (/SpotlightStickerLayer/.test(read('components/spotlight/spotlight-shell.tsx'))) bad.push('the Spotlight page still renders stickers')
if (/Stickers|Top Friends/.test(read('components/admin/modules/personal-appearance-module.tsx'))) bad.push('the appearance panel still offers stickers or top friends')
if (/'topfriends'/.test(read('lib/entity-blocks/layout.ts'))) bad.push('a member starter layout still places Top friends')
if (bad.length) {
  console.error(bad.join('\n'))
  process.exit(1)
}
console.log('ok')
