#!/usr/bin/env node
// LIVE-1900: /themes/temple shows the Temple kit's Space page as a picture in the hero switcher and the four surfaces.
// Fails on main (Space is an on-the-way frame).
import { readFileSync } from 'node:fs'

const bad = []
const page = readFileSync('components/frequency/site/pages/themes/frequency-temple.tsx', 'utf8')
const data = readFileSync('lib/themes/temple-feature-data.ts', 'utf8')
if (page.includes('TempleSoon')) bad.push('the page still draws an on-the-way frame')
if (!/id: 'space'[^}]*shot: 'spacedesk'/.test(data)) bad.push('the space surface has no picture')
if (bad.length) {
  console.error(bad.join('\n'))
  process.exit(1)
}
console.log('temple-theme-page-space: ok')
