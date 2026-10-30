#!/usr/bin/env node
// LIVE-1938: the Setup list has a "Publish a page for one offer" item, and the page it opens is seeded from the Space's own offering.
import { existsSync, readFileSync } from 'node:fs'
const bad = []
if (!existsSync('lib/page-editor/templates/space-offer.ts')) bad.push('the offer page starter is gone')
if (!existsSync('app/(main)/spaces/[slug]/manage/offer/page.tsx')) bad.push('the offer page starter route is gone')
if (!readFileSync('lib/launch/setup-items.ts', 'utf8').includes("'m-offerpage'")) bad.push('the Setup item is gone')
if (!readFileSync('app/(main)/spaces/[slug]/manage/layout/actions.ts', 'utf8').includes('startOfferPage')) bad.push('the start action is gone')
if (bad.length) {
  console.error(bad.join('\n'))
  process.exit(1)
}
console.log('launch offer page: ok')
