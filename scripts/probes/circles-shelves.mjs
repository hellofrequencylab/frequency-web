#!/usr/bin/env node
// LIVE-1020 (ADR-1841): the Circles index is shelves by who runs them, community before business,
// with a near-you shelf, a section index and a featured Business strip.
import { readFileSync, existsSync } from 'node:fs'

const r = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : '')
const bad = []
const body = r('components/frequency/members/circles/circles-body.tsx')
for (const id of ['near-you', 'starters', 'gathering', 'frequency', 'community', 'business']) {
  if (!body.includes(`id="${id}"`)) bad.push(`no ${id} shelf`)
}
if (body.indexOf('id="community"') > body.indexOf('id="business"')) bad.push('business circles sit above community circles')
if (!/<ShelfIndex/.test(body)) bad.push('no section index')
if (!/<FeaturedBusinessStrip/.test(body)) bad.push('no featured Business strip')
if (/Popular/.test(body)) bad.push('a shelf is labeled Popular')
if (!/export function circleKind/.test(r('lib/circles/kind.ts'))) bad.push('no circleKind classifier')
if (!/circleKind\(/.test(r('lib/circles/index-data.ts'))) bad.push('cards carry no kind')
if (bad.length) {
  console.error('LIVE-1020: ' + bad.join('; '))
  process.exit(1)
}
