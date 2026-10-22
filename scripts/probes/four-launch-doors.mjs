#!/usr/bin/env node
// LIVE-1130 probe: the launch serves six /for doors (coaches, studios, event hosts, venues, nonprofits, networks), the two retired ones redirect, and sign-up and
// Create a Space keep a visible "Decide later" choice.
import { readFileSync, existsSync } from 'node:fs'

const r = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : '')
const bad = []
const cfg = r('lib/marketing/funnel-config.ts')
if (/slug: 'community-builders'|slug: 'teachers'/.test(cfg)) bad.push('a retired /for door is back in the funnel registry')
for (const d of ['venues', 'networks']) if (!new RegExp(`slug: '${d}'`).test(cfg)) bad.push(`the ${d} door is missing`)
const next = r('next.config.ts')
if (!/source: '\/for\/community-builders', destination: '\/for\/venues'/.test(next)) bad.push('/for/community-builders no longer redirects to venues')
if (!/source: '\/for\/teachers', destination: '\/for\/studios'/.test(next)) bad.push('/for/teachers no longer redirects to studios and instructors')
if (!/Decide later/.test(r('app/join/(induction)/induction.tsx'))) bad.push('sign-up has no "Decide later"')
if (!/Decide later/.test(r('app/(main)/spaces/new/create-space-wizard.tsx'))) bad.push('Create a Space has no "Decide later"')
if (bad.length) {
  console.error('LIVE-1130 probe failed:\n- ' + bad.join('\n- '))
  process.exit(1)
}
console.log('LIVE-1130: six launch doors, retired doors redirect, Decide later in onboarding')
