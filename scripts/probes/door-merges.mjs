#!/usr/bin/env node
// LIVE-2093 probe: the /for doors are cut from 13 to 9 and /calm-down-fast is merged into /mindless.
// Each retired door and the retired guide answer with a permanent redirect to their survivor, the
// funnel registry no longer builds a door for them, and the sitemap no longer lists them.
import { existsSync, readFileSync } from 'node:fs'

const bad = []
const config = readFileSync('next.config.ts', 'utf8')
const sitemap = readFileSync('app/sitemap.ts', 'utf8')
const funnels = readFileSync('lib/marketing/funnel-config.ts', 'utf8')

const MERGES = [
  ['/for/creators', '/for/coaches-and-healers'],
  ['/for/wellness-and-retreats', '/for/studios'],
  ['/for/markets-and-festivals', '/for/event-hosts'],
  ['/for/schools-and-programs', '/for/clubs-and-groups'],
  ['/calm-down-fast', '/mindless'],
]
for (const [from, to] of MERGES) {
  const rule = new RegExp(`source: '${from}', destination: '${to}', permanent: true`)
  if (!rule.test(config)) bad.push(`${from} has no permanent redirect to ${to}`)
  if (sitemap.includes(`${from}'`) || sitemap.includes(`${from}\``)) bad.push(`the sitemap still lists ${from}`)
}
for (const slug of ['creators', 'wellness-and-retreats', 'markets-and-festivals', 'schools-and-programs']) {
  if (funnels.includes(`slug: '${slug}'`)) bad.push(`the funnel registry still builds the /for/${slug} door`)
}
const doors = (funnels.match(/^\s+slug: '/gm) ?? []).length
if (doors !== 9) bad.push(`the funnel registry builds ${doors} doors, not 9`)
if (existsSync('app/(marketing)/calm-down-fast/page.tsx')) bad.push('app/(marketing)/calm-down-fast still renders a page')

if (bad.length) {
  for (const m of bad) console.error(`LIVE-2093: ${m}`)
  process.exit(1)
}
console.log('LIVE-2093: nine /for doors, and /calm-down-fast merged into /mindless')
