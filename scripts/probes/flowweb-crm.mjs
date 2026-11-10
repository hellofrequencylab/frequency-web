#!/usr/bin/env node
// LIVE-2256: every FlowWeb lead lands in the CRM as a contact with one conversation that holds its drafts,
// sends, replies and outcome, and Frequency sends none of it.
//
// Fails when an email lead is not accepted or a lead without an email is, when the thread status does not
// follow drafted -> sent -> replied -> signed up / said no, when a repeat post would add messages again,
// when anything but the founder's send or a pasted reply leaves the internal lane, when a thread is pulled
// back, or when the route loses its signature check, its off switch, or imports a sender.
// Run: node --experimental-strip-types --no-warnings --import ./scripts/probe-ts.mjs scripts/probes/flowweb-crm.mjs
import { existsSync, readFileSync } from 'node:fs'

const { parseCrmItem, leadStatus, planMessages, nextStatus } = await import('../../lib/flowweb/crm.ts')

const bad = []
const post = (draft = {}, extra = {}) => ({
  flow: 'neighborhood-activation',
  lead: { email: 'Hello@FrontPorch.example', org: 'Front Porch Gallery', source_url: 'https://frontporch.example/events', hunt: 'North County community events' },
  draft: { tag: 'd-7f3a9c', subject: 'A local connection', body: 'Hi Front Porch Gallery team.', created_at: '2026-11-10T08:00:00Z', ...draft },
  ...extra,
})
const drafted = parseCrmItem(post())
if ('error' in drafted) bad.push(`an email lead was refused: ${drafted.error}`)
if (!('error' in parseCrmItem({ ...post(), lead: { org: 'No email' } }))) bad.push('a lead without an email was accepted')

const sent = parseCrmItem(post({ sent_at: '2026-11-10T09:00:00Z' }))
const replied = parseCrmItem(post({ sent_at: '2026-11-10T09:00:00Z', replied_at: '2026-11-11T09:00:00Z' }))
const declined = parseCrmItem(post({ sent_at: '2026-11-10T09:00:00Z', declined_at: '2026-11-11T09:00:00Z' }))
const want = [
  [drafted, false, 'open'],
  [sent, false, 'waiting'],
  [replied, false, 'in_progress'],
  [sent, true, 'resolved'],
  [declined, true, 'closed'],
]
for (const [i, up, s] of want) if (leadStatus(i, up) !== s) bad.push(`expected ${s}, got ${leadStatus(i, up)}`)

const steps = planMessages(replied, false)
if (steps.map((m) => m.step).join() !== 'drafted,sent,replied') bad.push(`steps: ${steps.map((m) => m.step)}`)
if (new Set(steps.map((m) => m.key)).size !== steps.length) bad.push('two steps share a key')
if (planMessages(replied, false).map((m) => m.key).join() !== steps.map((m) => m.key).join()) bad.push('keys are not stable across posts')
const outward = steps.filter((m) => !m.internal).map((m) => m.step)
if (outward.join() !== 'sent') bad.push(`only the founder's send may leave the internal lane, got ${outward}`)
if (planMessages(declined, true).some((m) => m.step === 'signed_up')) bad.push('a lead who said no was marked signed up')
if (nextStatus('in_progress', 'waiting') !== null) bad.push('a thread was pulled back')

const route = 'app/api/webhooks/flowweb-crm/route.ts'
const io = 'lib/flowweb/crm-io.ts'
for (const f of [route, io]) if (!existsSync(f)) bad.push(`${f} is missing`)
if (!bad.some((b) => b.includes('missing'))) {
  const src = readFileSync(route, 'utf8').replace(/\/\/.*$/gm, '')
  if (!/verifySignature\(/.test(src)) bad.push('the route lost its signature check')
  if (!/envFlag\('FLOWWEB_CRM_ENABLED'\)/.test(src)) bad.push('the route lost its FLOWWEB_CRM_ENABLED switch')
  const both = src + readFileSync(io, 'utf8')
  if (/from '@\/lib\/(email|resend|comms\/(leader-send|sms-send|outbound-batch))/.test(both)) bad.push('the CRM path imports a sender')
}

if (bad.length) {
  console.error(bad.join('\n'))
  process.exit(1)
}
console.log('flowweb-crm: each FlowWeb lead is one contact and one thread, drafted to signed up, keyed, never sent')
