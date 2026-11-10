import { describe, expect, it } from 'vitest'
import { authorizeClaim, checkScope, type ScopeFacts } from './claim-guard'
import { issueClaimToken } from './placement'

const secret = 'test-secret'
const NOW = 1_800_000_000
const facts: ScopeFacts = {
  placement: { id: 'pl-1', huntId: 'h-1', revokedAt: null },
  run: { id: 'run-1', huntId: 'h-1', subjectProfileId: 'me', state: 'active' },
}
const token = (runId = 'run-1', placementId = 'pl-1', now = NOW) => issueClaimToken({ secret, scope: { runId, placementId }, now })
const base = { actorId: 'me', facts, token: token(), secret, nowEpoch: NOW + 5, missionKey: 'm1', idempotencyKey: 'k1' }

describe('authorizeClaim', () => {
  it('builds a signed_node claim for the actor, run and placement', () => {
    const out = authorizeClaim(base)
    expect(out).toMatchObject({ ok: true, input: { actorId: 'me', runId: 'run-1', placementId: 'pl-1', missionKey: 'm1', assurance: 'signed_node', evidenceId: 'node:pl-1', idempotencyKey: 'k1' } })
    expect(out.ok && out.requestHash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('refuses an unknown or revoked placement', () => {
    expect(authorizeClaim({ ...base, facts: { ...facts, placement: null } })).toEqual({ ok: false, reason: 'placement_not_found' })
    expect(authorizeClaim({ ...base, facts: { ...facts, placement: { ...facts.placement!, revokedAt: '2026-11-10' } } })).toEqual({ ok: false, reason: 'placement_revoked' })
  })

  it('refuses a run that is missing, someone else\'s or not active', () => {
    expect(checkScope('me', { ...facts, run: null })).toEqual({ ok: false, reason: 'no_run' })
    expect(checkScope('me', { ...facts, run: { ...facts.run!, subjectProfileId: 'other' } })).toEqual({ ok: false, reason: 'no_run' })
    expect(checkScope('me', { ...facts, run: { ...facts.run!, state: 'completed' } })).toEqual({ ok: false, reason: 'run_not_active' })
  })

  it('refuses a placement from another Hunt', () => {
    expect(checkScope('me', { ...facts, run: { ...facts.run!, huntId: 'h-2' } })).toEqual({ ok: false, reason: 'wrong_hunt' })
  })

  it('refuses a token for another run or placement, an expired one, and a wrong secret', () => {
    expect(authorizeClaim({ ...base, token: token('run-2') })).toEqual({ ok: false, reason: 'bad_token' })
    expect(authorizeClaim({ ...base, token: token('run-1', 'pl-2') })).toEqual({ ok: false, reason: 'bad_token' })
    expect(authorizeClaim({ ...base, nowEpoch: NOW + 601 })).toEqual({ ok: false, reason: 'bad_token' })
    expect(authorizeClaim({ ...base, secret: 'other' })).toEqual({ ok: false, reason: 'bad_token' })
  })
})
