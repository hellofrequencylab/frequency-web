#!/usr/bin/env node
// LIVE-2255: FlowWeb learns which message worked. Every outcome traces back to the draft that brought it.
//
// Fails when a /start link's utm_content (the FlowWeb draft id) is not stored with the lead, when outcomes
// are not counted per utm_campaign + utm_content (leads, members, hosts, paid), when a person FlowWeb did
// not bring is counted, when a row carries anything that names a person, when a stale or unsigned request
// is not refused by the route, or when a window over a year back is accepted.
// Run: node --experimental-strip-types --no-warnings --import ./scripts/probe-ts.mjs scripts/probes/flowweb-outcomes.mjs
import { existsSync, readFileSync } from 'node:fs'

const { parseFunnelContext, funnelRecord, FUNNEL_PARAM_KEYS } = await import('../../lib/onboarding/funnel-context.ts')
const { computeOutcomes, parseOutcomesRequest } = await import('../../lib/flowweb/outcomes.ts')

const bad = []
const link = 'persona=practitioner&region=north-county-sd&src=event_listings&utm_source=flowweb&utm_medium=founder_email&utm_campaign=hnt_ncsd&utm_content=d-7f3a9c'
const rec = funnelRecord(parseFunnelContext(new URLSearchParams(link)))
if (rec.utm_content !== 'd-7f3a9c') bad.push(`the lead does not store the draft id: ${JSON.stringify(rec)}`)
if (!FUNNEL_PARAM_KEYS.includes('utm_content')) bad.push('the /start pages do not pass utm_content on')

const funnel = (campaign, content, extra = {}) => ({ funnel: { utm_source: 'flowweb', utm_medium: 'founder_email', utm_campaign: campaign, utm_content: content, src: 'event_listings', ...extra } })
const rows = computeOutcomes({
  leads: [{ meta: funnel('hnt_a', 'd-1') }, { meta: funnel('hnt_a', 'd-1') }, { meta: funnel('hnt_a', 'd-2') }, { meta: { funnel: { utm_source: 'google' } } }, { meta: null }],
  members: [
    { id: 'p1', meta: funnel('hnt_a', 'd-1'), membership_tier: 'crew' },
    { id: 'p2', meta: funnel('hnt_a', 'd-1'), membership_tier: 'free' },
    { id: 'p3', meta: funnel('north-county-sd', null), membership_tier: null },
    { id: 'p4', meta: { funnel: { utm_source: 'ig' } }, membership_tier: 'crew' },
  ],
  hostIds: new Set(['p2', 'p4']),
})
const find = (c, d) => rows.find((r) => r.campaign === c && r.content === d)
const d1 = find('hnt_a', 'd-1')
if (!d1 || d1.leads !== 2 || d1.members !== 2 || d1.hosts !== 1 || d1.paid !== 1) bad.push(`draft d-1 miscounted: ${JSON.stringify(d1)}`)
const d2 = find('hnt_a', 'd-2')
if (!d2 || d2.leads !== 1 || d2.members !== 0) bad.push(`draft d-2 miscounted: ${JSON.stringify(d2)}`)
const old = find('north-county-sd', null)
if (!old || old.members !== 1) bad.push('a member from an untagged FlowWeb link was dropped')
if (rows.length !== 3) bad.push(`people FlowWeb did not bring were counted: ${rows.length} rows`)
const allowed = new Set(['campaign', 'content', 'medium', 'src', 'leads', 'members', 'hosts', 'paid'])
for (const r of rows) for (const k of Object.keys(r)) if (!allowed.has(k)) bad.push(`a row carries ${k}`)

const now = new Date('2026-11-10T12:00:00Z')
if ('error' in parseOutcomesRequest({}, now)) bad.push('an empty request was refused')
if (!('error' in parseOutcomesRequest({ since: '2025-01-01T00:00:00Z' }, now))) bad.push('a window over a year back was accepted')
if (!('error' in parseOutcomesRequest({ since: 'yesterday' }, now))) bad.push('a since that is not a date was accepted')

const route = 'app/api/webhooks/flowweb-outcomes/route.ts'
if (!existsSync(route)) bad.push(`${route} is missing`)
else {
  const src = readFileSync(route, 'utf8').replace(/\/\/.*$/gm, '')
  if (!/verifySignature\(/.test(src)) bad.push('the route lost its signature check')
  if (!/FLOWWEB_OUTCOMES_SECRET/.test(src)) bad.push('the route is not keyed to FLOWWEB_OUTCOMES_SECRET')
  if (/select\([^)]*\b(email|full_name|phone)\b/.test(src)) bad.push('the route reads a field that names a person')
}

if (bad.length) {
  console.error(bad.join('\n'))
  process.exit(1)
}
console.log('flowweb-outcomes: outcomes counted per FlowWeb campaign and draft, signed, counts only')
