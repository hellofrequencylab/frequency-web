#!/usr/bin/env node
// LIVE-2373 probe: Temple Kit's template defaults carry no invented price, date, capacity, host, town or named testimonial.
import { readFileSync } from 'node:fs'
const src = readFileSync(new URL('../../../lib/sites/temple-kit-home.ts', import.meta.url), 'utf8').split('\n').filter((l) => !l.trim().startsWith('//')).join('\n')
const BAD = [
  [/\$[0-9]/, 'a price'],
  [/\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun) [0-9]{1,2} (Oct|Nov|Dec)\b|month: '(Nov|Dec)'|from Jan/, 'a fixed date'],
  [/capacity: '[^']+'/, 'a room capacity'],
  [/stars: '[1-9]'/, 'a rating'],
  [/Ojai|Ines Aldana|Maya and Theo|Ruth K\.|Daniel O\./, 'a sample house fact'],
  [/48[- ]hour/, 'a hold promise'],
  [/(?<!-)\bfree\b/i, 'a free promise'],
]
for (const [re, what] of BAD) if (re.test(src)) { console.error(`LIVE-2373: Temple Kit's template still invents ${what}`); process.exit(1) }
console.log("LIVE-2373: Temple Kit's template invents no price, date, capacity, host or testimonial")
