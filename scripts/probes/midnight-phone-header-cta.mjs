#!/usr/bin/env node
// LIVE-2310: on a phone the Midnight Site header keeps its logo and name, and the header button moves into the
// menu (owner ruling 2026-11-16, "Move the button into the menu"). Fails when the phone rule (max-width:939px, the
// width below which the menu shows) does not hide the header's own button, or does not show the menu's copy of it.
// Run on main it fails: the button stays in the header and covers the logo mark at 390 and 360.
import { readFileSync } from 'node:fs'

const css = readFileSync('components/sites/midnight-css.ts', 'utf8')
const phone = [...css.matchAll(/@media \(max-width:939px\)\{(.*)\}\s*$/gm)].map((m) => m[1]).join('\n')
const bad = []
if (!/\$\{N\} \.hs-header-actions>\.hs-btn\{display:none\}/.test(phone)) bad.push('the phone header still shows its button beside the logo')
if (!/\$\{N\} \.hs-menu-panel a\[data-cta\]\{display:flex/.test(phone)) bad.push('the phone menu does not show the header button')
if (bad.length) {
  console.error(bad.join('\n'))
  process.exit(1)
}
console.log('ok')
