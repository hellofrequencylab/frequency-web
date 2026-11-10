#!/usr/bin/env node
// FH-002: run from the repository root with node --experimental-strip-types scripts/probes/hunts/legacy-seam-evidence.mjs.
// In-memory fault and replay evidence only. No live client or network is used.
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import '../../probe-ts.mjs'
import { fixtureProof, memberDay, nodeId, resetLegacyFixture, unexpected } from './legacy-seams-fixture.mjs'

const source = (path) => new URL(`../../../${path}`, import.meta.url).href
const fixture = new URL('./legacy-seams-fixture.mjs', import.meta.url).href
const allowed = new Set([
  'app/(main)/admin/qr/campaign-actions.ts',
  'lib/achievements.ts',
  'lib/action-result.ts',
  'lib/engagement/capture.ts',
  'lib/engagement/currency.ts',
  'lib/engagement/events.ts',
  'lib/engagement/verify.ts',
  'lib/gamification.ts',
  'lib/hunts/apply-claim.ts',
  'lib/loyalty/program.ts',
  'lib/loyalty/visit.ts',
  'lib/partners/offers.ts',
].map(source))
const mocked = new Set([
  'next/cache',
  '@/lib/admin/guard',
  '@/lib/automations',
  '@/lib/crm/interactions',
  '@/lib/gems',
  '@/lib/loyalty/hunts-visit',
  '@/lib/member-day',
  '@/lib/notifications/router',
  '@/lib/qr/node-code',
  '@/lib/seasons',
  '@/lib/supabase/admin',
  '@/lib/trust',
  '@/lib/zaps',
])

const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (!allowed.has(context.parentURL)) return next(specifier, context)
    if (mocked.has(specifier) || (specifier === './store' && context.parentURL === source('lib/loyalty/visit.ts'))) {
      return { url: fixture, shortCircuit: true }
    }
    const result = next(specifier, context)
    if (!allowed.has(result.url) && result.url !== 'node:crypto') unexpected(`dependency ${specifier}`)
    return result
  },
})

const realFetch = globalThis.fetch
globalThis.fetch = () => unexpected('network request')
try {
  resetLegacyFixture()
  const { createCampaign } = await import(source('app/(main)/admin/qr/campaign-actions.ts'))
  const { captureNode } = await import(source('lib/engagement/capture.ts'))
  const { recordEngagementEvent } = await import(source('lib/engagement/events.ts'))
  const { recordLoyaltyVisit } = await import(source('lib/loyalty/visit.ts'))
  const { applyClaim } = await import(source('lib/hunts/apply-claim.ts'))

  const create = (codeIds) => createCampaign({
    title: 'Fixture campaign', description: '', rewardZaps: 10, mode: 'collect_all',
    codeIds, validFrom: null, validUntil: null,
  })
  const scan = (qrCodeId) => recordEngagementEvent({
    idempotencyKey: `qrscan:${qrCodeId}:fixture-member`,
    source: 'qr',
    eventType: 'qr_scan',
    actorProfileId: 'fixture-member',
    context: { qrCodeId },
    gamificationEvent: { type: 'qr_scan', profileId: 'fixture-member', qrCodeId },
  })
  const capture = (actorProfileId) => captureNode({ nodeId, actorProfileId, presentedSecret: fixtureProof })

  async function scenario(label, check) {
    const state = resetLegacyFixture()
    await check(state)
    assert.deepEqual(state.faults, [], 'the scenario used an unmodeled dependency')
    console.log(`FH-002: ${label}`)
  }

  await scenario('duplicate campaign membership and scan keep one progress credit', async (state) => {
    const { data } = await create(['included', 'included', 'second'])
    assert.ok(data)
    assert.deepEqual(state.challenge_qr_codes.map((row) => row.qr_code_id), ['included', 'second'])
    assert.equal(state.season_challenges[0].target, 2)
    const first = await scan('included')
    assert.equal(first.recorded, true)
    assert.deepEqual(await scan('included'), { recorded: false, id: first.id })
    await scan('unlisted')
    assert.equal(state.engagement_events.length, 2)
    assert.equal(state.advanceCalls.length, 1)
    assert.equal(state.challenge_progress[0].current, 1)
    assert.deepEqual(state.reward_grants, [])

    // A second enrolled code completes the same campaign and really pays.
    await scan('second')
    assert.equal(state.challenge_progress[0].current, 2)
    assert.equal(state.reward_grants.length, 1)
    assert.deepEqual(state.zapEntries, [{ profileId: 'fixture-member', action: 'challenge_complete', amount: 10 }])
  })

  await scenario('post-capture interruption preserves the event and capture without replaying the award', async (state) => {
    state.interruptAward = true
    await assert.rejects(capture('fixture-member'), /fixture: award interrupted/)
    assert.deepEqual(await capture('fixture-member'), { ok: false, reason: 'already_captured' })
    assert.deepEqual(state.engagement_events.map((row) => row.event_type), ['node_capture'])
    assert.deepEqual(state.captures.map((row) => row.actor_profile_id), ['fixture-member'])
    assert.deepEqual(state.zapEntries, [])
  })

  await scenario('exhausted capacity preserves the existing capture without issuing credits', async (state) => {
    state.nodes[0].max_claims = 1
    const existing = { node_id: nodeId, actor_profile_id: 'earlier', verified: true }
    state.captures.push(existing)
    const outcomes = await Promise.all([capture('fixture-a'), capture('fixture-b')])
    assert.deepEqual(outcomes, [
      { ok: false, reason: 'capacity_reached' },
      { ok: false, reason: 'capacity_reached' },
    ])
    assert.deepEqual(state.captures, [existing])
    assert.deepEqual(state.engagement_events, [])
    assert.deepEqual(state.zapEntries, [])
  })

  await scenario('existing Zap grant survives without a second payment', async (state) => {
    const { data } = await create(['included'])
    assert.ok(data)
    const grant = { rule_key: `challenge:${data.id}:fixture-member`, profile_id: 'fixture-member', reward_kind: 'zaps', amount: 10 }
    state.reward_grants.push(grant)
    state.zapEntries.push({ profileId: 'fixture-member', action: 'challenge_complete', amount: 10 })
    await scan('included')
    assert.equal(state.challenge_progress[0].current, 1)
    assert.deepEqual(state.reward_grants, [grant])
    assert.deepEqual(state.zapEntries, [{ profileId: 'fixture-member', action: 'challenge_complete', amount: 10 }])
  })

  await scenario('same-day Regulars stamp stays single while separate Hunt evidence is accepted and replayed', async (state) => {
    const first = await recordLoyaltyVisit('fixture-space', 'fixture-member', memberDay)
    const retry = await recordLoyaltyVisit('fixture-space', 'fixture-member', memberDay)
    assert.equal(first.zapsAwarded, 25)
    assert.equal(retry.zapsAwarded, 0)
    assert.equal(retry.outcome?.stamps, 1)

    const claim = {
      actorId: 'fixture-member', runId: 'fixture-run', missionKey: 'fixture-mission',
      placementId: 'fixture-placement', evidenceId: 'fixture-hunt-proof',
      assurance: 'signed_node', idempotencyKey: 'fixture-hunt-attempt',
    }
    const claims = new Map()
    const rpc = async (name, args) => {
      assert.equal(name, 'hunt_claim_apply')
      assert.equal(args.p_evidence_id, claim.evidenceId)
      const previous = claims.get(args.p_idempotency_key)
      if (previous) assert.equal(previous, args.p_request_hash)
      else claims.set(args.p_idempotency_key, args.p_request_hash)
      return { data: { result: 'credited', claim_id: 'fixture-claim', replayed: Boolean(previous) }, error: null }
    }
    assert.deepEqual(await applyClaim(rpc, claim), { result: 'credited', claimId: 'fixture-claim', replayed: false })
    assert.deepEqual(await applyClaim(rpc, claim), { result: 'credited', claimId: 'fixture-claim', replayed: true })
    assert.equal(claims.size, 1)
    assert.equal(state.stamps.size, 1)
    assert.deepEqual(state.zapEntries, [{ profileId: 'fixture-member', action: 'space_checkin', amount: 25 }])
  })
} finally {
  globalThis.fetch = realFetch
  hooks.deregister()
}
