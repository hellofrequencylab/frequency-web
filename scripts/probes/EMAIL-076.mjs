#!/usr/bin/env node
// EMAIL-076: the Resend team is on Transactional Free (100 a day) and Marketing Pro (unlimited broadcasts). A platform
// campaign queued one outbox email per person and spent the daily allowance, so later sign-in links and reminders
// failed. Behind EMAIL_BROADCASTS_ENABLED a campaign now goes out as ONE Resend broadcast to a per-campaign segment,
// after the same send gate, and a Resend-side opt-out (contact.updated) becomes a root-Space suppression.
import { readFileSync } from 'node:fs'

const read = (p) =>
  readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const send = read('lib/email-studio/send.ts')
const bc = read('lib/email-studio/broadcast.ts')
const hook = read('app/api/webhooks/resend/route.ts')
const fails = []

if (!/if \(broadcastsEnabled\(\) && !conversationMode\)/.test(send)) fails.push('sendCampaignNow does not branch to the broadcast path')
const branch = send.slice(send.indexOf('if (broadcastsEnabled() && !conversationMode)'), send.indexOf('const buildOne = async'))
if (!/resolveSendGate\(/.test(branch) || !/isSuppressed\(/.test(branch)) fails.push('the broadcast path skips the send gate or the suppression check')
if (!/await sendCampaignAsBroadcast\(/.test(branch)) fails.push('the broadcast path never sends a broadcast')
if (/enqueueEmailBatch\(/.test(branch)) fails.push('the broadcast path still queues outbox email')
if (!/envFlag\('EMAIL_BROADCASTS_ENABLED'\)/.test(bc)) fails.push('the switch is not read through envFlag')
if (/unsubscribed:\s*'/.test(bc)) fails.push('the contact import maps an unsubscribed column (an upsert could re-subscribe someone)')
if (!/RESEND_UNSUBSCRIBE_URL/.test(bc)) fails.push('the broadcast has no Resend unsubscribe placeholder')
if (!/event\.type === 'contact\.updated'/.test(hook)) fails.push('the Resend webhook ignores contact.updated')
if (!/suppress\(email, 'unsubscribe', rootSpaceId\)/.test(hook)) fails.push('a Resend opt-out is not mirrored as a root-Space suppression')
if (!/^EMAIL_BROADCASTS_ENABLED=$/m.test(readFileSync(new URL('../../.env.example', import.meta.url), 'utf8'))) fails.push('EMAIL_BROADCASTS_ENABLED is not listed blank in .env.example')
if (!/## Campaign broadcasts/.test(readFileSync(new URL('../../docs/RUNBOOKS.md', import.meta.url), 'utf8'))) fails.push('no activation gate in docs/RUNBOOKS.md')

if (fails.length) { console.error(`EMAIL-076 FAIL\n - ${fails.join('\n - ')}`); process.exit(1) }
console.log('EMAIL-076 ok: campaigns can go out as one Resend broadcast after the send gate, and Resend opt-outs sync back')
