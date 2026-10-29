#!/usr/bin/env node
// LIVE-1804: /themes/network shows the Network kit's Space page and note email as real pictures, not "on the way".
// Twenty-six pictures under public/themes/network-kit/shots (<kit>-spacedesk.jpg and <kit>-email.jpg for the thirteen
// kits), the Space and Email surfaces reading them, and no placeholder frame left.
//
// Fails when a picture is missing, a surface has no picture, or the page still draws an "on the way" frame.
// Run on main it fails: none of the pictures exist.
import { existsSync, readFileSync } from 'node:fs'

const kits = ['general', 'networks', 'clubs', 'markets', 'hosts', 'creators', 'wellness', 'studios', 'nonprofits', 'schools', 'coaches', 'venues', 'faith']
const bad = []
for (const k of kits) for (const s of ['spacedesk', 'email']) if (!existsSync(`public/themes/network-kit/shots/${k}-${s}.jpg`)) bad.push(`missing ${k}-${s}.jpg`)
const data = readFileSync('lib/themes/network-feature-data.ts', 'utf8')
if (!/shot: 'spacedesk'/.test(data) || !/shot: 'email'/.test(data)) bad.push('the Space and Email surfaces have no picture')
if (/NetworkSoon/.test(readFileSync('components/frequency/site/pages/themes/network-preview.tsx', 'utf8'))) bad.push('the preview still draws an on-the-way frame')

if (bad.length) {
  console.error(bad.join('\n'))
  process.exit(1)
}
console.log('network-theme-surfaces: ok')
