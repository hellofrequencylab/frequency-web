#!/usr/bin/env node
// LIVE-2251: Frequency builds a claim link for a FlowWeb hunt item, and never sends the message itself.
//
// Fails when an unsigned or stale request is accepted, when an item without its "reply no" line, its
// source page or its {{claim_url}} slot is accepted, when the switch is off or the address is suppressed
// and an event is still built, when a good item does not answer its claim and event links, when the route
// loses its signature check, or when any of this code can send email.
// Run: node --experimental-strip-types --no-warnings --import ./scripts/probe-ts.mjs scripts/probes/flowweb-claim.mjs
import { createHmac } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'

const { parseItem, buildClaim, verifySignature, CLAIM_SLOT } = await import('../../lib/flowweb/claim.ts')

const bad = []
const secret = 'test-secret-not-real'
const now = Date.parse('2026-11-10T12:00:00Z')
const ts = String(Math.floor(now / 1000))
const sign = (t, b) => createHmac('sha256', secret).update(`${t}.${b}`).digest('hex')
const body = '{"x":1}'
if (!verifySignature(secret, ts, body, sign(ts, body), now)) bad.push('a correctly signed request was refused')
if (verifySignature(secret, ts, body, sign(ts, '{"x":2}'), now)) bad.push('a signature over another body was accepted')
const old = String(Math.floor(now / 1000) - 600)
if (verifySignature(secret, old, body, sign(old, body), now)) bad.push('a ten-minute-old signature was accepted')
if (verifySignature('', ts, body, sign(ts, body), now)) bad.push('a request was accepted with no secret set')

const src = 'https://example.com/organizer'
const item = (o = {}) => ({
  id: 'hnt_1-abc',
  body: `Hi! Loved your event.\n\nIt is yours to claim: ${CLAIM_SLOT}\n\nI found your address on ${src}. Not interested? Reply "no" and I won't write again.`,
  ...o,
  lead: { to: 'organizer@example.com', source_url: src, build: true, event: { title: 'Sound bath', starts_at: '2026-12-01T18:00:00Z', url: 'https://example.com/e' }, ...o.lead },
})
const good = parseItem(item())
if ('error' in good) bad.push(`a good item was refused: ${good.error}`)
if (!('error' in parseItem(item({ body: `Claim: ${CLAIM_SLOT}. I found your address on ${src}.` })))) bad.push('an item without a "reply no" line was accepted')
if (!('error' in parseItem(item({ lead: { source_url: 'not a page' } })))) bad.push('an item without a public source page was accepted')
if (!('error' in parseItem(item({ lead: { build: false } })))) bad.push('an item without build was accepted')
if (!('error' in parseItem(item({ body: `I found your address on ${src}. Reply "no".` })))) bad.push('an item without the claim slot was accepted')

let builds = 0
const deps = (o = {}) => ({
  enabled: () => true,
  isSuppressed: async () => false,
  buildEvent: async () => {
    builds++
    return { claimUrl: 'https://frequencylocal.com/events/claim/tok123', eventUrl: 'https://frequencylocal.com/events/sound-bath' }
  },
  ...o,
})
const run = async (o) => {
  builds = 0
  return buildClaim(good, deps(o))
}
if ((await run({ enabled: () => false })).status !== 'off' || builds) bad.push('the switch was off and an event was built')
if ((await run({ isSuppressed: async () => true })).status !== 'suppressed' || builds) bad.push('a suppressed address got an event')
const ok = await run()
if (ok.status !== 'built' || ok.claimUrl !== 'https://frequencylocal.com/events/claim/tok123' || !ok.eventUrl) bad.push(`a good item did not answer its links: ${JSON.stringify(ok)}`)
if ((await run({ buildEvent: async () => null })).status !== 'refused') bad.push('a failed build was not refused')

const route = 'app/api/webhooks/flowweb-claim/route.ts'
if (!existsSync(route)) bad.push(`${route} is missing`)
else if (!/verifySignature\(/.test(readFileSync(route, 'utf8'))) bad.push('the route lost its signature check')
for (const f of [route, 'lib/flowweb/claim.ts', 'lib/flowweb/claim-io.ts'])
  if (existsSync(f) && /enqueueEmail|sendEmail|resend/i.test(readFileSync(f, 'utf8').replace(/\/\/.*$/gm, ''))) bad.push(`${f} can send email`)

if (bad.length) {
  console.error(bad.join('\n'))
  process.exit(1)
}
console.log('flowweb-claim: claim links only for signed, switched-on, unsuppressed build items; Frequency sends nothing')
