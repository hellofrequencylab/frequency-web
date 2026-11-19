#!/usr/bin/env node
// LIVE-2423: one finder's fee, charged once (ADR-1978). A sale Frequency introduced costs the seller 10%, never
// more than $20, on the customer's FIRST purchase only, whatever the plan and whatever they buy. Before this the
// rate was a ladder by plan (5 / 3 / 2) with no cap, a repeat shop, booking or donation buyer was charged again
// because only a past ticket counted as "bought before", and a membership paid the rate on every renewal.
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
const read = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : '')
const keys = read('lib/billing/pricing-keys.ts')
assert.ok(/FINDERS_FEE_BPS_DEFAULT = 1000\b/.test(keys) && /FINDERS_FEE_CAP_CENTS_DEFAULT = 2000\b/.test(keys), 'the finder\'s fee is not 10% capped at $20')
assert.ok(/export function capFindersFeeCents/.test(keys), 'nothing holds the fee to its cap')
const audience = read('lib/commerce/seller-audience.ts')
for (const table of ['event_tickets', 'commerce_orders', 'space_donations', 'space_memberships']) {
  assert.ok(new RegExp(`async function hasPrior[A-Za-z]+\\([\\s\\S]*?from\\('${table}'\\)`).test(audience), `a past ${table} purchase does not count as bought before`)
}
const checkout = read('lib/billing/space-membership-checkout.ts')
assert.ok(checkout.includes("...(fee > 0 ? { [FINDERS_FEE_MARK]: '1' } : {})"), 'a membership that carries a finder\'s fee is not marked')
assert.ok(read('lib/billing/membership-finders-fee.ts').includes('billing_reason === \'subscription_create\''), 'nothing ends a membership\'s finder\'s fee after its first invoice')
assert.ok(read('app/api/webhooks/stripe/route.ts').includes('await endMembershipFindersFee('), 'the invoice webhook does not end the finder\'s fee')
const actions = read('app/(main)/admin/pricing/actions.ts')
assert.ok(actions.includes('finder_bps: finder') && actions.includes('finder_cap_cents: capCents'), 'the pricing console cannot set the finder\'s fee and its cap')
console.log('LIVE-2423: one finder\'s fee, capped, charged once across tickets, orders, donations and memberships')
