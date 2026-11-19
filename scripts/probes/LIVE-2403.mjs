#!/usr/bin/env node
// LIVE-2403: card processing passes through to the seller on every single-seller checkout, from one effective date.
// Stripe debits its card fee from the platform on a destination charge, so an application fee that carries only
// Frequency's percentage leaves Frequency paying the card fee on every sale. Each checkout creator must price its
// application fee through lib/billing/card-fee.ts, and the date that turns it on must be documented where a rollout
// switch is: .env.example (blank) and docs/RUNBOOKS.md.
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
const read = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : '')
const fee = read('lib/billing/processing-fee.ts')
assert.ok(/CARD_PROCESSING_BPS = 290\b/.test(fee) && /CARD_PROCESSING_FIXED_CENTS = 30\b/.test(fee), 'the card fee is priced in one module at the standard rate')
const gate = read('lib/billing/card-fee.ts')
assert.ok(gate.includes("envStringOrNull('CARD_FEE_PASS_THROUGH_FROM')") && gate.includes('ISO_INSTANT.test(raw)'), 'the pass-through reads one effective date and refuses anything looser than a full timestamp')
const amount = ['lib/billing/tips.ts', 'lib/billing/space-donation-checkout.ts', 'lib/billing/tickets.ts', 'lib/commerce/checkout.ts']
for (const f of amount) {
  assert.ok(/application_fee_amount: (sellerFees|sellerFeesNow\([^)]*\))\.applicationFeeCents/.test(read(f)), `${f} sends an application fee that leaves out the card fee`)
}
const member = read('lib/billing/space-membership-checkout.ts')
assert.ok(member.includes('applicationFeePercent(amount, sellerFeesNow(amount, fee))'), 'a membership adds the card fee to its recurring application fee percent')
assert.ok(/^CARD_FEE_PASS_THROUGH_FROM=$/m.test(read('.env.example')), '.env.example lists the date blank')
assert.ok(read('docs/RUNBOOKS.md').includes('## Card fee pass-through'), 'the gate to set the date is in docs/RUNBOOKS.md')
assert.ok(read('lib/billing/ticket-sale-notify.ts').includes('sellerFeesAt(') && read('lib/billing/tips-notify.ts').includes('sellerFeesAt('), 'the sale and tip emails state the card fee')
console.log('LIVE-2403: every single-seller checkout prices its application fee through the card fee module')
