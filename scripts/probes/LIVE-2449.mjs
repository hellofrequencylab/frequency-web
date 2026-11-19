#!/usr/bin/env node
// LIVE-2449: 0% Frequency fee on every donation, even from a donor Frequency introduced (owner ruling
// 2026-11-19). Fails while the donation checkout prices its fee from the take rate.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const src = readFileSync('lib/billing/space-donation-checkout.ts', 'utf8')
assert.ok(/DONATION_FINDERS_FEE_CENTS = 0/.test(src), 'the donation fee is not pinned to 0')
assert.ok(!/spaceTakeRateCents\(/.test(src), 'the donation checkout still prices a take rate')
console.log('LIVE-2449: a donation carries no finder’s fee')
