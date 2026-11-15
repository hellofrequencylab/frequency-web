import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getCallerProfile: vi.fn(),
  loadScanPlacement: vi.fn(),
  openClaim: vi.fn(),
  claimAsPlayer: vi.fn(),
  revalidatePath: vi.fn(),
}))
vi.mock('@/lib/auth', () => ({ getCallerProfile: mocks.getCallerProfile }))
vi.mock('@/lib/hunts/claim-store', () => ({
  loadScanPlacement: mocks.loadScanPlacement, openClaim: mocks.openClaim, claimAsPlayer: mocks.claimAsPlayer,
}))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))

import { claimStopAction, type ClaimStopState } from './actions'

const idle: ClaimStopState = { status: 'idle', message: '' }
const form = (fields: Record<string, string>) => {
  const f = new FormData()
  for (const [k, v] of Object.entries(fields)) f.set(k, v)
  return f
}
const good = { slug: 'coast-trail', code: ' Stop-Code-1 ' }

beforeEach(() => {
  vi.stubEnv('HUNTS_ENABLED', 'on')
  vi.stubEnv('HUNTS_CLAIMS_ENABLED', 'on')
  mocks.getCallerProfile.mockResolvedValue({ id: 'player-1' })
  mocks.loadScanPlacement.mockResolvedValue({ id: 'pl-1', huntId: 'h-1', revokedAt: null, huntSlug: 'coast-trail' })
  mocks.openClaim.mockResolvedValue({ ok: true, runId: 'run-1', token: 'tok' })
  mocks.claimAsPlayer.mockResolvedValue({ ok: true, result: 'credited', replayed: false })
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetAllMocks()
})

describe('claimStopAction', () => {
  it('credits through claimAsPlayer with a stable key and the derived profile', async () => {
    const a = await claimStopAction(idle, form(good))
    expect(a.status).toBe('credited')
    expect(mocks.loadScanPlacement).toHaveBeenCalledWith({ code: 'stop-code-1' })
    expect(mocks.openClaim).toHaveBeenCalledWith('player-1', 'pl-1', expect.any(Number))
    const [actor, input] = mocks.claimAsPlayer.mock.calls[0]
    expect(actor).toBe('player-1')
    expect(input).toMatchObject({ placementId: 'pl-1', token: 'tok' })
    expect(input).not.toHaveProperty('missionKey')
    await claimStopAction(idle, form(good))
    expect(mocks.claimAsPlayer.mock.calls[1][1].idempotencyKey).toBe(input.idempotencyKey)
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/hunts/coast-trail/play')
  })

  it('reports a replay as already confirmed', async () => {
    mocks.claimAsPlayer.mockResolvedValue({ ok: true, result: 'already_credited', replayed: true })
    expect((await claimStopAction(idle, form(good))).status).toBe('already_credited')
  })

  it('does nothing while the claims switch is off', async () => {
    vi.stubEnv('HUNTS_CLAIMS_ENABLED', '')
    expect((await claimStopAction(idle, form(good))).status).toBe('error')
    expect(mocks.getCallerProfile).not.toHaveBeenCalled()
    expect(mocks.claimAsPlayer).not.toHaveBeenCalled()
  })

  it.each([
    ['signed out', () => mocks.getCallerProfile.mockResolvedValue(null)],
    ['unknown code', () => mocks.loadScanPlacement.mockResolvedValue(null)],
    ['revoked sign', () => mocks.loadScanPlacement.mockResolvedValue({ id: 'pl-1', huntId: 'h-1', revokedAt: 'x', huntSlug: 'coast-trail' })],
    ['code from another Trail', () => mocks.loadScanPlacement.mockResolvedValue({ id: 'pl-1', huntId: 'h-1', revokedAt: null, huntSlug: 'other' })],
    ['claim not opened', () => mocks.openClaim.mockResolvedValue({ ok: false, reason: 'no_run' })],
    ['refused by the store', () => mocks.claimAsPlayer.mockResolvedValue({ ok: false, reason: 'mission_not_eligible' })],
    ['database refusal', () => mocks.claimAsPlayer.mockResolvedValue({ ok: true, result: 'assurance_too_low', replayed: false })],
  ])('refuses: %s', async (_name, arrange) => {
    arrange()
    const out = await claimStopAction(idle, form(good))
    expect(out.status).toBe('error')
    expect(out.message).not.toMatch(/stop-code|placement|mission|run-1/i)
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it('rejects malformed input before any lookup', async () => {
    for (const fields of [{ slug: 'coast-trail', code: '!!' }, { slug: '../x', code: 'stop-code-1' }, { code: 'stop-code-1' }]) {
      expect((await claimStopAction(idle, form(fields))).status).toBe('error')
    }
    expect(mocks.loadScanPlacement).not.toHaveBeenCalled()
  })
})
