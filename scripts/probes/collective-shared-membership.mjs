// LIVE-767 probe: shared membership across a Collective's member Spaces, and revenue splits on a
// co-hosted Event. Runs the REAL pure cores (no test runner, LIVE-475), plus the two seams the
// money path hangs on, read as source: the ticket checkout takes the separate plan when a split is
// present, and the join surface names the Collective a membership comes from.
//
//   node --experimental-strip-types --no-warnings --import ./scripts/probe-ts.mjs scripts/probes/collective-shared-membership.mjs
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { sharedMembershipScope } from '../../lib/collective/shared-membership.ts'
import {
  COLLABORATOR_SPLIT_MAX_BPS,
  planTicketSplit,
  splitMetadata,
  validateRevenueSplits,
} from '../../lib/events/revenue-splits.ts'
import { splitTotals } from '../../lib/commerce/funds-flow.ts'

// ── Shared membership applies under the member-Space relationship rule and not otherwise ──────
const relation = { childOwnerId: 'owner', parentOwnerId: 'owner', childStatus: 'active', childType: 'business', parentType: 'business', parentParentId: null }
const parent = { id: 'parent', plan: 'collective', status: 'active' }
assert.equal(sharedMembershipScope({ parentId: 'parent' }, parent, relation), true)
assert.equal(sharedMembershipScope({ parentId: 'parent' }, { ...parent, plan: 'nonprofit_collective' }, relation), true)
assert.equal(sharedMembershipScope({ parentId: 'other' }, parent, relation), false)
assert.equal(sharedMembershipScope({ parentId: 'parent' }, null, relation), false)
assert.equal(sharedMembershipScope({ parentId: 'parent' }, { ...parent, status: 'suspended' }, relation), false)
assert.equal(sharedMembershipScope({ parentId: 'parent' }, { ...parent, plan: 'business' }, relation), false)
assert.equal(sharedMembershipScope({ parentId: 'parent' }, parent), false)
for (const broken of [
  { ...relation, parentOwnerId: 'other' }, { ...relation, childOwnerId: null }, { ...relation, childStatus: 'suspended' },
  { ...relation, childType: 'root' }, { ...relation, parentType: 'root' }, { ...relation, parentParentId: 'nested' },
]) assert.equal(sharedMembershipScope({ parentId: 'parent' }, parent, broken), false)

// ── A split plan sums to the gross and the fee; the ledger's planner would accept it ──────────
const home = { spaceId: 'home', ownerProfileId: 'host', stripeAccountId: 'acct_home' }
const payee = (spaceId, bps) => ({ spaceId, ownerProfileId: `o-${spaceId}`, stripeAccountId: `acct_${spaceId}`, bps })
for (const [gross, fee] of [[3333, 166], [1, 0], [100000, 5000], [7, 7]]) {
  const splits = planTicketSplit({ grossCents: gross, platformFeeCents: fee, home, payees: [payee('a', 2500), payee('b', 1234)] })
  assert.deepEqual(splitTotals(splits), { grossCents: gross, platformFeeCents: fee })
  assert.equal(splits[0].seller.owner_space_id, 'home')
  for (const s of splits) assert.ok(s.grossCents > 0 && s.platformFeeCents >= 0 && s.platformFeeCents <= s.grossCents)
  for (const m of splitMetadata(splits)) assert.equal(typeof m.stripe_account_id, 'string')
}

// ── The set refuses over the cap, a non-Collaborator, and a payee without payouts ─────────────
const ctx = { collaboratorSpaceIds: ['a', 'b'], readySpaceIds: ['a'] }
assert.equal(COLLABORATOR_SPLIT_MAX_BPS, 9500)
assert.deepEqual(validateRevenueSplits([{ spaceId: 'a', bps: 9500 }], ctx), { ok: true, shares: [{ spaceId: 'a', bps: 9500 }] })
assert.deepEqual(validateRevenueSplits([{ spaceId: 'a', bps: 9501 }], ctx), { refused: 'over_cap' })
assert.deepEqual(validateRevenueSplits([{ spaceId: 'a', bps: 10000 }], ctx), { refused: 'over_cap' })
assert.deepEqual(validateRevenueSplits([{ spaceId: 'b', bps: 100 }], ctx), { refused: 'payouts_not_ready', spaceId: 'b' })
assert.deepEqual(validateRevenueSplits([{ spaceId: 'z', bps: 100 }], ctx), { refused: 'not_collaborator', spaceId: 'z' })
assert.deepEqual(validateRevenueSplits([{ spaceId: 'a', bps: 0 }], ctx), { ok: true, shares: [] })

// ── The seams, read as source ─────────────────────────────────────────────────────────────────
const tickets = readFileSync('lib/billing/tickets.ts', 'utf8')
assert.match(tickets, /\? \{ transfer_group: splitOrderId \}/)
assert.match(tickets, /funds_flow: 'separate'/)
assert.match(tickets, /settleSplitOrderTransfers\(orderId\)/)
assert.match(tickets, /reverseSplitRefundForPaymentIntent\(ticket\.stripe_payment_intent_id/)
assert.match(tickets, /holdsSharedMembership\(spaceId, profileId\)/)
assert.match(readFileSync('lib/spaces/memberships.ts', 'utf8'), /resolveSharedMembership\(spaceId, profileId\)/)
assert.match(readFileSync('components/spaces/membership-join.tsx', 'utf8'), /You are a member through \{mine\.via\.spaceName\}/)
const sql = readFileSync('supabase/migrations/20270346008100_event_revenue_splits.sql', 'utf8')
assert.match(sql, /unique \(event_id, space_id\)/)
assert.match(sql, /revoke all on table public\.event_revenue_splits from anon, authenticated/)
console.log('ok: shared membership follows the member-Space rule; ticket splits sum to the charge and refuse what the rule refuses')
