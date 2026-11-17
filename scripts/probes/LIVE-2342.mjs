#!/usr/bin/env node
// LIVE-2342: the member left rail's first layer is the owner's list, in the owner's order (2026-11-17:
// "I want to see this on the left: Around You, Events, Circles, Spaces, Messages, Marketplace, Members").
// Reads the one place the rail draws from (FQ_SHORTCUTS); the desktop rail and the phone drawer both map it.
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('../../components/frequency/members/shell/nav.ts', import.meta.url), 'utf8')
const start = src.indexOf('export const FQ_SHORTCUTS')
const block = start >= 0 ? src.slice(start, src.indexOf('\n]\n', start)) : ''
const rows = [...block.matchAll(/label: '([^']+)', sub: '', href: '([^']+)'/g)].map((m) => `${m[1]} ${m[2]}`)
const want = [
  'Around You /nearby',
  'Events /events',
  'Circles /circles',
  'Business Spaces /spaces/directory',
  'Messages /messages',
  'Marketplace /marketplace',
  'Members /network',
]
if (JSON.stringify(rows) !== JSON.stringify(want)) {
  console.error(`LIVE-2342 FAIL: the left rail reads\n  ${rows.join('\n  ')}\nwant\n  ${want.join('\n  ')}`)
  process.exit(1)
}
console.log('LIVE-2342 ok: the left rail is Around You, Events, Circles, Business Spaces, Messages, Marketplace, Members')
