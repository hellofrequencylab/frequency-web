#!/usr/bin/env node
// LIVE-1083: the Feed composer is a card with a prompt row and labelled actions, not an icon-only pill.
import { readFileSync } from 'node:fs'

const body = readFileSync('components/frequency/members/feed/islands.tsx', 'utf8')
const bad = []
if (!body.includes('fa-composer-top')) bad.push('no prompt row')
if (!body.includes('fa-composer-acts')) bad.push('no action row')
for (const l of ['Photo', 'Event', 'Log practice', 'Listing']) {
  if (!new RegExp(`</?FqIcon[^>]*/>\\s*${l}`).test(body)) bad.push(`action "${l}" has no visible label`)
}
if (bad.length) {
  console.error(bad.join('\n'))
  process.exit(1)
}
console.log('feed composer card ok')
