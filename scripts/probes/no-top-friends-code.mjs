#!/usr/bin/env node
// SCAN-1182: the Top friends code is deleted. Fails when the reader, the Spotlight block type or the appearance panel
// section is still in the tree. Run on main it fails: lib/spotlight/top-friends.ts exists.
import { existsSync, readFileSync } from 'node:fs'

const read = (f) => (existsSync(f) ? readFileSync(f, 'utf8') : '')
const bad = []
if (existsSync('lib/spotlight/top-friends.ts')) bad.push('the Top friends reader and writers still exist')
if (/'topfriends'/.test(read('lib/spotlight/blocks/schema.ts'))) bad.push('the Spotlight block type still names topfriends')
if (/Top Friends/.test(read('components/admin/modules/personal-appearance-module.tsx'))) bad.push('the appearance panel still offers Top friends')
if (bad.length) {
  console.error(bad.join('\n'))
  process.exit(1)
}
console.log('ok')
