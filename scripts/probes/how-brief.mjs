#!/usr/bin/env node
// LIVE-2323: /how ships as a link-only, noindex brief with anonymous engagement tracking.
// Fails when the page becomes indexable, enters the sitemap or nav, leaks an unrendered {{hole}},
// loses its beacon, or an event the tracker sends is missing from the analytics registry.
import { readFileSync, existsSync } from 'node:fs'

const bad = []
const page = readFileSync('app/(brief)/how/page.tsx', 'utf8')
if (!/index:\s*false/.test(page) || !/follow:\s*false/.test(page)) bad.push('/how no longer sets robots index:false, follow:false')
for (const f of ['app/sitemap.ts', 'lib/frequency/site-nav.ts']) {
  if (existsSync(f) && /['"`]\/how['"`?]/.test(readFileSync(f, 'utf8'))) bad.push(`/how is listed in ${f}`)
}
const html = readFileSync('app/(brief)/how/brief-html.ts', 'utf8').replace(/data-s=\\"[^"\\]*(?:\\.[^"\\]*)*\\"/g, '')
if (/\{\{/.test(html)) bad.push('brief-html.ts renders a raw {{hole}} as text')
if (!existsSync('app/api/how/beacon/route.ts')) bad.push('the /api/how/beacon intake is gone')
const events = readFileSync('lib/analytics/events.ts', 'utf8')
const names = readFileSync('lib/how/brief-events.ts', 'utf8').match(/'how\.[a-z_]+'/g) ?? []
for (const n of new Set(names)) if (!events.includes(`name: ${n}`)) bad.push(`${n} is not in ANALYTICS_EVENTS`)
if (names.length < 11) bad.push(`expected 11 how.* events, found ${new Set(names).size}`)

if (bad.length) { console.error(bad.join('\n')); process.exit(1) }
console.log('how-brief: /how is noindex, unlisted, fully rendered, and every event it sends is registered')
