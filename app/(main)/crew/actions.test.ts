import { describe, it, expect, vi, beforeEach } from 'vitest'

// logCompletion (SCAN-687): a circle task (circle_id set) is completable only by the member who
// holds its claim. The task id is a client prop, so the UI hiding CompleteButton is not a guard;
// the action is. Global catalogue tasks (circle_id null) stay open to every member (ADR-1295).

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  maybeSingle: vi.fn(),
  revalidatePath: vi.fn(),
  getMyProfileId: vi.fn(),
  processGamificationEvent: vi.fn(),
  recordStreakActivity: vi.fn(),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    rpc: mocks.rpc,
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mocks.maybeSingle }) }) }),
  }),
}))
vi.mock('@/lib/auth', () => ({ getMyProfileId: mocks.getMyProfileId }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))
vi.mock('@/lib/achievements', () => ({
  processGamificationEvent: mocks.processGamificationEvent,
  recordStreakActivity: mocks.recordStreakActivity,
}))

import { logCompletion } from './actions'

const baseTask = {
  id: 't1',
  zaps_value: 50,
  is_repeatable: false,
  requires_verification: false,
  task_type: 'volunteering',
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getMyProfileId.mockResolvedValue('me')
  mocks.rpc.mockResolvedValue({ data: 'c1', error: null })
  mocks.processGamificationEvent.mockResolvedValue(undefined)
  mocks.recordStreakActivity.mockResolvedValue(undefined)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('logCompletion', () => {
  it('refuses a circle task claimed by someone else: no RPC, no reward, no revalidate', async () => {
    mocks.maybeSingle.mockResolvedValue({ data: { ...baseTask, circle_id: 'c1', assigned_to: 'someone-else' } })
    await logCompletion('t1')
    expect(mocks.rpc).not.toHaveBeenCalled()
    expect(mocks.processGamificationEvent).not.toHaveBeenCalled()
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it('refuses an unclaimed circle task (a Host cannot complete their own open task)', async () => {
    mocks.maybeSingle.mockResolvedValue({ data: { ...baseTask, circle_id: 'c1', assigned_to: null } })
    await logCompletion('t1')
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('credits a circle task when the caller holds the claim', async () => {
    mocks.maybeSingle.mockResolvedValue({ data: { ...baseTask, circle_id: 'c1', assigned_to: 'me' } })
    await logCompletion('t1')
    expect(mocks.rpc).toHaveBeenCalledWith('log_crew_completion_atomic', {
      _profile: 'me', _task: 't1', _zaps: 50, _repeatable: false,
    })
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/crew')
  })

  it('keeps a global catalogue task (circle_id null) open to every member', async () => {
    mocks.maybeSingle.mockResolvedValue({ data: { ...baseTask, circle_id: null, assigned_to: null } })
    await logCompletion('t1')
    expect(mocks.rpc).toHaveBeenCalledTimes(1)
  })
})
