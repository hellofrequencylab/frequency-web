// LIVE-1165 probe: on a phone the console is one 60px top bar, a floating bottom bar and a More sheet, not the
// desktop sidebar folded into four stacked bands above the page.
//
//   node scripts/probes/console-phone-shell.mjs
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const css = readFileSync('app/themes/frequency/admin-shell.css', 'utf8')
const phone = css.slice(css.indexOf('THE PHONE CONSOLE'))
assert.ok(phone.includes('@media (max-width:960px)'), 'the phone console block is gated at 960px')
assert.match(phone, /\.ad-side\{display:none\}/, 'the sidebar steps aside under 960px')
assert.match(phone, /\.ad-tabbar\{[^}]*position:fixed/, 'the bottom bar is fixed')
assert.match(phone, /\.ad-top\{height:60px/, 'the top bar is one 60px row')
assert.match(phone, /\.ad-pm-row\{[^}]*min-height:48px/, 'More rows are 48px targets')
assert.match(phone, /--tab-bar-h/, 'the chat launcher and toasts clear the bar through the lane tokens')

const nav = readFileSync('components/frequency/admin/admin-nav.tsx', 'utf8')
assert.match(nav, /export function AdminPhoneBar/, 'AdminPhoneBar exists')
assert.match(nav, /export function AdminPhoneStrip/, 'the section strip is its own piece')
const shell = readFileSync('components/frequency/admin/admin-shell.tsx', 'utf8')
assert.match(shell, /<AdminPhoneBar /, 'the shell draws the phone bar')
const model = readFileSync('components/frequency/admin/nav-model.ts', 'utf8')
assert.match(model, /export function phoneSlots/, 'the bar slots come from one pure helper')
console.log('PASS console-phone-shell')
