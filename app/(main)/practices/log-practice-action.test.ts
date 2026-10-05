import { describe, it, expect, vi, beforeEach } from 'vitest'

// logPracticeAction (SCAN-723): the member-callable one-tap log NEVER forwards client-supplied
// seconds to logPractice. Before this pin the action took a `timed` argument and passed its
// secondsDone / secondsTarget straight through, so a member could call it with
// { secondsDone: 3600, secondsTarget: 1 }, skip the uses_timer refusal (which only runs when the
// target is <= 0), and be paid a Heavy-tier sit plus a streak tick without the timer ever running.
// Timed logs come only through the On Air completeSession path, which derives elapsed time from
// the server-side session row.
//
// Network-free: auth, the rate limiter, logPractice and revalidatePath are stubbed.

const mocks = vi.hoisted(() => ({
  getMyProfileId: vi.fn<() => Promise<string | null>>(),
  logPractice: vi.fn(),
  rateLimitOk: vi.fn(),
  revalidatePath: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({ getMyProfileId: mocks.getMyProfileId, getCallerProfile: vi.fn() }))
vi.mock('@/lib/practices', () => ({ logPractice: mocks.logPractice }))
vi.mock('@/lib/rate-limit', () => ({ rateLimitOk: mocks.rateLimitOk }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))

import { logPracticeAction } from './actions'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getMyProfileId.mockResolvedValue('p1')
  mocks.rateLimitOk.mockResolvedValue(true)
  mocks.logPractice.mockResolvedValue({ logged: true, zapsAwarded: 5 })
})

describe('logPracticeAction (SCAN-723)', () => {
  it('always calls logPractice with secondsDone and secondsTarget pinned to null', async () => {
    const res = await logPracticeAction('practice-1', 'circle-1', 'America/New_York')
    expect('data' in res).toBe(true)
    expect(mocks.logPractice).toHaveBeenCalledTimes(1)
    expect(mocks.logPractice).toHaveBeenCalledWith({
      profileId: 'p1',
      practiceId: 'practice-1',
      circleId: 'circle-1',
      clientTimezone: 'America/New_York',
      secondsDone: null,
      secondsTarget: null,
    })
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/practices')
  })

  it('ignores client-supplied seconds: an extra argument never reaches logPractice', async () => {
    // A hostile caller sends a fourth argument the way the old signature accepted it. The action
    // no longer has that parameter, so the numbers must not appear in the logPractice input.
    const hostile = logPracticeAction as unknown as (...args: unknown[]) => Promise<unknown>
    await hostile('practice-1', null, null, { secondsDone: 3600, secondsTarget: 1 })
    const input = mocks.logPractice.mock.calls[0]![0] as { secondsDone: unknown; secondsTarget: unknown }
    expect(input.secondsDone).toBeNull()
    expect(input.secondsTarget).toBeNull()
  })

  it('surfaces the timer gate as a fail so the UI sends the member to the timer', async () => {
    mocks.logPractice.mockResolvedValue({ logged: false, zapsAwarded: 0, timerRequired: true })
    const res = await logPracticeAction('timed-practice')
    expect('error' in res).toBe(true)
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it('refuses when not signed in, without touching logPractice', async () => {
    mocks.getMyProfileId.mockResolvedValue(null)
    const res = await logPracticeAction('practice-1')
    expect('error' in res).toBe(true)
    expect(mocks.logPractice).not.toHaveBeenCalled()
  })
})
