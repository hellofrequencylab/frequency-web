#!/usr/bin/env node
// LIVE-1130 probe: the launch serves four /for doors, the two retired ones redirect, and sign-up and
// Create a Space keep a visible "Decide later" choice.
import { readFileSync, existsSync } from 'node:fs'

const r = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : '')
const bad = []
const cfg = r('lib/marketing/funnel-config.ts')
if (/slug: 'community-builders'|slug: 'teachers'/.test(cfg)) bad.push('a retired /for door is back in the funnel registry')
const next = r('next.config.ts')
if (!/source: '\/for\/community-builders', destination: '\/for\/event-hosts'/.test(next)) bad.push('/for/community-builders no longer redirects to event hosts')
if (!/source: '\/for\/teachers', destination: '\/for\/coaches-and-healers'/.test(next)) bad.push('/for/teachers no longer redirects to coaches and healers')
if (!/Decide later/.test(r('app/join/(induction)/induction.tsx'))) bad.push('sign-up has no "Decide later"')
if (!/Decide later/.test(r('app/(main)/spaces/new/create-space-wizard.tsx'))) bad.push('Create a Space has no "Decide later"')
if (bad.length) {
  console.error('LIVE-1130 probe failed:\n- ' + bad.join('\n- '))
  process.exit(1)
}
console.log('LIVE-1130: four launch doors, retired doors redirect, Decide later in onboarding')
