#!/usr/bin/env node
// LIVE-1383: the Midnight feature page lets a visitor pick a niche kit and see all three surfaces change.
import { readFileSync } from 'node:fs'

const r = (f) => readFileSync(f, 'utf8')
const bad = []
const page = r('components/frequency/site/pages/themes/frequency-midnight.tsx')
if (!page.includes('<MidnightKitPicker')) bad.push('the feature page has no kit picker')
if (!page.includes('midnightKit(')) bad.push('the picker choices are not read from the Midnight kit data')
const picker = r('components/frequency/site/pages/themes/midnight-kit-picker.tsx')
for (const s of ['01 · Spotlight', '02 · Space', '03 · Website']) if (!picker.includes(s)) bad.push(`the picker does not show ${s}`)
if (picker.includes('lib/sites/kits')) bad.push('the picker client component imports kit code')

if (bad.length) { console.error(bad.join('\n')); process.exit(1) }
console.log('midnight-kit-picker: ok')
