#!/usr/bin/env node
// LIVE-1381: a Space page on Midnight wears the Midnight display and body faces.
import { readFileSync } from 'node:fs'

const r = (f) => readFileSync(f, 'utf8')
const bad = []
const faces = r('lib/theme/site-faces.ts')
if (!/SiteFacesId =[^\n]*'midnight'/.test(faces)) bad.push("SiteFacesId has no 'midnight'")
if (!faces.includes('Bodoni+Moda')) bad.push('the Midnight face sheet does not load Bodoni Moda')
if (!/theme\s*===\s*'midnight'/.test(r('lib/theme/site-style.ts'))) bad.push('spacePageSiteFaces never answers midnight')
if (!r('app/themes/frequency/space-page.css').includes('[data-space-fonts="midnight"]')) bad.push('space-page.css has no midnight face rule')

if (bad.length) { console.error(bad.join('\n')); process.exit(1) }
console.log('midnight-space-faces: ok')
