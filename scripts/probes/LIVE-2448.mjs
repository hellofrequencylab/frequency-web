#!/usr/bin/env node
// LIVE-2448: a new paid ticket or product charges at least $3 (owner ruling 2026-11-19). Under $3 the card
// fee takes most of a sale, and from the pass-through date that fee is the seller's. Fails unless the floor
// is one number in lib/billing/paid-price-floor.ts and every writer of a ticket or product price asks it.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const floor = readFileSync('lib/billing/paid-price-floor.ts', 'utf8')
assert.ok(/PAID_PRICE_MIN_CENTS = MIN_PAID_TIER_PRICE_CENTS/.test(floor), 'the floor is not the one $3 number')
for (const f of ['lib/commerce/products.ts', 'lib/commerce/variants.ts', 'lib/events/ticket-tiers.ts', 'app/(main)/journeys/[slug]/sell-actions.ts']) {
  assert.ok(/sellingPriceError\(/.test(readFileSync(f, 'utf8')), `${f} sets a price without the $3 floor`)
}
console.log('LIVE-2448: every ticket and product price writer asks the $3 floor')
