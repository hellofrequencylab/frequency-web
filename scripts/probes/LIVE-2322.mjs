#!/usr/bin/env node
// LIVE-2322: House of Fates' Book buttons go to the Space's booking page (/book) now that the Space has saved
// weekly hours, not to the contact page. Checks the consequence in the site seed (lib/sites/house-of-fates-site.ts):
//   1. HOF_BOOKING_LIVE is true.
//   2. Every Book seam reads it: the block buttons, the footer, the header menu and the header button.
// The LIVE saved site only changes when the seed is re-applied (scripts/seed-house-of-fates-update.mts); this
// probe measures the seed, which is what the code side of the row can change.
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('../../lib/sites/house-of-fates-site.ts', import.meta.url), 'utf8')
const fails = []

if (!/export const HOF_BOOKING_LIVE = true\b/.test(src)) fails.push('HOF_BOOKING_LIVE is not true, so every Book button still opens the contact page')
const seams = [
  [/const BOOK = HOF_BOOKING_LIVE \? '~\/book'/, 'the block Book buttons'],
  [/path\(HOF_BOOKING_LIVE \? 'book'/, 'the footer Book a session link'],
  [/key: HOF_BOOKING_LIVE \? 'feature:book'/, 'the header menu Book item'],
  [/href: HOF_BOOKING_LIVE \? '\/book'/, 'the header Book a free consultation button'],
]
for (const [re, name] of seams) if (!re.test(src)) fails.push(`${name} no longer follow HOF_BOOKING_LIVE`)

if (fails.length) {
  console.error(`LIVE-2322 FAIL\n - ${fails.join('\n - ')}`)
  process.exit(1)
}
console.log('LIVE-2322 ok: the House of Fates seed sends every Book button to /book')
