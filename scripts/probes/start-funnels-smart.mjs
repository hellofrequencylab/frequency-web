#!/usr/bin/env node
// LIVE-2234: the venue, builder and resident funnels (/start/partner, /start/welcome, /start/event) read
// FlowWeb's invite params like /start/host does, and the link's attribution reaches the member.
//
// Fails when the local note stops naming the place an invite carried, when the /start/<flow> page stops
// mounting the link-reading chooser, when that chooser stops sending the params to captureLead or
// stops carrying the ids on to /join, or when finishing the induction stops copying the lead's funnel
// record onto the member.
// Run: node --experimental-strip-types --no-warnings --import ./scripts/probe-ts.mjs scripts/probes/start-funnels-smart.mjs
import { readFileSync } from 'node:fs'

const { parseFunnelContext, funnelLocalNote } = await import('../../lib/onboarding/funnel-context.ts')

const bad = []
const note = funnelLocalNote(parseFunnelContext(new URLSearchParams('persona=partner&region=orange-county&area=irvine&src=business_listings&utm_medium=founder_email')))
if (!note || !note.includes('Irvine')) bad.push(`the local note does not name the area: ${note}`)
if (!note || !note.includes('Daniel')) bad.push('a founder_email invite lost its founder line')
if (funnelLocalNote(parseFunnelContext({})) !== null) bad.push('a plain visit grew a local note')

const page = readFileSync('app/(marketing)/start/[flow]/page.tsx', 'utf8')
if (!/<SmartPersonaChooser\b/.test(page)) bad.push('/start/<flow> no longer mounts the link-reading chooser')

const chooser = readFileSync('components/frequency/site/pages/funnel/persona-chooser.tsx', 'utf8')
if (!/captureLead\(\{[^}]*funnel: funnel\?\.params/.test(chooser)) bad.push('the chooser no longer sends the link params to captureLead')
if (!/funnel\?\.query/.test(chooser)) bad.push('the chooser no longer carries the ids on to /join')

const induction = readFileSync('app/join/(induction)/actions.ts', 'utf8')
if (!/await stampFunnelFromLead\(/.test(induction)) bad.push('finishing the induction no longer stamps the funnel record on the member')

if (bad.length) {
  console.error(bad.join('\n'))
  process.exit(1)
}
console.log('start-funnels-smart: every /start funnel reads the invite, and its attribution reaches the member')
