#!/usr/bin/env node
// LIVE-1272 probe: a Space placard lands on the Space's own page with the check-in featured, and the
// CyberUnicorn console can write a tag for any page. Fails if the /n page stops sending a Space check-in
// to the Space page, if either Space page (member or public) stops mounting the featured check-in box,
// or if the console loses its "Any page" tag (a managed /q/ code with a 7-character slug, the length
// CyberUnicorn OS accepts).
import { readFileSync, existsSync } from 'node:fs'

const r = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : '')
const bad = []
const node = r('app/(main)/n/[nodeId]/page.tsx')
if (!/node\.kind === 'checkin'/.test(node) || !/redirect\(spaceCheckinHref\(/.test(node)) bad.push('the /n page no longer sends a Space check-in to the Space page')
if (!/<FeaturedCheckin /.test(r('app/(main)/spaces/[slug]/(profile)/layout.tsx'))) bad.push('the member Space page does not show the featured check-in')
if (!/<FeaturedCheckin /.test(r('app/(public)/spaces/[slug]/page.tsx'))) bad.push('the public Space page does not show the featured check-in')
if (!/<ClaimButton /.test(r('components/spaces/featured-checkin.tsx'))) bad.push('the featured check-in has no claim button')
const actions = r('lib/devices/tag-actions.ts')
if (!/export async function startPageTag\(/.test(actions) || !/generateSlug\(7\)/.test(actions)) bad.push('the console cannot make a page tag link the Unicorn will write')
const consoleSrc = r('components/spaces/loyalty/cyberunicorn-console.tsx')
if (!/startPageTag\(/.test(consoleSrc) || !/Any page/.test(consoleSrc)) bad.push('the console has no "Any page" tag')
if (bad.length) {
  console.error('LIVE-1272 probe failed:\n- ' + bad.join('\n- '))
  process.exit(1)
}
console.log('LIVE-1272: placards land on the Space page, and the console tags any page')
