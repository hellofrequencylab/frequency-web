#!/usr/bin/env node
// LIVE-1382: the Nocturne feature page shows a live, accent-aware preview of a static sample Nocturne site.
import { readFileSync } from 'node:fs'

const r = (f) => readFileSync(f, 'utf8')
const bad = []
const demo = r('components/sites/midnight-demo.tsx')
if (!demo.includes("midnightKit('coaches')")) bad.push('the demo is no longer built from the coaches kit')
if (/supabase|cookies\(/.test(demo)) bad.push('the demo reaches for request data; it must stay static and anonymous')
const route = r('app/(demo)/themes/nocturne/demo/page.tsx')
if (!route.includes('index: false')) bad.push('the demo route is not kept out of search')
if (!route.includes('MIDNIGHT_FONT_CLASS')) bad.push('the demo route does not load the Midnight faces')
const page = r('components/frequency/site/pages/themes/frequency-midnight.tsx')
if (!page.includes("SAMPLE_SITE = '/themes/nocturne/demo'")) bad.push('the feature page does not point at the demo route')
if (!page.includes('<iframe')) bad.push('the feature page has no live preview of the sample site')
if (!page.includes('nocturne-accent')) bad.push('the feature page does not send the chosen accent to the sample site')
if (!demo.includes('MidnightAccentFrame')) bad.push('the demo does not take its accent from the page')

if (bad.length) { console.error(bad.join('\n')); process.exit(1) }
console.log('midnight-demo: ok')
