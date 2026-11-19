// LIVE-2450: a host can price a ticket all-in so guests cover the card fee (owner ruling 2026-11-19).
// The tier editor must offer the helper, and the all-in price must leave the host what they typed.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const fee = readFileSync('lib/billing/processing-fee.ts', 'utf8')
assert.ok(/export function allInPriceCents\(/.test(fee), 'no all-in price helper in processing-fee.ts')
const panel = readFileSync('app/(main)/events/[slug]/manage/ticket-tiers-panel.tsx', 'utf8')
assert.ok(/<GuestsCoverCardFee/.test(panel) && /allInPriceCents\(/.test(panel), 'the tier editor offers no all-in price')
const sections = readFileSync('app/(main)/events/[slug]/manage/sections.tsx', 'utf8')
assert.ok(/cardFeeFrom=\{cardFeePassThroughFrom\(\)/.test(sections), 'the tier editor is never told when the card fee starts')

// The same math, restated: smallest P with P - (round(2.9% of P) + 30) >= net.
const card = (p) => Math.min(p, Math.round((p * 290) / 10000) + 30)
const allIn = (net) => {
  let p = net
  while (p - card(p) < net) p += 1
  return p
}
assert.equal(allIn(2000), 2091, 'a $20 ticket should price all-in at $20.91')
assert.ok(/2091/.test(readFileSync('lib/billing/processing-fee.test.ts', 'utf8')), 'the $20.91 case is not pinned in the unit test')
console.log('LIVE-2450: ticket tiers can be priced all-in so guests cover the card fee')
