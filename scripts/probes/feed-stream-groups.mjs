#!/usr/bin/env node
// LIVE-1082: the Feed post stream is grouped into meaningful shelves, not one flat interleave.
import { readFileSync } from 'node:fs'

const body = readFileSync('components/frequency/members/feed/posts.tsx', 'utf8')
const bad = []
for (const t of ['From your Circles', 'From your people', 'Worth a look', 'Around the community']) {
  if (!body.includes(t)) bad.push(`no "${t}" shelf`)
}
if (!/<details/.test(body)) bad.push('older posts are not tucked behind a Show more')
if (!/StreamShelf/.test(body)) bad.push('no StreamShelf')
if (bad.length) {
  console.error(bad.join('\n'))
  process.exit(1)
}
console.log('feed stream groups ok')
