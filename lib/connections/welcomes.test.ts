import { describe, it, expect, vi, beforeEach } from 'vitest'

// recordWelcome (lib/connections/welcomes.ts). Locks the order the reward and the greeting land in
// (scan2 L9-06): the `welcomes` insert is the idempotency guard, so NOTHING downstream runs when it
// is refused; when it lands, the newcomer gets a bell notification naming the welcomer, and only
// then is the presser paid. Before this the newcomer was never told, and the reward was for a
// greeting nobody received.

const mocks = vi.hoisted(() => ({
  welcomesInsertError: null as null | { message: string },
  notificationsInsert: vi.fn(async (_row: Record<string, unknown>) => ({ error: null as null | { message: string } })),
  awardGems: vi.fn(async () => ({ awarded: true, amount: 5 })),
  calls: [] as string[],
}))

vi.mock('next/cache', () => ({ revalidatePath: () => {} }))
vi.mock('@/lib/auth', () => ({ getCallerProfile: async () => ({ id: 'welcomer-1' }) }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({}) }))
vi.mock('@/lib/gems', () => ({
  awardGems: (...args: unknown[]) => {
    mocks.calls.push('awardGems')
    return (mocks.awardGems as unknown as (...a: unknown[]) => Promise<unknown>)(...args)
  },
}))
vi.mock('@/lib/connections/connection-settings', () => ({
  getConnectionSettings: async () => ({ rewardWelcome: 5 }),
}))

// A newcomer created today who shares one active circle with the welcomer.
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === 'profiles') {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: { id: 'newcomer-1', created_at: new Date().toISOString() } }) }),
          }),
        }
      }
      if (table === 'memberships') {
        return {
          select: (_cols: string, opts?: { count?: string; head?: boolean }) => {
            const chain = {
              eq: () => chain,
              in: async () => ({ count: 1 }),
              then: undefined as unknown,
            }
            if (opts?.head) return chain
            return {
              eq: () => ({ eq: async () => ({ data: [{ circle_id: 'c1' }] }) }),
            }
          },
        }
      }
      if (table === 'welcomes') {
        return {
          insert: async () => {
            mocks.calls.push('welcomes.insert')
            return { error: mocks.welcomesInsertError }
          },
        }
      }
      if (table === 'notifications') {
        return {
          insert: async (row: Record<string, unknown>) => {
            mocks.calls.push('notifications.insert')
            return mocks.notificationsInsert(row)
          },
        }
      }
      throw new Error(`unexpected table ${table}`)
    },
  }),
}))

import { recordWelcome } from './welcomes'

beforeEach(() => {
  mocks.welcomesInsertError = null
  mocks.calls.length = 0
  mocks.notificationsInsert.mockClear()
  mocks.awardGems.mockClear()
})

describe('recordWelcome', () => {
  it('a refused welcomes insert pays no gem and sends no notification', async () => {
    mocks.welcomesInsertError = { message: 'permission denied for table welcomes' }
    const r = await recordWelcome('newcomer-1')
    expect(r.awarded).toBe(false)
    expect(r.error).toMatch(/permission denied/)
    expect(mocks.notificationsInsert).not.toHaveBeenCalled()
    expect(mocks.awardGems).not.toHaveBeenCalled()
  })

  it('a duplicate welcome is a quiet no-op: no gem, no second notification', async () => {
    mocks.welcomesInsertError = { message: 'duplicate key value violates unique constraint' }
    const r = await recordWelcome('newcomer-1')
    expect(r).toEqual({ awarded: false, gems: 0, error: null })
    expect(mocks.notificationsInsert).not.toHaveBeenCalled()
    expect(mocks.awardGems).not.toHaveBeenCalled()
  })

  it('a landed welcome notifies the newcomer, naming the welcomer, and THEN pays the presser', async () => {
    const r = await recordWelcome('newcomer-1')
    expect(r).toEqual({ awarded: true, gems: 5, error: null })
    expect(mocks.notificationsInsert).toHaveBeenCalledTimes(1)
    expect(mocks.notificationsInsert.mock.calls[0][0]).toMatchObject({
      recipient_id: 'newcomer-1',
      actor_id: 'welcomer-1',
      type: 'welcome_received',
      reference_type: 'profile',
      reference_id: 'welcomer-1',
      body: 'welcomed you to Frequency',
    })
    expect(mocks.calls).toEqual(['welcomes.insert', 'notifications.insert', 'awardGems'])
  })

  it('a refused notification insert does not undo the welcome or the reward', async () => {
    mocks.notificationsInsert.mockResolvedValueOnce({ error: { message: 'rls' } })
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const r = await recordWelcome('newcomer-1')
    expect(r.awarded).toBe(true)
    expect(mocks.awardGems).toHaveBeenCalledTimes(1)
    expect(errSpy).toHaveBeenCalled()
    errSpy.mockRestore()
  })
})
