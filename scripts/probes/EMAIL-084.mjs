#!/usr/bin/env node
// EMAIL-084 (Daniel, 2026-11-19, "One per 7 days"): Email Studio campaigns called resolveSendGate with no frequency, so two
// campaigns (or a campaign and a quiet-member email) could reach one person the same day. The lifecycle cap (1 a day,
// 3 a week, on in production since 2026-11-17) only covered the nurture runner. This probe passes while the cap knows a
// marketing kind limited to one per rolling 7 days, and both Email Studio senders (one-shot on both the outbox and
// broadcast paths, and the quiet-member sender) reserve that slot after the gate and before they queue.
import { readFileSync } from 'node:fs'

const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const read = (p) => strip(readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8'))
const cap = read('lib/lifecycle/cap.ts')
const send = read('lib/email-studio/send.ts')
const helper = read('lib/email-studio/campaign-cap.ts')
const fails = []
if (!/MARKETING_KINDS[^\n]*new Set\(\['campaign'\]\)/.test(cap) || !/MARKETING_WEEKLY_CAP = 1\b/.test(cap)) fails.push('the cap has no one-per-week marketing rule for campaigns')
if (!/kind: CAMPAIGN_CAP_KIND/.test(helper) || !/CAMPAIGN_CAP_KIND = 'campaign'/.test(helper)) fails.push('campaign sends do not reserve the campaign kind')
if (!/return r === 'reserved'/.test(helper)) fails.push('a capped, failed or duplicate reservation does not skip the person')
const now = send.slice(send.indexOf('export async function sendCampaignNow('), send.indexOf('export async function sendQuietCampaign('))
const reserves = (now.match(/reserveCampaignSend\(db,/g) ?? []).length
if (reserves < 2) fails.push(`sendCampaignNow reserves on ${reserves} of 2 paths (outbox and broadcast)`)
if (!/releaseCampaignSends\(db, campaignId, allowed/.test(now) || !/releaseCampaignSends\(db, campaignId, built/.test(now)) fails.push('a send that never queued does not give its slots back')
const quiet = send.slice(send.indexOf('export async function sendQuietCampaign('))
if (!/reserveCampaignSend\(capDb,/.test(quiet)) fails.push('the quiet-member sender does not reserve the weekly slot')
if (fails.length) { console.error(`EMAIL-084 FAIL\n - ${fails.join('\n - ')}`); process.exit(1) }
console.log('EMAIL-084 ok: one Email Studio campaign or newsletter per person per 7 days, on every send path')
