#!/usr/bin/env node
// LIVE-1562 probe: /system tells the whole system in one story. Twelve sections in ship order, the shared
// wired-in list, both fee facts beside the price, no price literal (every figure reads the pricing input),
// no em dash, no parked term, no time claim, and the page is reachable (sitemap, footer, SEO table).
import { readFileSync, existsSync } from 'node:fs'

const body = readFileSync('components/frequency/site/pages/system/frequency-system.tsx', 'utf8')
const data = readFileSync('components/frequency/site/pages/system/system-data.ts', 'utf8')
const route = 'app/(marketing)/system/page.tsx'
const bad = []

if (!existsSync(route)) bad.push(`${route} is missing`)
else {
  const page = readFileSync(route, 'utf8')
  if (/className="[^"]*\b(p[xytblr]?-\d|max-w-|bg-|text-[a-z]|grid|flex|gap-)/.test(page)) bad.push('the route hand-rolls layout classes')
  if (!page.includes('FREQUENCY_PAGE_SEO.system') || !page.includes('loadPricingInput')) bad.push('the route does not read the SEO table and the pricing input')
}

const sections = ['01 Hero', '02 Pain', '03 Design once', '04 The hub', '05 One week', '06 Guided setup', '07 The kit', '08 What is inside', '09 What the theme touches', '10 Demo Spaces', '11 What it costs', '12 Questions']
for (const s of sections) if (!body.includes(`data-screen-label="${s}"`)) bad.push(`section ${s} is missing`)
if (!body.includes("from '../shared/wired-in'") || !body.includes('<WiredIn')) bad.push('the page does not render the shared wired-in list')
if (!/KeepGoing/.test(body)) bad.push('no closing band')

// Both fee facts, read from the input, never typed. The only literal dollar sign allowed is none.
if (!body.includes('No cut of your own sales') || !body.includes('on a customer the network introduces')) bad.push('the price section does not state both fee facts')
if (!body.includes('PLAN_STORY.plusProcessing')) bad.push('the 0% fact lost its card-processing clause')
for (const [file, src] of [['frequency-system.tsx', body], ['system-data.ts', data]]) {
  if (/\$\d/.test(src)) bad.push(`${file} types a price literal`)
  if (/[—–]/.test(src)) bad.push(`${file} has an em or en dash`)
  if (/\b(2|two) hours\b/i.test(src)) bad.push(`${file} makes the time claim before it is measured`)
  if (/\b(SMS|text message|iOS|Android|guarantee|boost|transform)\b/.test(src)) bad.push(`${file} uses a parked or banned term`)
}
if (!data.includes('plus card processing')) bad.push('the hero trust line lost its card-processing clause')
if (!data.includes('Demo Space')) bad.push('the demo Spaces are not labeled as demos')

// Reachable: the sitemap, the footer and the SEO table all know the page.
if (!readFileSync('app/sitemap.ts', 'utf8').includes('/system`')) bad.push('sitemap does not list /system')
if (!/system: '\/system'/.test(readFileSync('lib/frequency/site-nav.ts', 'utf8'))) bad.push('site-nav has no ROUTES.system')
if (!/system: \{\n\s+path: '\/system'/.test(readFileSync('lib/seo/frequency-pages.ts', 'utf8'))) bad.push('the SEO table has no system entry')

if (bad.length) {
  console.error('LIVE-1562 probe failed:\n- ' + bad.join('\n- '))
  process.exit(1)
}
console.log('LIVE-1562: /system tells the whole system in one story')
