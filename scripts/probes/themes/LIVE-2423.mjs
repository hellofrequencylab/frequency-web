#!/usr/bin/env node
// LIVE-2423 probe: Honey (id free-human) has a theme page that is in search, its four page pictures and a share card, and its
// Spotlight defaults coach instead of quoting the Free Human Movement brand. Reads the sources (no build).
import { existsSync, readFileSync } from 'node:fs'
const read = (p) => readFileSync(p, 'utf8')
const problems = []
const page = 'app/(marketing)/themes/free-human/page.tsx'
if (!existsSync(page)) problems.push('/themes/free-human has no page')
else {
  const src = read(page)
  if (/index:\s*false/.test(src)) problems.push('/themes/free-human is noindex')
  if (!src.includes('theme="free-human"')) problems.push('the Honey page does not draw the free-human feature')
}
if (!read('app/sitemap.ts').includes('/themes/free-human`')) problems.push('/themes/free-human is not in the sitemap')
if (!/'free-human':\s*\{/.test(read('lib/themes/theme-feature-data.ts'))) problems.push('THEME_FEATURES has no free-human entry')
for (const f of ['site', 'spot', 'spacedesk', 'email']) if (!existsSync(`public/brand/theme-pages/free-human/${f}.jpg`)) problems.push(`theme page picture ${f}.jpg is missing`)
const cards = read('lib/themes/share-cards.ts')
for (const id of ['free-human', 'mindless']) {
  if (!cards.includes(`card('${id}'`)) problems.push(`${id} has no share card entry`)
  if (!existsSync(`public/brand/theme-share/${id}.jpg`)) problems.push(`public/brand/theme-share/${id}.jpg is missing`)
}
if (/card\('mindless'[^\n]*yellow/.test(cards)) problems.push('the Mindless share card uses a yellow photo (share cards are pink, lilac or blue)')
const spot = read('lib/spotlight/free-human-content.ts')
for (const brand of ['Audrey', 'Free Human Movement']) if (spot.includes(brand)) problems.push(`Honey Spotlight defaults still say "${brand}"`)
if (problems.length) { console.error(problems.join('\n')); process.exit(1) }
console.log('LIVE-2423: Honey page, pictures, share cards and coaching Spotlight copy are in place')
