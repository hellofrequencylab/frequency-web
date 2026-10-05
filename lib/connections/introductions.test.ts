import { describe, it, expect, vi, beforeEach } from 'vitest'

// claimIntroductionRewards (lib/connections/introductions.ts). Its only caller is the async
// Server Component PeopleMode on the Friends page, which awaits it during render. Next throws
// when revalidatePath runs inside a render, so the one load that pays an introduction reward
// used to show the error boundary instead of the +Gems banner (SCAN-716). Pins: a paid reward
// returns the banner payload and never calls revalidatePath; createIntroduction, a real
// action, still revalidates.

const mocks = vi.hoisted(() => ({
  revalidatePath: vi.fn((_path: string) => {}),
  awardGems: vi.fn(async () => ({ awarded: true, amount: 15 })),
  friendsAccepted: true,
  pending: [{ id: 'intro-1', person_a_id: 'a', person_b_id: 'b' }] as Array<{
    id: string
    person_a_id: string
    person_b_id: string
  }>,
  claimed: [{ id: 'intro-1' }] as Array<{ id: string }>,
  recentCount: 0,
  insertError: null as null | { message: string },
}))

vi.mock('next/cache', () => ({ revalidatePath: (p: string) => mocks.revalidatePath(p) }))
vi.mock('@/lib/auth', () => ({ getCallerProfile: async () => ({ id: 'introducer-1' }) }))
vi.mock('@/lib/gems', () => ({
  awardGems: (...args: unknown[]) => (mocks.awardGems as unknown as (...a: unknown[]) => Promise<unknown>)(...args),
}))
vi.mock('@/lib/connections/connection-settings', () => ({
  getConnectionSettings: async () => ({ rewardIntroduction: 15 }),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === 'friendships') {
        return {
          // acceptedFriends: select → eq → or → maybeSingle
          select: () => ({
            eq: () => ({
              // The introducer always knows both people; the a/b pair is the toggle.
              or: (expr: string) => ({
                maybeSingle: async () => ({
                  data: expr.includes('introducer-1') || mocks.friendsAccepted ? { id: 'f1' } : null,
                }),
              }),
            }),
          }),
          // provenance stamp: update → or
          update: () => ({ or: async () => ({ error: null }) }),
        }
      }
      if (table === 'introductions') {
        return {
          select: (_cols: string, opts?: { count?: string; head?: boolean }) => {
            if (opts?.head) {
              return { eq: () => ({ gte: async () => ({ count: mocks.recentCount }) }) }
            }
            // pending list: select → eq → eq
            return { eq: () => ({ eq: async () => ({ data: mocks.pending }) }) }
          },
          // flag-first claim: update → eq → eq → select
          update: () => ({ eq: () => ({ eq: () => ({ select: async () => ({ data: mocks.claimed }) }) }) }),
          insert: async () => ({ error: mocks.insertError }),
        }
      }
      throw new Error(`unexpected table ${table}`)
    },
  }),
}))

import { claimIntroductionRewards, createIntroduction } from './introductions'

beforeEach(() => {
  mocks.revalidatePath.mockClear()
  mocks.awardGems.mockClear()
  mocks.friendsAccepted = true
  mocks.pending = [{ id: 'intro-1', person_a_id: 'a', person_b_id: 'b' }]
  mocks.claimed = [{ id: 'intro-1' }]
  mocks.recentCount = 0
  mocks.insertError = null
})

describe('claimIntroductionRewards (SCAN-716)', () => {
  it('pays the reward and returns the banner payload without calling revalidatePath', async () => {
    const result = await claimIntroductionRewards()
    expect(result).toEqual({ rewarded: 1, gems: 15 })
    expect(mocks.awardGems).toHaveBeenCalledTimes(1)
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it('returns zero and does not revalidate when nothing is pending', async () => {
    mocks.pending = []
    const result = await claimIntroductionRewards()
    expect(result).toEqual({ rewarded: 0, gems: 0 })
    expect(mocks.awardGems).not.toHaveBeenCalled()
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it('does not pay when the two people are not friends yet', async () => {
    mocks.friendsAccepted = false
    const result = await claimIntroductionRewards()
    expect(result).toEqual({ rewarded: 0, gems: 0 })
    expect(mocks.awardGems).not.toHaveBeenCalled()
  })
})

describe('createIntroduction', () => {
  it('still revalidates the Friends page: it is a real action, not a render', async () => {
    mocks.friendsAccepted = false
    const a = '11111111-1111-1111-1111-111111111111'
    const b = '22222222-2222-2222-2222-222222222222'
    const result = await createIntroduction(a, b, 'you two should talk')
    expect('error' in result).toBe(false)
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/network/friends')
  })
})
