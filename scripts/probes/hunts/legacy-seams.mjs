#!/usr/bin/env node
// FH-002: the single entry for the five legacy seams. Run from the repository root:
//   node --experimental-strip-types --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/probes/hunts/legacy-seams.mjs
// It exits non-zero when any seam leaves different records than the ones pinned here.
//
// Seams 1, 2, 4 and 5, and the exhausted-capacity half of seam 3, live in legacy-seam-evidence.mjs.
// This file adds the other half: two members competing for the LAST unit of a capped code. Everything
// runs the shipped orchestrators against the in-memory fixture. No database, no network. It is not a
// Postgres race: it shows what the shipped caller does with the answers the database gives.
//
// Since FH-002S a capped node claims its unit through public.node_capture_claim, which holds the node
// row, counts and writes in one transaction. The fixture answers the way that function answers when
// the count and the write cannot be separated, so the pinned record is one winner, one refusal, one
// capture, one award. The SQL lock itself is proven in supabase/tests/node_capture_claim.test.sql and
// by a two-session race (see docs/hunts/EVIDENCE.md), not here.
//
// `--require-cap-held` is FH-002S's probe. It asserts the same held record and nothing weaker. The
// run also pins the state BEFORE the migration is applied (the function is missing, the caller falls
// back to count-then-insert and the last unit still oversells), so that fallback cannot change unseen.
import assert from 'node:assert/strict'
import { fixtureProof, nodeId, resetLegacyFixture } from './legacy-seams-fixture.mjs'

const requireCapHeld = process.argv.includes('--require-cap-held')
const source = (path) => new URL(`../../../${path}`, import.meta.url).href

// The first five scenarios. The import runs them and rejects on the first wrong record.
const realLog = console.log
const seamLines = []
console.log = (...args) => {
  if (String(args[0]).startsWith('FH-002: ')) seamLines.push(String(args[0]))
  realLog(...args)
}
try {
  await import('./legacy-seam-evidence.mjs')
} finally {
  console.log = realLog
}
assert.equal(seamLines.length, 5, 'legacy-seam-evidence.mjs must report all five seams')

// Same module instances the evidence run loaded (same URL), so they are still bound to the fixture.
const { captureNode } = await import(source('lib/engagement/capture.ts'))
const { grantReward } = await import(source('lib/hunts/rewards.ts'))

// Seam 3, last unit, legacy path. One unit left, two different members scan at the same moment.
async function lastUnitRace(capClaimInstalled) {
  const state = resetLegacyFixture()
  state.nodes[0].max_claims = 1
  state.capClaimInstalled = capClaimInstalled
  const outcomes = await Promise.all(
    ['fixture-a', 'fixture-b'].map((actorProfileId) => captureNode({ nodeId, actorProfileId, presentedSecret: fixtureProof })),
  )
  assert.deepEqual(state.faults, [], 'the race used an unmodeled dependency')
  const accepted = outcomes.filter((o) => o.ok).length
  const captures = state.captures.map((row) => row.actor_profile_id)
  const awards = state.zapEntries.filter((entry) => entry.action === 'node_capture').map((entry) => entry.profileId)
  const ledger = state.engagement_events.filter((row) => row.event_type === 'node_capture').length

  // True on either side of the fix: every accepted scan has exactly one capture, one ledger row and one award.
  assert.equal(captures.length, accepted, 'an accepted scan must leave exactly one capture row')
  assert.equal(ledger, accepted, 'an accepted scan must leave exactly one ledger row')
  assert.deepEqual(awards, captures, 'each captured member is paid once and nobody else is paid')
  return { state, outcomes, accepted, captures, awards }
}

// With the claim function installed: the cap holds. This is the pinned record, with or without the flag.
const held = await lastUnitRace(true)
assert.equal(held.accepted, 1, `the cap of 1 admitted ${held.accepted} members`)
assert.deepEqual(held.outcomes.filter((o) => !o.ok).map((o) => o.reason), ['capacity_reached'])
assert.deepEqual(held.captures, ['fixture-a'], 'one capture row for one unit')
// The winner tapping again does not spend a unit or get paid again; a later member is refused.
const replay = await captureNode({ nodeId, actorProfileId: 'fixture-a', presentedSecret: fixtureProof })
assert.equal(replay.ok, false)
assert.deepEqual(await captureNode({ nodeId, actorProfileId: 'fixture-c', presentedSecret: fixtureProof }), { ok: false, reason: 'capacity_reached' })
assert.equal(held.state.captures.length, 1)
assert.equal(held.state.zapEntries.length, 1)
console.log(
  `FH-002 scarcity race (legacy, last unit of 1): ${held.accepted} accepted, ${held.captures.length} capture rows, ` +
  `${held.awards.length} Zap awards. ${held.accepted > 1 ? 'OVERSOLD by ' + (held.accepted - 1) : 'cap held'}. ` +
  'Boundary: public.node_capture_claim (node row lock, count and both writes in one transaction).',
)

// Before the migration is applied the function is missing and the caller falls back to the old path:
// verifyCapture counts, captureNode inserts later, nothing holds the node between them. Pinned so the
// fallback stays the exact pre-fix behaviour, and so nobody reads "cap held" as true before the apply.
const before = await lastUnitRace(false)
assert.deepEqual(before.captures, ['fixture-a', 'fixture-b'], 'the pre-apply fallback changed: update this pin')
assert.deepEqual(await captureNode({ nodeId, actorProfileId: 'fixture-c', presentedSecret: fixtureProof }), { ok: false, reason: 'capacity_reached' })
assert.equal(before.state.captures.length, 2)
console.log(
  `FH-002 scarcity race (legacy, claim function not applied yet): ${before.accepted} accepted, ` +
  `${before.captures.length} capture rows, ${before.awards.length} Zap awards. Falls back to count-then-insert until ` +
  'supabase/migrations/20270346084000_node_capture_claim.sql is applied.',
)

// Seam 3, adapter side. The Hunt path does not count then insert: hunt_reward_grant takes the reward
// row lock, checks stock and writes the grant in one transaction. The stand-in below answers the way
// that function answers when the check and the write cannot be separated (one synchronous step). It
// proves what the shipped caller does with those answers. It does not prove the SQL lock.
const stock = { total: 1, grants: [] }
const rpc = async (name, args) => {
  assert.equal(name, 'hunt_reward_grant')
  if (stock.grants.length >= stock.total) return { data: { result: 'sold_out', terms: 'All claimed.' }, error: null }
  const grantId = `fixture-grant-${stock.grants.length + 1}`
  stock.grants.push({ grantId, actor: args.p_actor })
  return { data: { result: 'granted', grant_id: grantId }, error: null }
}
const grants = await Promise.all(['fixture-a', 'fixture-b'].map((actorId) => grantReward(rpc, {
  actorId, runId: `run-${actorId}`, rewardKey: 'last-one', idempotencyKey: `key-${actorId}`,
})))
assert.deepEqual(grants.map((g) => g.result).sort(), ['granted', 'sold_out'])
assert.equal(stock.grants.length, 1, 'one unit, one grant record')
assert.equal(grants.find((g) => g.result === 'sold_out').terms, 'All claimed.')
assert.equal(grants.find((g) => g.result === 'sold_out').grantId, undefined)
console.log(
  'FH-002 scarcity race (Hunt adapter, last unit of 1): 1 granted, 1 sold_out with terms, 1 grant record. ' +
  'Boundary: public.hunt_reward_grant (reward row lock plus the stock check constraint). ' +
  'Sequential proof: supabase/tests/hunt_rewards.test.sql. Two live sessions: not run here.',
)
console.log(`FH-002: all five seams ${requireCapHeld ? 'hold and the legacy cap held' : 'match their pinned records'}`)
