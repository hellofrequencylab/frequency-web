#!/usr/bin/env node
// LIVE-2325: the Space "send as conversations" path (sendSpaceEmailDraftAsConversations, the Message Member
// composer) runs the same Space gates the campaign seam does before it opens a single conversation: the plan and
// role gate (spaceFunctionAccess 'email'), the Space's email switch (isSpaceEmailEnabled), a per-send ceiling of
// DAILY_SEND_CAP recipients, and the campaigns-a-month meter. On main it checked only editor rights and Space
// status, so a Space with email off or not on its plan could mail a designed email to any number of contacts.
import { readFileSync } from 'node:fs'

const root = new URL('../../', import.meta.url)
const src = readFileSync(new URL('lib/spaces/email-drafts.ts', root), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const fails = []
const start = src.indexOf('export async function sendSpaceEmailDraftAsConversations(')
const body = start < 0 ? '' : src.slice(start, src.indexOf('\nexport ', start + 10) > 0 ? src.indexOf('\nexport ', start + 10) : undefined)
if (!body) fails.push('sendSpaceEmailDraftAsConversations not found (re-check this probe)')
const send = body.indexOf('startConversationMessage(')
if (send < 0) fails.push('the function no longer opens conversations (re-check this probe)')
const before = body.slice(0, send)
for (const [re, what] of [
  [/spaceFunctionAccess\(space, 'email', caps\.role\)/, 'the plan and role gate'],
  [/await isSpaceEmailEnabled\(spaceId\)/, "the Space's email switch"],
  [/recipients\.length > DAILY_SEND_CAP/, 'the per-send recipient ceiling'],
  [/await checkCampaignMonthMeter\(spaceId\)/, 'the campaigns-a-month meter'],
]) {
  if (!re.test(before)) fails.push(`no ${what} before the first conversation opens`)
}

if (fails.length) {
  console.error(`LIVE-2325 FAIL\n - ${fails.join('\n - ')}`)
  process.exit(1)
}
console.log('LIVE-2325 ok: the conversation send runs the plan, switch, cap and meter gates before it mails anyone')
