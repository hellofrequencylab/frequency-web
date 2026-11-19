#!/usr/bin/env node
// LIVE-2472: a seller can let guests cover the card fee on sales other than tickets (ADR-1978 item 6,
// owner ruling 2026-11-19: the seller's choice, unticked by default). Tickets do it with an all-in price
// (LIVE-2450). Fails until lib/billing/processing-fee.ts exports guestCoversCardFeeCents and the shop,
// Space membership and donation checkouts each call it.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const fee = strip(readFileSync('lib/billing/processing-fee.ts', 'utf8'))
assert.ok(/export function guestCoversCardFeeCents\(/.test(fee), 'processing-fee.ts has no guestCoversCardFeeCents')
for (const f of ['lib/commerce/checkout.ts', 'lib/billing/space-membership-checkout.ts', 'lib/billing/space-donation-checkout.ts']) {
  assert.ok(/guestCoversCardFeeCents\(/.test(strip(readFileSync(f, 'utf8'))), `${f} never offers the guest-covers option`)
}
console.log('LIVE-2472: shop, membership and donation checkouts let the guest cover the card fee')
