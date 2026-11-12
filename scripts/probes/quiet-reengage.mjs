#!/usr/bin/env node
// LIVE-2265: members who go quiet get the owner's approved re-engagement emails at 14, 30 and 60 days, once each,
// opted-in members only, stopped by a visit, and nothing goes out without the owner's approval.
//
// Fails when the three quiet audiences or their windows change, when a quiet audience is not opt-in marketing,
// when the one-shot Send button can send a quiet campaign, when the trigger can send without assertApproved or
// without the ledger and dedupe key, or when the cron is not registered, dark by default and budgeted.
// Run: node --experimental-strip-types --no-warnings --import ./scripts/probe-ts.mjs scripts/probes/quiet-reengage.mjs
import { readFileSync } from 'node:fs'

const q = await import('../../lib/email-studio/quiet.ts')
const bad = []
const now = new Date('2026-11-11T17:00:00Z')
const DAY = 86_400_000
if (JSON.stringify(q.QUIET_SEGMENT_DAYS) !== JSON.stringify({ quiet_14: 14, quiet_30: 30, quiet_60: 60 })) bad.push('the quiet audiences are not 14, 30 and 60 days')
for (const [k, d] of Object.entries(q.QUIET_SEGMENT_DAYS)) {
  const w = q.quietWindow(k, now)
  if (w.to !== new Date(now.getTime() - d * DAY).toISOString()) bad.push(`${k} does not start at ${d} days without a visit`)
  if (Date.parse(w.to) - Date.parse(w.from) !== q.QUIET_CATCH_UP_DAYS * DAY) bad.push(`${k} catch-up is not ${q.QUIET_CATCH_UP_DAYS} days`)
}
delete process.env.QUIET_REENGAGE_ENABLED
if (q.quietReengageEnabled()) bad.push('the trigger is on with the switch blank')

const camp = readFileSync('lib/studio/campaigns.ts', 'utf8')
for (const k of ['quiet_14', 'quiet_30', 'quiet_60']) if (!camp.includes(`key: '${k}'`)) bad.push(`Email Studio has no ${k} audience`)
if (!/isQuietSegment\(parsed\.slug\)[\s\S]{0,700}\.eq\('consent_state', 'subscribed'\)/.test(camp)) bad.push('a quiet audience is not limited to subscribed (opted-in) members')
if (!/\.lt\('last_seen_at', w\.to\)/.test(camp)) bad.push('a quiet audience does not read last_seen_at, so a visit would not stop it')
if (!/segment === 'subscribed_members' \|\| isQuietSegment\(segment\)/.test(camp)) bad.push('a quiet audience does not send under the opt-in marketing category')

const send = readFileSync('lib/email-studio/send.ts', 'utf8')
const now1 = send.slice(send.indexOf('export async function sendCampaignNow'))
if (!/if \(isQuietSegment\(row\.segment\)\) return fail\(QUIET_ONE_SHOT_REFUSAL\)/.test(now1.slice(0, 600))) bad.push('the Send button can one-shot a quiet campaign')
const quiet = send.slice(send.indexOf('export async function sendQuietCampaign'))
const body = quiet.slice(0, quiet.indexOf('\n}\n'))
if (!body.includes('assertApproved(')) bad.push('the trigger can send a campaign the owner did not approve')
if (!body.includes('readLedgerRecipients(') || !body.includes("return fail(LEDGER_UNREADABLE_ERROR)")) bad.push('the trigger does not skip people it already reached, or sends on an unreadable ledger')
if (!body.includes('dedupeKey: quietDedupeKey(')) bad.push('the trigger enqueue has no dedupe key')
if (!body.includes("resolveSendGate(profileId, 'email', 'marketing'")) bad.push('the trigger does not ask the marketing send gate')

const vercel = JSON.parse(readFileSync('vercel.json', 'utf8'))
if (!(vercel.crons ?? []).some((c) => c.path === '/api/cron/quiet-reengage')) bad.push('the quiet-reengage cron is not scheduled')
const route = readFileSync('app/api/cron/quiet-reengage/route.ts', 'utf8')
if (!route.includes('quietReengageEnabled()') || !route.includes('cronBudget(')) bad.push('the cron is not behind the switch or has no budget')
if (!readFileSync('.env.example', 'utf8').includes('\nQUIET_REENGAGE_ENABLED=\n')) bad.push('QUIET_REENGAGE_ENABLED is not listed blank in .env.example')

if (bad.length) { console.error('quiet-reengage:\n  ' + bad.join('\n  ')); process.exit(1) }
console.log('quiet-reengage: 3 audiences, opt-in only, approval-gated, once per person, dark by default')
