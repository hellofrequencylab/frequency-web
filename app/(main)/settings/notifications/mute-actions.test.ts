import { describe, it, expect, beforeEach, vi } from 'vitest'

// setSubjectMute — the per-Space / per-Circle mute write (app/(main)/settings/notifications).
//
// Two contracts under test:
//   1. THE GATE. The caller is established with getMyProfileId() and their membership of the
//      subject is re-derived from the DB (isMutableSubject). An anonymous caller, or a signed-in
//      caller naming a Space/Circle they don't belong to, must write NOTHING — the subject id is
//      client-supplied, so this is the check that stops a caller muting an arbitrary UUID.
//   2. THE ROUND TRIP. A mute writes muted=true for EVERY topic × channel pair of that subject
//      (and only that subject); an unmute writes muted=false for the same set, which the store
//      turns into row DELETEs so "absence = not muted" holds.

const { getMyProfileId, isMutableSubject, setSubjectTopicMute, revalidatePath } = vi.hoisted(() => ({
  getMyProfileId: vi.fn(),
  isMutableSubject: vi.fn(),
  setSubjectTopicMute: vi.fn(),
  revalidatePath: vi.fn(),
}))

vi.mock('next/cache', () => ({ revalidatePath }))
vi.mock('@/lib/auth', () => ({ getMyProfileId }))
vi.mock('@/lib/notification-preferences', async (importOriginal) => ({
  // The topic/channel vocabulary is the real one — the fan-out count is part of the contract.
  ...(await importOriginal<typeof import('@/lib/notification-preferences')>()),
  setSubjectTopicMute,
}))
vi.mock('./mute-subjects', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./mute-subjects')>()),
  isMutableSubject,
}))

import { setSubjectMute } from './mute-actions'
import { MUTE_CHANNELS, MUTE_TOPICS, MUTE_ROWS_PER_SUBJECT } from './mute-subjects'

beforeEach(() => {
  vi.clearAllMocks()
  getMyProfileId.mockResolvedValue('profile-1')
  isMutableSubject.mockResolvedValue(true)
  setSubjectTopicMute.mockResolvedValue(true)
})

describe('setSubjectMute — the membership gate', () => {
  it('refuses an anonymous caller without touching the store', async () => {
    getMyProfileId.mockResolvedValue(null)
    const res = await setSubjectMute('space', 'space-1', true)
    expect(res).toEqual({ error: 'Sign in to change your notifications.' })
    expect(isMutableSubject).not.toHaveBeenCalled()
    expect(setSubjectTopicMute).not.toHaveBeenCalled()
  })

  it('refuses a signed-in caller who is not a member of the subject', async () => {
    isMutableSubject.mockResolvedValue(false)
    const res = await setSubjectMute('space', 'a-space-i-am-not-in', true)
    expect(res).toEqual({ error: 'You can only mute a Circle or Space you belong to.' })
    expect(isMutableSubject).toHaveBeenCalledWith('profile-1', 'space', 'a-space-i-am-not-in')
    expect(setSubjectTopicMute).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('checks membership against the CALLER, never a client-supplied profile id', async () => {
    await setSubjectMute('circle', 'circle-9', true)
    expect(isMutableSubject).toHaveBeenCalledWith('profile-1', 'circle', 'circle-9')
    for (const call of setSubjectTopicMute.mock.calls) {
      expect(call[0]).toBe('profile-1')
      expect(call[1]).toEqual({ subjectType: 'circle', subjectId: 'circle-9' })
    }
  })

  it('rejects an unknown subject type or a blank id before any membership read', async () => {
    const bogus = await setSubjectMute('nexus' as 'space', 'space-1', true)
    expect(bogus).toEqual({ error: 'Could not find that Circle or Space.' })
    const blank = await setSubjectMute('space', '   ', true)
    expect(blank).toEqual({ error: 'Could not find that Circle or Space.' })
    expect(isMutableSubject).not.toHaveBeenCalled()
    expect(setSubjectTopicMute).not.toHaveBeenCalled()
  })
})

describe('setSubjectMute — the mute/unmute round trip', () => {
  it('mutes every topic on every channel for that subject, and only that subject', async () => {
    const res = await setSubjectMute('space', 'space-1', true)
    expect(res).toEqual({ data: undefined })

    expect(setSubjectTopicMute).toHaveBeenCalledTimes(MUTE_ROWS_PER_SUBJECT)
    expect(MUTE_ROWS_PER_SUBJECT).toBe(MUTE_TOPICS.length * MUTE_CHANNELS.length)

    const written = setSubjectTopicMute.mock.calls.map(
      ([profileId, subject, topic, channel, muted]) =>
        `${profileId}|${subject.subjectType}:${subject.subjectId}|${topic}|${channel}|${muted}`,
    )
    const expected = MUTE_TOPICS.flatMap((topic) =>
      MUTE_CHANNELS.map((channel) => `profile-1|space:space-1|${topic}|${channel}|true`),
    )
    expect(new Set(written)).toEqual(new Set(expected))
    expect(written).toHaveLength(expected.length)
    expect(revalidatePath).toHaveBeenCalledWith('/settings')
  })

  it('unmutes the same full set (muted=false, which the store turns into row deletes)', async () => {
    const res = await setSubjectMute('circle', 'circle-1', false)
    expect(res).toEqual({ data: undefined })
    expect(setSubjectTopicMute).toHaveBeenCalledTimes(MUTE_ROWS_PER_SUBJECT)
    for (const call of setSubjectTopicMute.mock.calls) {
      expect(call[4]).toBe(false)
      expect(call[1]).toEqual({ subjectType: 'circle', subjectId: 'circle-1' })
    }
  })

  it('a mute then an unmute of the same subject covers the identical topic × channel set', async () => {
    await setSubjectMute('space', 'space-1', true)
    const muted = setSubjectTopicMute.mock.calls.map(([, , topic, channel]) => `${topic}|${channel}`)
    setSubjectTopicMute.mockClear()

    await setSubjectMute('space', 'space-1', false)
    const cleared = setSubjectTopicMute.mock.calls.map(([, , topic, channel]) => `${topic}|${channel}`)

    expect(new Set(cleared)).toEqual(new Set(muted))
  })

  it('reports failure (and does not claim a save) when a pair fails to write', async () => {
    setSubjectTopicMute.mockResolvedValueOnce(false)
    const res = await setSubjectMute('space', 'space-1', true)
    expect(res).toEqual({ error: 'Could not save that. Try again.' })
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})
