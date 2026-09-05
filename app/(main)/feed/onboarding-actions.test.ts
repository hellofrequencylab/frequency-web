import { describe, it, expect, vi, beforeEach } from 'vitest'

// forceOnboardingStep (scan2 L6-09): the forced list is ONE key (`onboarding`) merged server-side.

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  revalidatePath: vi.fn(),
  getMyProfileId: vi.fn(),
  meta: {} as Record<string, unknown>,
  updates: [] as unknown[],
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    rpc: mocks.rpc,
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { meta: mocks.meta }, error: null }) }) }),
      update: (p: unknown) => {
        mocks.updates.push(p)
        return { eq: async () => ({ error: null }) }
      },
    }),
  }),
}))
vi.mock('@/lib/auth', () => ({ getMyProfileId: mocks.getMyProfileId }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))

import { forceOnboardingStep } from './onboarding-actions'

function form(step: string) {
  const fd = new FormData()
  fd.set('step', step)
  return fd
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.updates.length = 0
  mocks.rpc.mockResolvedValue({ data: {}, error: null })
  mocks.getMyProfileId.mockResolvedValue('p1')
  mocks.meta = { practiceStreak: { current: 2 }, onboarding: { forced: ['avatar'] } }
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('forceOnboardingStep', () => {
  it('merges only the onboarding key, keeping the prior forced steps', async () => {
    await forceOnboardingStep(form('circle'))
    expect(mocks.updates).toEqual([])
    expect(mocks.rpc).toHaveBeenCalledWith('merge_profile_meta', {
      p_profile_id: 'p1',
      p_patch: { onboarding: { forced: ['avatar', 'circle'] } },
    })
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/feed')
  })

  it('does not revalidate when the merge did not land, and ignores an unknown step', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'boom' } })
    await forceOnboardingStep(form('circle'))
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
    mocks.rpc.mockClear()
    await forceOnboardingStep(form('__proto__'))
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
})
