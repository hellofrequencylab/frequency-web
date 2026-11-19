#!/usr/bin/env node
// LIVE-754, as re-ruled by ADR-1978 (owner, 2026-11-18): the fee on a sale Frequency introduced is ONE finder's
// fee, 10% and never more than $20, on every plan but Non Profit. This row first pinned the 5 / 3 / 0 ladder
// (paid 500, collective 300) and the migration that stored it. That ladder is retired, and the row it stored is
// still in production, so the consequence to hold now is that no paying rung prices below the finder's fee and
// the stored 500 / 300 are not read back into a charge.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const k = readFileSync('lib/billing/pricing-keys.ts', 'utf8')
assert.ok(/FINDERS_FEE_BPS_DEFAULT = 1000\b/.test(k) && /FINDERS_FEE_CAP_CENTS_DEFAULT = 2000\b/.test(k), 'the finder\'s fee is not 10% capped at $20')
const d = (k.split('NETWORK_TAKE_RATE_DEFAULT: NetworkTakeRate = {')[1] || '').split('}')[0]
for (const rung of ['free', 'paid', 'collective', 'network']) {
  assert.ok(new RegExp(`${rung}:\\s*FINDERS_FEE_BPS_DEFAULT`).test(d), `the ${rung} rung is not the one finder's fee`)
}
assert.ok(/nonprofit:\s*0\b/.test(d), 'Non Profit does not pay 0')
assert.ok(/capCents:\s*FINDERS_FEE_CAP_CENTS_DEFAULT/.test(d), 'the default vector carries no cap')
assert.ok(/case 'collective'/.test((k.split('export function takeRateRungForPlan')[1] || '').split('\n}')[0]), 'takeRateRungForPlan does not place collective')
const stored = (k.split('export function networkTakeRateFromStored')[1] || '').split('\n}')[0]
assert.ok(/const finder = bps\(stored\?\.finder_bps, FINDERS_FEE_BPS_DEFAULT\)/.test(stored), 'the stored finder_bps is not what a paying rung reads')
assert.ok(!/vec\.(paid|collective|network|free)\b/.test(stored), 'the retired stored rungs (paid 500, collective 300) are read back into a charge')
assert.ok(/capFindersFeeCents\(/.test((k.split('export function sourceAwareTakeRateCents')[1] || '').split('\n}')[0]), 'a Space fee is not held to the cap')
assert.ok(/capFindersFeeCents\(/.test((readFileSync('lib/billing/fees.ts', 'utf8').split('export async function spaceTakeRateCents')[1] || '').split('\n}')[0]), 'spaceTakeRateCents does not hold the fee to the cap')
console.log('LIVE-754: one finder\'s fee, 10% capped at $20, and the retired ladder is not read')
