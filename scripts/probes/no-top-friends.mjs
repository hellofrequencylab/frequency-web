#!/usr/bin/env node
// SCAN-1181: Top friends is no longer offered or placed on Space layouts and member profiles. Fails when the block
// is still in the registry or a member starter layout, or the profile modules still render it. Run on main it fails.
import { existsSync, readFileSync } from 'node:fs'

const read = (f) => (existsSync(f) ? readFileSync(f, 'utf8') : '')
const bad = []
if (/id:\s*'topfriends'/.test(read('lib/entity-blocks/registry.ts'))) bad.push('Top friends is still in the block registry')
if (/'topfriends'/.test(read('lib/entity-blocks/layout.ts'))) bad.push('a member starter layout still places Top friends')
if (/topfriends/.test(read('components/widgets/member-profile/member-profile-modules.tsx'))) bad.push('the profile modules still render Top friends')
if (bad.length) {
  console.error(bad.join('\n'))
  process.exit(1)
}
console.log('ok')
