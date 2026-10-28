#!/usr/bin/env node
// LIVE-1382: the Midnight feature page opens a live preview of a static sample Midnight site.
import { readFileSync } from 'node:fs'

const r = (f) => readFileSync(f, 'utf8')
const bad = []
const demo = r('components/sites/midnight-demo.tsx')
if (!demo.includes("midnightKit('coaches')")) bad.push('the demo is no longer built from the coaches kit')
if (/supabase|cookies\(/.test(demo)) bad.push('the demo reaches for request data; it must stay static and anonymous')
const route = r('app/(demo)/themes/nocturne/demo/page.tsx')
if (!route.includes('index: false')) bad.push('the demo route is not kept out of search')
if (!route.includes('MIDNIGHT_FONT_CLASS')) bad.push('the demo route does not load the Midnight faces')
if (!r('components/frequency/site/pages/themes/frequency-midnight.tsx').includes('<MidnightPreview')) bad.push('the feature page has no live preview button')
if (!r('components/frequency/site/pages/themes/midnight-preview.tsx').includes('/themes/nocturne/demo')) bad.push('the preview does not point at the demo route')

if (bad.length) { console.error(bad.join('\n')); process.exit(1) }
console.log('midnight-demo: ok')
