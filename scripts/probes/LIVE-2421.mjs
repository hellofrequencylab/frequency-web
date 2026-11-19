#!/usr/bin/env node
// LIVE-2421: a split order passes the card fee through too. A co-hosted ticket and a cart with more than one seller
// are charged on the platform and paid out by transfer, and the transfer ledger rebuilds each share's gross as
// amount + platform fee, so it has nowhere to hold a card fee. Until each share can carry its part of the card fee,
// Frequency pays it on every split order. Fails until the transfer ledger carries a card fee per share and the split
// ticket branch stops saying it is not covered.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const transfers = readFileSync('lib/commerce/transfers.ts', 'utf8')
assert.ok(/processing_fee_cents/.test(transfers), 'the transfer ledger has no card fee per share')
const tickets = readFileSync('lib/billing/tickets.ts', 'utf8')
assert.ok(!tickets.includes('Frequency still bears the card fee on a split ticket'), 'the split ticket branch still leaves the card fee with Frequency')
console.log('LIVE-2421: a split order carries the card fee on each share')
