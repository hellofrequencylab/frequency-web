import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { judgeAnswer } from '@/lib/hunts/mystery'

const mocks = vi.hoisted(() => ({
  getCallerProfile: vi.fn(),
  loadChallenges: vi.fn(),
  saveChallenges: vi.fn(),
}))
vi.mock('@/lib/auth', () => ({ getCallerProfile: mocks.getCallerProfile }))
vi.mock('@/lib/hunts/store', () => ({ loadChallenges: mocks.loadChallenges, saveChallenges: mocks.saveChallenges }))

import { saveChallengesAction } from './challenge-actions'

const HUNT = '00000000-0000-4000-a042-000000000001'
const mystery = { stop: 3, mystery: true, question: 'What is painted on the door?', hint: '', fork: '', standIn: '1', answer: '  The Old Lighthouse ' }

beforeEach(() => {
  vi.stubEnv('HUNTS_ENABLED', 'on')
  vi.stubEnv('HUNTS_AUTHORING_ENABLED', 'on')
  mocks.getCallerProfile.mockResolvedValue({ id: 'author-1' })
  mocks.loadChallenges.mockResolvedValue([])
  mocks.saveChallenges.mockResolvedValue({ applied: true, revision: 8 })
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetAllMocks()
})

describe('saveChallengesAction (FH-042S)', () => {
  it('stores only the hash of a typed answer and sends back only that one is set', async () => {
    const res = await saveChallengesAction({ huntId: HUNT, baseRevision: 7, challenges: [mystery, { stop: 4, standIn: '1' }] })
    const [huntId, actor, base, stored] = mocks.saveChallenges.mock.calls[0]
    expect([huntId, actor, base]).toEqual([HUNT, { profileId: 'author-1' }, 7])
    expect(JSON.stringify(stored)).not.toMatch(/old lighthouse/i)
    expect(judgeAnswer({ stored: stored[0].answerHash, attempt: 'the old lighthouse', attemptsUsed: 0 })).toEqual({ outcome: 'correct' })
    expect(res).toEqual({ data: { revision: 8, challenges: [
      { stop: 3, mystery: true, question: 'What is painted on the door?', hint: '', fork: '', standIn: '1', answerSet: true },
      { stop: 4, mystery: false, question: '', hint: '', fork: '', standIn: '1', answerSet: false },
    ] } })
    expect(JSON.stringify(res)).not.toMatch(/s1:|lighthouse/i)
  })

  it('keeps the stored answer when the field is left blank', async () => {
    mocks.loadChallenges.mockResolvedValue([{ stop: 3, mystery: true, question: 'Q', hint: '', fork: '', standIn: '1', answerHash: 's1:' + 'a'.repeat(32) + ':' + 'b'.repeat(64) }])
    await saveChallengesAction({ huntId: HUNT, baseRevision: 7, challenges: [{ ...mystery, answer: '' }] })
    expect(mocks.saveChallenges.mock.calls[0][3][0].answerHash).toBe('s1:' + 'a'.repeat(32) + ':' + 'b'.repeat(64))
  })

  it('passes a stale tab back as a conflict', async () => {
    mocks.saveChallenges.mockResolvedValue({ applied: false, currentRevision: 9 })
    expect(await saveChallengesAction({ huntId: HUNT, baseRevision: 7, challenges: [] })).toEqual({ data: { conflict: true, currentRevision: 9 } })
  })

  it('refuses while authoring is off, signed out, on a Hunt that is not the caller\'s, or on bad input', async () => {
    vi.stubEnv('HUNTS_AUTHORING_ENABLED', '')
    expect('error' in (await saveChallengesAction({ huntId: HUNT, baseRevision: 7, challenges: [] }))).toBe(true)
    vi.stubEnv('HUNTS_AUTHORING_ENABLED', 'on')
    mocks.getCallerProfile.mockResolvedValueOnce(null)
    expect('error' in (await saveChallengesAction({ huntId: HUNT, baseRevision: 7, challenges: [] }))).toBe(true)
    mocks.loadChallenges.mockResolvedValueOnce(null)
    expect('error' in (await saveChallengesAction({ huntId: HUNT, baseRevision: 7, challenges: [] }))).toBe(true)
    expect('error' in (await saveChallengesAction({ huntId: HUNT, baseRevision: 0, challenges: [] }))).toBe(true)
    expect(mocks.saveChallenges).not.toHaveBeenCalled()
  })
})
