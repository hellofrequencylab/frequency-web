// LIVE-2090: the public header is Discover + For Spaces + plain links with one Get started button, the footer
// folds behind "More from Frequency", and the signed-in app carries no sales row.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { loadProbeModule } from '../lib/probe-module.mjs'

const legal = loadProbeModule('lib/nav/legal-links.ts')
const nav = loadProbeModule('lib/frequency/site-nav.ts', { '@/lib/nav/legal-links': legal })
assert.deepEqual(nav.WING_MENUS.map((m) => m.label), ['Discover', 'For Spaces'])
assert.deepEqual(nav.DIRECT_LINKS.map((l) => l.label), ['Business Spaces', 'Pricing', 'Help'])
const doors = nav.WING_MENUS.find((m) => m.key === 'spaces').cols.flatMap((c) => c.links.map((l) => l.href))
for (const d of ['/for/coaches-and-healers', '/for/studios', '/for/event-hosts', '/for/venues', '/for/nonprofits', '/for/networks', '/for']) assert.ok(doors.includes(d), `For Spaces carries ${d}`)

const header = readFileSync('components/frequency/site/shell/site-header.tsx', 'utf8')
assert.ok(!header.includes('p-only') && !header.includes('SIDE_CTA'), 'one Get started button, not the side pair')
assert.ok(!header.includes('FeaturesPanel') && !header.includes('FEATURE_JOURNEYS'), 'the Features mega menu is retired')
const footer = readFileSync('components/frequency/site/shell/site-footer.tsx', 'utf8')
assert.ok(footer.includes('More from Frequency') && footer.includes('<details'), 'the footer folds behind More from Frequency')

const member = readFileSync('components/frequency/members/shell/nav.ts', 'utf8')
const siteLinks = member.slice(member.indexOf('export const FQ_SITE_LINKS'), member.indexOf(']\n', member.indexOf('export const FQ_SITE_LINKS')))
for (const sales of ['For people', 'For spaces', 'Features', 'Vision']) assert.ok(!siteLinks.includes(`'${sales}'`), `no ${sales} sales link in the signed-in menu`)
console.log('LIVE-2090: Discover and For Spaces header, folded footer, no sales row in the app')
