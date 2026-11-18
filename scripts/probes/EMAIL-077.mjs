#!/usr/bin/env node
// EMAIL-077: a campaign sent as a Resend broadcast (EMAIL-076) must report its delivery, opens and clicks back to the
// campaign. On 2026-11-18 the live test was delivered and clicked, yet outreach_sends stayed 'queued' and email_events
// carried campaign_id null, because nothing stored the broadcast id or read data.broadcast_id on the webhook.
// Passes when the send path keeps the broadcast id and the webhook reads broadcast_id.
import { readFileSync, existsSync } from 'node:fs'

const root = new URL('../../', import.meta.url)
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const read = (f) => {
  const u = new URL(f, root)
  return existsSync(u) ? strip(readFileSync(u, 'utf8')) : null
}
const fails = []
const send = read('lib/email-studio/send.ts')
if (send === null) fails.push('lib/email-studio/send.ts is gone (re-check this probe)')
else if (!/sendCampaignAsBroadcast\([\s\S]{0,1500}broadcastId/.test(send)) fails.push('the broadcast send never keeps the returned broadcastId')
const hook = read('app/api/webhooks/resend/route.ts')
if (hook === null) fails.push('app/api/webhooks/resend/route.ts is gone (re-check this probe)')
else if (!/broadcast_id/.test(hook)) fails.push('the Resend webhook never reads data.broadcast_id, so broadcast events have no campaign')
if (fails.length) { console.error(`EMAIL-077 FAIL\n - ${fails.join('\n - ')}`); process.exit(1) }
console.log('EMAIL-077 ok: broadcast events are attributed to their campaign')
