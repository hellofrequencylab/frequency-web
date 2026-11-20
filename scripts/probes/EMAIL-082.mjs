#!/usr/bin/env node
// EMAIL-082 (owner decision 2026-11-19): the 511 imported contacts are Daniel Tyack's personal email list, mailed
// as opt-out subscribers by brand campaigns (all_contacts on 2026-11-12 and 2026-11-17). Resend's AUP requires an
// explicit opt-in. This probe passes while (1) the all_contacts audience includes an imported contact only when
// consent_state is 'subscribed', and (2) the imported_contacts audience refuses any From name but Daniel's, at both
// schedule and send.
import { readFileSync } from 'node:fs'

const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const read = (p) => strip(readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8'))
const campaigns = read('lib/studio/campaigns.ts')
const send = read('lib/email-studio/send.ts')
const personal = read('lib/email-studio/personal-list.ts')
const fails = []
const all = campaigns.slice(campaigns.indexOf("parsed.slug === 'all_contacts'"), campaigns.indexOf("parsed.slug === 'imported_contacts'"))
if (!all) fails.push('all_contacts branch not found (re-check this probe)')
else if (/source\.eq\.import(?!,consent_state\.eq\.subscribed)/.test(all.replace("and(source.eq.import,consent_state.eq.subscribed)", ''))) fails.push('all_contacts still reaches imported contacts who never opted in')
else if (!/and\(source\.eq\.import,consent_state\.eq\.subscribed\)/.test(all)) fails.push('all_contacts does not limit imported contacts to opted-in ones')
if (!/PERSONAL_LIST_SEGMENT = 'imported_contacts'/.test(personal) || !/PERSONAL_LIST_SENDER = 'Daniel Tyack'/.test(personal)) fails.push('the personal-list rule no longer names imported_contacts and Daniel Tyack')
const sched = send.slice(send.indexOf('export async function scheduleCampaign('), send.indexOf('const audience = await countAudience(input.segment)'))
if (!/personalListSenderError\(input\.segment/.test(sched)) fails.push('scheduling does not check the personal-list sender')
const now = send.slice(send.indexOf('export async function sendCampaignNow('), send.indexOf('claimQuery'))
if (!/personalListSenderError\(row\.segment/.test(now)) fails.push('the send does not re-check the personal-list sender before it claims the row')
if (fails.length) { console.error(`EMAIL-082 FAIL\n - ${fails.join('\n - ')}`); process.exit(1) }
console.log("EMAIL-082 ok: brand campaigns skip imported contacts until they opt in; the personal list only sends as Daniel")
