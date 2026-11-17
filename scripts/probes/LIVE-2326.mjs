#!/usr/bin/env node
// LIVE-2326: switching newsletters ("lifecycle") off on the Manage emails page stops the next marketing
// broadcast, as the footer's one-click unsubscribe does (SCAN-728). The marketing gate reads only the
// email_marketing consent scope, so the save must revoke that consent and unsubscribe the linked contacts.
// Checks the consequence in source; the behaviour is pinned by app/manage-emails/actions.test.ts.
import { existsSync, readFileSync } from 'node:fs'

const root = new URL('../../', import.meta.url)
const read = (p) => readFileSync(new URL(p, root), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const fails = []
const src = read('app/manage-emails/actions.ts')
const branch = src.match(/if \(cat === 'lifecycle' && !subscribed\) \{([\s\S]*?)\n {2}\}\n/)?.[1] ?? ''
if (!branch) fails.push('no newsletters-off branch in setEmailCategoryPreference')
if (!/from\('consent_records'\)[\s\S]*?scope: 'email_marketing', granted: false/.test(branch)) fails.push('the newsletters-off save does not revoke email_marketing consent')
if (!/from\('contacts'\)[\s\S]*?consent_state: 'unsubscribed'[\s\S]*?\.eq\('profile_id', profileId\)/.test(branch)) fails.push('the newsletters-off save does not unsubscribe the linked contacts')
if (!existsSync(new URL('app/manage-emails/actions.test.ts', root))) fails.push('app/manage-emails/actions.test.ts is missing')
const gate = read('lib/comms/send-gate.ts')
if (!/case 'marketing':\s*return 'email_marketing'/.test(gate)) fails.push('the marketing gate no longer reads email_marketing consent (re-check this probe)')

if (fails.length) {
  console.error(`LIVE-2326 FAIL\n - ${fails.join('\n - ')}`)
  process.exit(1)
}
console.log('LIVE-2326 ok: newsletters off on Manage emails revokes marketing consent and unsubscribes the contacts')
