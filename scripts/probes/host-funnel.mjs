#!/usr/bin/env node
// LIVE-2233: /start/host is the smart host funnel FlowWeb's invites land on.
//
// Fails when the page is gone, when the exact link FlowWeb builds (funnelOf() in hellofrequencylab/flowweb)
// stops reading back as the place, the Channel, the source and the utm tags, when the headline stops
// naming the area, or when the lead action stops storing the link's params on the contact.
// Run: node --experimental-strip-types --no-warnings --import ./scripts/probe-ts.mjs scripts/probes/host-funnel.mjs
import { existsSync, readFileSync } from 'node:fs'
import assert from 'node:assert/strict'

const { parseFunnelContext, funnelRecord, hostFunnelCopy } = await import('../../lib/onboarding/funnel-context.ts')

const bad = []
const page = 'app/(marketing)/start/host/page.tsx'
if (!existsSync(page)) bad.push(`${page} is missing`)

const link = new URLSearchParams(
  'persona=practitioner&region=inland-north&area=temecula&channel=movement&src=creator_profiles&utm_source=flowweb&utm_medium=founder_email&utm_campaign=inland-north',
)
const ctx = parseFunnelContext(link)
try {
  assert.deepEqual(funnelRecord(ctx), {
    persona: 'practitioner',
    region: 'inland-north',
    area: 'temecula',
    channel: 'movement',
    src: 'creator_profiles',
    utm_source: 'flowweb',
    utm_medium: 'founder_email',
    utm_campaign: 'inland-north',
  })
} catch (e) {
  bad.push(`the FlowWeb link no longer reads back whole:\n${e.message}`)
}
const copy = hostFunnelCopy(ctx)
if (copy.headline !== 'Start a Circle in Temecula.') bad.push(`headline does not name the area: ${copy.headline}`)
if (!copy.founderLine) bad.push('a founder_email invite lost its founder line')

const action = readFileSync('app/(marketing)/start/actions.ts', 'utf8')
if (!/parseFunnelContext\(input\.funnel\)/.test(action)) bad.push('captureLead no longer re-reads the link params on the server')
if (!/\bfunnel,\s*lead_source:/.test(action)) bad.push('captureLead no longer stores the funnel record and lead source on the contact')

if (bad.length) {
  console.error(bad.join('\n'))
  process.exit(1)
}
console.log('host-funnel: /start/host reads the FlowWeb link, speaks to Temecula, and stores every param on the lead')
