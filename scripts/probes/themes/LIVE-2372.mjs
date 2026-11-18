#!/usr/bin/env node
// LIVE-2372 probe: Nocturne's template defaults carry no invented price, date, rating, take-up count, city or named testimonial.
import { readFileSync } from 'node:fs'
const src = readFileSync(new URL('../../../lib/sites/midnight-home.ts', import.meta.url), 'utf8').split('\n').filter((l) => !l.trim().startsWith('//')).join('\n')
const BAD = [
  [/\$[0-9]/, 'a price'],
  [/\b[0-9.]+ (from|·) [0-9,]+ reviews\b/, 'a rating'],
  [/[0-9]+ have taken it/, 'a take-up count'],
  [/\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun) [0-9]{1,2} (Oct|Nov|Dec)\b|month: '(Nov|Dec)'/, 'a fixed date'],
  [/Melbourne|Priya|Fieldwork|in 2018/, 'a sample house fact'],
  [/\bfree\b/i, 'a free promise'],
]
for (const [re, what] of BAD) if (re.test(src)) { console.error(`LIVE-2372: Nocturne's template still invents ${what}`); process.exit(1) }
console.log('LIVE-2372: Nocturne\'s template invents no price, date, rating, count, place or testimonial')
