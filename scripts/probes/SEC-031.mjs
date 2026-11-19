#!/usr/bin/env node
// SEC-031: the beta free/Crew toggle closes on the operator's billing_live switch ALONE (owner ruling
// 2026-11-19). billingLive() also needs the Stripe env keys, so gating on it alone let a missing key
// reopen free Crew while the switch said billing was on.
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('../../app/(main)/upgrade/actions.ts', import.meta.url), 'utf8')
const start = src.indexOf('export async function toggleMembership(')
const body = start >= 0 ? src.slice(start, src.indexOf('\nexport ', start + 10)) : ''
const write = body.indexOf('.update(')
const gate = body.search(/if \([^\n]*await billingLiveFlag\(\)[^\n]*\) return fail\(/)
if (start < 0 || write < 0 || gate < 0 || gate > write) {
  console.error('SEC-031 FAIL: toggleMembership is not closed by the billing_live switch alone, so a missing Stripe key reopens free Crew')
  process.exit(1)
}
console.log('SEC-031 ok: the billing_live switch alone closes the free Crew toggle')
