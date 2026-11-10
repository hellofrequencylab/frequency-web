import { afterEach, describe, expect, it, vi } from 'vitest'

const rows: Record<string, unknown> = {}
const rpc = vi.fn()
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const q: Record<string, unknown> = {}
      for (const m of ['select', 'eq', 'order', 'limit']) q[m] = () => q
      q.maybeSingle = async () => ({ data: rows[table] ?? null })
      return q
    },
    rpc,
  }),
}))

import { signingSecret } from '@/lib/signing-secret'
import { claimAsPlayer, loadScanPlacement, openClaim } from './claim-store'
import { issueClaimToken } from './placement'

afterEach(() => {
  vi.unstubAllEnvs()
  for (const k of Object.keys(rows)) delete rows[k]
  rpc.mockReset()
})

const on = () => {
  vi.stubEnv('HUNTS_ENABLED', '1')
  vi.stubEnv('HUNTS_CLAIMS_ENABLED', '1')
  vi.stubEnv('HUNTS_PROOF_SECRET', 'test-proof-secret')
}
const NOW = 1_800_000_000

describe('claim adapter', () => {
  it('answers disabled while the claims switch is off, and touches nothing', async () => {
    expect(await openClaim('me', 'pl-1', NOW)).toEqual({ ok: false, reason: 'disabled' })
    expect(await claimAsPlayer('me', { placementId: 'pl-1', missionKey: 'm1', token: 't', idempotencyKey: 'k', nowEpoch: NOW })).toEqual({ ok: false, reason: 'disabled' })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('reads a placement with its Hunt slug, and null for none', async () => {
    expect(await loadScanPlacement('pl-1')).toBeNull()
    rows.hunt_placements = { id: 'pl-1', hunt_id: 'h-1', revoked_at: null }
    rows.hunts = { slug: 'north-county' }
    expect(await loadScanPlacement('pl-1')).toEqual({ id: 'pl-1', huntId: 'h-1', revokedAt: null, huntSlug: 'north-county' })
  })

  it('opens a claim for the actor\'s own active run and credits it through the database', async () => {
    on()
    rows.hunt_placements = { id: 'pl-1', hunt_id: 'h-1', revoked_at: null }
    rows.hunts = { slug: 'north-county' }
    rows.hunt_runs = { id: 'run-1', hunt_id: 'h-1', subject_profile_id: 'me', state: 'active' }
    const opened = await openClaim('me', 'pl-1', NOW)
    expect(opened).toMatchObject({ ok: true, runId: 'run-1' })
    rpc.mockResolvedValue({ data: { result: 'credited', claim_id: 'c-1' }, error: null })
    const token = opened.ok ? opened.token : ''
    const out = await claimAsPlayer('me', { placementId: 'pl-1', missionKey: 'm1', token, idempotencyKey: 'k1', nowEpoch: NOW + 1 })
    expect(out).toEqual({ ok: true, result: 'credited', claimId: 'c-1', replayed: false })
    expect(rpc).toHaveBeenCalledWith('hunt_claim_apply', expect.objectContaining({ p_actor: 'me', p_run_id: 'run-1', p_placement_id: 'pl-1', p_assurance: 'signed_node' }))
  })

  it('refuses another player\'s run and a bad token before calling the database', async () => {
    on()
    rows.hunt_placements = { id: 'pl-1', hunt_id: 'h-1', revoked_at: null }
    rows.hunts = { slug: 's' }
    rows.hunt_runs = { id: 'run-1', hunt_id: 'h-1', subject_profile_id: 'someone-else', state: 'active' }
    const secret = signingSecret('hunt-claim-proof', ['HUNTS_PROOF_SECRET'])
    const token = issueClaimToken({ secret, scope: { runId: 'run-1', placementId: 'pl-1' }, now: NOW })
    expect(await claimAsPlayer('me', { placementId: 'pl-1', missionKey: 'm1', token, idempotencyKey: 'k', nowEpoch: NOW })).toEqual({ ok: false, reason: 'no_run' })
    rows.hunt_runs = { id: 'run-1', hunt_id: 'h-1', subject_profile_id: 'me', state: 'active' }
    expect(await claimAsPlayer('me', { placementId: 'pl-1', missionKey: 'm1', token: 'x.y', idempotencyKey: 'k', nowEpoch: NOW })).toEqual({ ok: false, reason: 'bad_token' })
    expect(rpc).not.toHaveBeenCalled()
  })
})
