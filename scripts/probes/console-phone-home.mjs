// LIVE-1166 probe: on a phone the console Home keeps its numbers above the fold: the stats go two to a row,
// the head's actions sit side by side as 48px targets, and the shortcut pills are one sideways row of 44px
// targets instead of a wrapping heap.
//
//   node scripts/probes/console-phone-home.mjs
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const css = readFileSync('app/themes/frequency/admin-pages.css', 'utf8')
const phone = css.slice(css.indexOf('THE PHONE HOME'))
assert.ok(phone.includes('@media (max-width:560px)'), 'the phone home block is gated at 560px')
assert.match(phone, /\.g4\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/, 'stats are two to a row')
assert.match(phone, /\.btn\{justify-content:center;min-height:48px\}/, 'head actions are 48px targets')
const links = readFileSync('components/spaces/manage-quick-links.tsx', 'utf8')
assert.match(links, /max-md:flex-nowrap max-md:overflow-x-auto/, 'the shortcut pills are one sideways row on a phone')
assert.match(links, /max-md:min-h-11/, 'each pill is a 44px target')
console.log('PASS console-phone-home')
