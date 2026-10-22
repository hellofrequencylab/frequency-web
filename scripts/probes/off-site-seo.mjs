#!/usr/bin/env node
// Off-site SEO worksheet probes (docs/marketing/off-site-seo-worksheet.md). One row per check:
//   node scripts/probes/off-site-seo.mjs <profiles|footer|verification|indexnow|get-found>
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const r = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : '')
const walk = (d) =>
  existsSync(d) ? readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)])) : []
const check = process.argv[2]
const bad = []

if (check === 'profiles') {
  // Only the SOCIAL_PROFILES array counts; the label map beside it names hosts without listing a profile.
  const site = (r('lib/site.ts').match(/export const SOCIAL_PROFILES = \[[\s\S]*?\]/) ?? [''])[0]
  for (const host of ['linkedin.com', 'youtube.com', 'facebook.com']) {
    if (!site.includes(host)) bad.push(`SOCIAL_PROFILES in lib/site.ts has no ${host} profile`)
  }
} else if (check === 'footer') {
  if (!/SOCIAL_PROFILES/.test(r('components/layout/marketing-footer.tsx'))) bad.push('the marketing footer does not link the brand profiles')
} else if (check === 'verification') {
  if (!/verification/.test(r('app/layout.tsx'))) bad.push('app/layout.tsx sets no search engine verification tags')
  if (!/GOOGLE_SITE_VERIFICATION/.test(r('.env.example'))) bad.push('.env.example does not list GOOGLE_SITE_VERIFICATION')
} else if (check === 'indexnow') {
  const hit = [...walk('lib'), ...walk('app')].some((f) => /\.(ts|tsx)$/.test(f) && /indexnow/i.test(r(f)))
  if (!hit) bad.push('nothing in lib or app pings IndexNow when an event or Space page is published')
} else if (check === 'get-found') {
  if (!walk('content/help').some((f) => /get-found/.test(f))) bad.push('no help article on getting found in search under content/help')
} else {
  console.error('usage: off-site-seo.mjs <profiles|footer|verification|indexnow|get-found>')
  process.exit(2)
}
if (bad.length) {
  console.error(`off-site-seo ${check} probe failed:\n- ` + bad.join('\n- '))
  process.exit(1)
}
console.log(`off-site-seo ${check}: ok`)
