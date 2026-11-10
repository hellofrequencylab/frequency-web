#!/usr/bin/env node
// LIVE-2251: FlowWeb's hunt messages are sent by Frequency only through every gate.
//
// Fails when an unsigned or stale request is accepted, when a message without its "reply no" line or its
// source page is accepted, when the switch is off and something still sends, when a suppressed address or
// a full day is still mailed, when a build message goes out without its claim link filled in, when the
// unsubscribe link or the postal address goes missing, or when the route loses its signature check.
// Run: node --experimental-strip-types --no-warnings --import ./scripts/probe-ts.mjs scripts/probes/flowweb-outreach.mjs
import { createHmac } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'

const { parseItem, sendOutreach, verifySignature, CLAIM_SLOT } = await import('../../lib/flowweb/outreach.ts')

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
  body: `Hi! Loved your event.\n\n${o.build ? `Claim it: ${CLAIM_SLOT}` : 'Host here: https://frequencylocal.com/start/host'}\n\nI found your address on ${src}. Not interested? Reply "no" and I won't write again.`,
  lead: { to: 'organizer@example.com', source_url: src, subject: 'Your sound bath', build: !!o.build, event: { title: 'Sound bath', starts_at: '2026-12-01T18:00:00Z', url: 'https://example.com/e' }, ...o.lead },
})
const plain = parseItem(item())
if ('error' in plain) bad.push(`a good item was refused: ${plain.error}`)
const noOptOut = { ...item(), body: `Hi! I found your address on ${src}.` }
if (!('error' in parseItem(noOptOut))) bad.push('an item without a "reply no" line was accepted')
if (!('error' in parseItem(item({ lead: { source_url: 'not a page' } })))) bad.push('an item without a public source page was accepted')

const sent = []
const deps = (o = {}) => ({
  enabled: () => true,
  replyTo: () => 'founder@example.com',
  dailyCap: () => 50,
  isSuppressed: async () => false,
  sentToday: async () => 0,
  buildEvent: async () => ({ claimUrl: 'https://frequencylocal.com/events/claim/tok123', eventUrl: 'https://frequencylocal.com/events/sound-bath' }),
  unsubscribeUrl: async () => 'https://frequencylocal.com/unsubscribe?s=root&e=x&t=y',
  postal: 'Frequency, 1 Example St',
  send: async (m) => sent.push(m),
  record: async () => {},
  ...o,
})
const run = async (it, o) => {
  sent.length = 0
  return sendOutreach(it, deps(o))
}
if ((await run(plain, { enabled: () => false })).status !== 'off' || sent.length) bad.push('the switch was off and something was sent')
if ((await run(plain, { isSuppressed: async () => true })).status !== 'suppressed' || sent.length) bad.push('a suppressed address was mailed')
if ((await run(plain, { sentToday: async () => 50 })).status !== 'capped' || sent.length) bad.push('a full day was still mailed')
if ((await run(plain, { replyTo: () => null })).status !== 'refused' || sent.length) bad.push('a message went out with no inbox for "reply no"')
const ok = await run(plain)
if (ok.status !== 'sent' || sent.length !== 1) bad.push(`a good item was not sent: ${JSON.stringify(ok)}`)
else {
  const m = sent[0]
  if (!m.text.includes('/unsubscribe?')) bad.push('the message has no unsubscribe link')
  if (!m.text.includes('Frequency, 1 Example St')) bad.push('the message has no postal address')
  if (m.dedupeKey !== 'flowweb:hnt_1-abc') bad.push(`the send is not deduped on the item id: ${m.dedupeKey}`)
  if (m.replyTo !== 'founder@example.com') bad.push('replies do not go to the founder inbox')
}
const built = parseItem(item({ build: true }))
const b = await run(built)
if (b.status !== 'sent' || !sent[0]?.text.includes('/events/claim/tok123') || sent[0]?.text.includes(CLAIM_SLOT))
  bad.push('a build message did not carry its claim link')
if ((await run(built, { buildEvent: async () => null })).status !== 'refused' || sent.length) bad.push('a build message went out without its event page')

const route = 'app/api/webhooks/flowweb-outreach/route.ts'
if (!existsSync(route)) bad.push(`${route} is missing`)
else if (!/verifySignature\(/.test(readFileSync(route, 'utf8'))) bad.push('the route lost its signature check')

if (bad.length) {
  console.error(bad.join('\n'))
  process.exit(1)
}
console.log('flowweb-outreach: hunt messages go out only signed, switched on, unsuppressed, under the cap, with unsubscribe, address and claim link')
