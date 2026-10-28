#!/usr/bin/env node
// LIVE-1383: the Nocturne feature page lets a visitor pick a niche kit and see all three surfaces change.
import { readFileSync } from 'node:fs'

const r = (f) => readFileSync(f, 'utf8')
const bad = []
const page = r('components/frequency/site/pages/themes/frequency-midnight.tsx')
if (!page.includes('NOCTURNE_KITS.map')) bad.push('the kit choices are not read from the Nocturne kit data')
if (!page.includes('setKitId')) bad.push('the feature page has no kit picker')
for (const s of ['Spotlight', 'Space', 'Website']) if (!page.includes(s)) bad.push(`the page does not show ${s}`)
if (/lib\/sites\/kits/.test(page)) bad.push('the page client component imports kit code')

if (bad.length) { console.error(bad.join('\n')); process.exit(1) }
console.log('midnight-kit-picker: ok')
