import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// FH-042S: the Trail page's answer form. The action passes the guess on and words the verdict.
const mocks = vi.hoisted(() => ({
  getCallerProfile: vi.fn(), loadScanPlacement: vi.fn(), openClaim: vi.fn(), claimAsPlayer: vi.fn(), revalidatePath: vi.fn(),
  loadPublishedTrail: vi.fn(), loadPlayerRun: vi.fn(), loadRunCredits: vi.fn(), loadUniquePlacementMission: vi.fn(),
}))
vi.mock('@/lib/auth', () => ({ getCallerProfile: mocks.getCallerProfile }))
vi.mock('@/lib/hunts/claim-store', () => ({ loadScanPlacement: mocks.loadScanPlacement, openClaim: mocks.openClaim, claimAsPlayer: mocks.claimAsPlayer }))
vi.mock('@/lib/hunts/run-store', () => ({ loadPublishedTrail: mocks.loadPublishedTrail, loadPlayerRun: mocks.loadPlayerRun, loadRunCredits: mocks.loadRunCredits }))
vi.mock('@/lib/hunts/staff-store', () => ({ loadUniquePlacementMission: mocks.loadUniquePlacementMission }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))

import { claimStopAction } from './actions'

const form = (fields: Record<string, string>) => {
  const f = new FormData()
  for (const [k, v] of Object.entries(fields)) f.set(k, v)
  return f
}
const idle = { status: 'idle' as const, message: '' }
const rule = (members: string[]) => [{ logic: 'any' as const, members }]
const trail = {
  huntId: 'h-1', versionId: 'v-1',
  graph: {
    missions: [
      { mission_key: 'stop-1', rule_groups: [] },
      { mission_key: 'stop-2', kind: 'answer', fallback_group: 'mystery-1', rule_groups: rule(['stop-1']) },
      { mission_key: 'stop-3', fallback_group: 'mystery-1', rule_groups: rule(['stop-1']) },
      { mission_key: 'stop-4', choice_group: 'choice-1', rule_groups: rule(['stop-2', 'stop-3']) },
      { mission_key: 'stop-5', choice_group: 'choice-1', rule_groups: rule(['stop-2', 'stop-3']) },
    ],
    finish: { rule_groups: rule(['stop-4', 'stop-5']) },
  },
  content: [1, 2, 3, 4, 5].map((n) => ({ mission_key: `stop-${n}`, title: `P${n}`, visible_body: `C${n}`, locked_teaser: null })),
}

beforeEach(() => {
  vi.stubEnv('HUNTS_ENABLED', 'on')
  vi.stubEnv('HUNTS_CLAIMS_ENABLED', 'on')
  mocks.getCallerProfile.mockResolvedValue({ id: 'player-1' })
  mocks.loadScanPlacement.mockResolvedValue({ id: 'pl-2', huntId: 'h-1', revokedAt: null, huntSlug: 'coast-trail' })
  mocks.openClaim.mockResolvedValue({ ok: true, runId: 'run-1', token: 'tok' })
  mocks.loadPublishedTrail.mockResolvedValue(trail)
  mocks.loadPlayerRun.mockResolvedValue({ runId: 'run-1', state: 'active' })
  mocks.loadRunCredits.mockResolvedValue([{ mission_key: 'stop-1' }])
  mocks.loadUniquePlacementMission.mockResolvedValue('stop-2')
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetAllMocks()
})

describe('claimStopAction with a Mystery answer', () => {
  it('passes the trimmed answer to claimAsPlayer and credits a right one', async () => {
    mocks.claimAsPlayer.mockResolvedValue({ ok: true, result: 'credited', replayed: false })
    expect((await claimStopAction(idle, form({ slug: 'coast-trail', code: 'stop-code-2', answer: '  Lighthouse ' }))).status).toBe('credited')
    expect(mocks.claimAsPlayer.mock.calls[0][1]).toMatchObject({ placementId: 'pl-2', answer: 'Lighthouse' })
  })

  it('asks for an answer, then says how many tries are left and gives the hint', async () => {
    mocks.claimAsPlayer.mockResolvedValue({ ok: false, reason: 'answer_required' })
    expect(await claimStopAction(idle, form({ slug: 'coast-trail', code: 'stop-code-2' }))).toEqual({ status: 'answer', message: 'This stop is a Mystery. Type your answer to confirm it.' })
    mocks.claimAsPlayer.mockResolvedValue({ ok: false, reason: 'answer_wrong', attemptsLeft: 3, hint: 'It guides ships.' })
    expect(await claimStopAction(idle, form({ slug: 'coast-trail', code: 'stop-code-2', answer: 'a buoy' }))).toEqual({ status: 'answer', message: 'Not quite. You have 3 tries left.', hint: 'It guides ships.' })
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it('points a locked Mystery at its stand-in stop and refreshes the Trail', async () => {
    mocks.claimAsPlayer.mockResolvedValue({ ok: false, reason: 'answer_locked', attemptsLeft: 0 })
    const out = await claimStopAction(idle, form({ slug: 'coast-trail', code: 'stop-code-2', answer: 'a pilot' }))
    expect(out).toEqual({ status: 'locked', message: 'That was your last try on this Mystery. Head to stop 3 instead. It counts the same.' })
    expect(mocks.loadUniquePlacementMission).toHaveBeenCalledWith('h-1', 'v-1', 'pl-2')
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/hunts/coast-trail/play')
  })

  it('says a stop on the other side of a fork was the other path', async () => {
    mocks.loadUniquePlacementMission.mockResolvedValue('stop-5')
    mocks.loadRunCredits.mockResolvedValue([{ mission_key: 'stop-1' }, { mission_key: 'stop-2' }, { mission_key: 'stop-4' }])
    mocks.claimAsPlayer.mockResolvedValue({ ok: false, reason: 'mission_not_eligible' })
    expect((await claimStopAction(idle, form({ slug: 'coast-trail', code: 'stop-code-5' }))).message).toBe('You took the other path at this fork, so this stop is closed on your run.')
  })

  it('keeps the plain refusal when the stop cannot be read', async () => {
    mocks.loadPublishedTrail.mockRejectedValue(new Error('down'))
    mocks.claimAsPlayer.mockResolvedValue({ ok: false, reason: 'mission_not_eligible' })
    expect((await claimStopAction(idle, form({ slug: 'coast-trail', code: 'stop-code-5' }))).message).toBe('This stop could not be confirmed.')
  })
})
