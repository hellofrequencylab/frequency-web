#!/usr/bin/env node
// LIVE-2422: a seller's earnings on screen match their payout once the card fee passes through. The earnings views
// in lib/commerce/orders.ts work a net as gross minus Frequency's fee. From the pass-through date a sale also loses
// the card fee before it reaches the seller, so that net would overstate every payout. Fails until the earnings
// rollups take the card fee a sale carried (sellerFeesAt or cardFeeCentsAt, from the sale's amount and time) off the net.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const orders = readFileSync('lib/commerce/orders.ts', 'utf8')
assert.ok(/from '@\/lib\/billing\/card-fee'/.test(orders) && /(cardFeeCentsAt|sellerFeesAt)\(/.test(orders), 'the earnings views do not subtract the card fee')
assert.ok(!/out\.netCents = out\.grossCents - out\.feeCents\s*$/m.test(orders), 'an earnings net is still gross minus the platform fee alone')
console.log('LIVE-2422: earnings nets subtract the card fee a sale carried')
