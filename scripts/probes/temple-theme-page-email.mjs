#!/usr/bin/env node
// LIVE-1897: /themes/temple shows the Temple kit's email picture (not an "on the way" frame) in the hero switcher and the four surfaces.
// Fails on main (email is a quiet frame).
import { readFileSync, existsSync } from 'node:fs'

const bad = []
const page = readFileSync('components/frequency/site/pages/themes/frequency-temple.tsx', 'utf8')
const data = readFileSync('lib/themes/temple-feature-data.ts', 'utf8')
if (!page.includes('<TempleMail')) bad.push('the page has no TempleMail')
if (!/id: 'email'[^}]*shot: 'email'/.test(data)) bad.push('the email surface has no picture')
if (!existsSync('public/themes/temple-kit/shots/general-email.jpg')) bad.push('no general-email.jpg')
if (bad.length) {
  console.error(bad.join('\n'))
  process.exit(1)
}
console.log('temple-theme-page-email: ok')
