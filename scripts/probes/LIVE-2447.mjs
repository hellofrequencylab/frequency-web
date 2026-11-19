#!/usr/bin/env node
// LIVE-2447: every sale email says which fee rule applied (ADR-1978 item 7). Before this a host read "Frequency's
// fee on this sale was $4" or "Network fee: $1.20" with no reason, so a fee looked like a cut of their own sale.
// The consequence: the ticket, shop and donation notices name the one-time finder's fee on a buyer Frequency
// introduced, and a zero says no finder's fee applied.
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
const read = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : '')
const ticket = read('lib/billing/ticket-sale-notify.ts')
assert.ok(ticket.includes("'Frequency took nothing on this sale: no finder’s fee applied.'"), 'a zero-fee ticket sale does not say no finder’s fee applied')
assert.ok(ticket.includes('Frequency introduced this buyer, so this sale carried the one-time finder’s fee of ${c.feeLabel}.'), 'a ticket sale with a fee does not say Frequency introduced the buyer')
assert.ok(read('lib/commerce/order-receipt.ts').includes("label: 'Finder’s fee, once (Frequency introduced this buyer)'"), 'a shop sale shows a bare network fee')
assert.ok(!/label: 'Network fee'/.test(read('lib/commerce/order-receipt.ts')), 'a shop sale still labels the fee a network fee')
const donation = read('lib/billing/donation-receipt.ts')
assert.ok(donation.includes("label: 'Finder’s fee, once (Frequency introduced this donor)'") && read('lib/billing/space-donation-checkout.ts').includes('platformFeeCents: row.platform_fee_cents ?? 0,'), 'a donation notice does not show the finder’s fee it carried')
console.log('LIVE-2447: ticket, shop and donation notices name the rule that applied')
