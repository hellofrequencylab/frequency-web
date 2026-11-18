#!/usr/bin/env node
// SEC-024: the anonymous persona-pick logger (a public server action that writes one engagement_events
// row per call) is throttled per IP and bounds what it stores, so a script cannot flood the ledger or
// skew the onboarding persona funnel.
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('../../app/join/(induction)/persona-log.ts', import.meta.url), 'utf8')
const fails = []
const body = src.slice(src.indexOf('export async function logPersonaSelection'))
const limit = body.indexOf("rateLimitOk('persona-log'")
const write = body.indexOf('recordEngagementEvent(')
if (limit < 0) fails.push('logPersonaSelection never calls rateLimitOk')
else if (write >= 0 && limit > write) fails.push('the rate limit runs after the write')
if (!/input\.sequence\.slice\(0, MAX_SEQUENCE\)/.test(body)) fails.push('sequence is stored without a length cap')
if (!/input\.personas\.slice\(0, \d+\)/.test(body)) fails.push('personas list is not capped')

if (fails.length) {
  console.error(`SEC-024 FAIL\n - ${fails.join('\n - ')}`)
  process.exit(1)
}
console.log('SEC-024 ok: persona-pick logging is rate limited per IP and bounded')
