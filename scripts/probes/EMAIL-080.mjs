#!/usr/bin/env node
// EMAIL-080: a nurture lead with no account (no profile_id) skipped the member send gate and was cancelled only when
// unsubscribed or suppressed, so a lead whose consent was 'unknown' (an import, an event RSVP, a scan invite) could be
// mailed. Not unsubscribed is not permission. This probe passes while the profile-less branch of the nurture runner
// cancels any lead that is not explicitly 'subscribed' before the send is claimed.
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('../../lib/nurture/runner.ts', import.meta.url), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const fails = []
const elseAt = src.indexOf('} else {', src.indexOf('if (contact.profile_id)'))
const claimAt = src.indexOf("from('nurture_enrollments')", elseAt)
const branch = elseAt > 0 && claimAt > elseAt ? src.slice(elseAt, claimAt) : ''
if (!branch) fails.push('could not find the profile-less branch before the send claim (re-check this probe)')
else if (!/contact\.consent_state !== 'subscribed'\) \{ await cancel\(e\.id\)/.test(branch)) {
  fails.push("a profile-less lead that is not 'subscribed' is not cancelled before the send")
}
if (fails.length) { console.error(`EMAIL-080 FAIL\n - ${fails.join('\n - ')}`); process.exit(1) }
console.log("EMAIL-080 ok: a nurture lead with no account must be 'subscribed' or its sequence ends")
