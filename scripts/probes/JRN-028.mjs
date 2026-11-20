#!/usr/bin/env node
// JRN-028 (Daniel 2026-11-20): /discover/journeys/the-business-of-community-101 showed the generic Journey
// preview, not the designed sales page. A Journey with a hand-built sales page must send visitors there,
// and the hero's "By <guide>" link must keep the hero's light ink instead of the kit's dark link colour.
import { readFileSync } from 'node:fs'

const bad = []
const page = readFileSync('app/discover/journeys/[slug]/page.tsx', 'utf8')
const tracks = readFileSync('lib/courses/tracks.ts', 'utf8')
const css = readFileSync('app/themes/frequency/site-discover.css', 'utf8')

if (!/'the-business-of-community-101': '\/courses\/business-of-community'/.test(tracks))
  bad.push('The Business of Community 101 no longer maps to its sales page in COURSE_SALES_PAGES')
const body = page.slice(page.indexOf('export default async function'))
const redirectAt = body.search(/if \(sales\) permanentRedirect\(sales\)/)
const salesAt = body.search(/const sales = salesPageFor\(slug\)/)
const renderAt = body.indexOf('<FrequencyJourney')
if (salesAt < 0 || redirectAt < 0) bad.push('the public Journey page does not redirect a Journey with a sales page')
else if (redirectAt > renderAt || salesAt > redirectAt) bad.push('the sales-page redirect runs after the preview renders')
if (!css.includes('[data-design="frequency"] [data-kit="site"] .dd-facts a{color:inherit;'))
  bad.push('the hero fact-line link (By <guide>) does not inherit the hero ink, so it is near invisible on the photo')

if (bad.length) {
  console.error('JRN-028 probe failed:\n- ' + bad.join('\n- '))
  process.exit(1)
}
console.log('JRN-028 ok')
