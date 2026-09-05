import { describe, it, expect, beforeEach, vi } from 'vitest'

// scan2 L5-12 (2026-09-05): blockUser reads the write's error and returns it. It used to return
// void with both writes discarded, so the caller reported a block that never saved.

const { upsert, del } = vi.hoisted(() => ({ upsert: vi.fn(), del: vi.fn() }))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => ({
      upsert: async (row: unknown, opts: unknown) => upsert(table, row, opts),
      delete: () => ({ match: async (m: unknown) => del(table, m) }),
    }),
  }),
}))

import { blockUser, unblockUser } from './blocking'

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  upsert.mockResolvedValue({ error: null })
  del.mockResolvedValue({ error: null })
})

describe('blockUser', () => {
  it('returns ok after the block row lands and the friendship is dropped', async () => {
    const res = await blockUser('a', 'b')
    expect(res).toEqual({ ok: true })
    expect(upsert).toHaveBeenCalledWith('blocked_users', { blocker_id: 'a', blocked_id: 'b' }, expect.any(Object))
    expect(del).toHaveBeenCalledWith('friendships', { user_a_id: 'a', user_b_id: 'b' })
  })

  it('returns a failure with member copy when the block write is refused, and does not unfriend', async () => {
    upsert.mockResolvedValue({ error: { message: 'permission denied', code: '42501' } })
    const res = await blockUser('a', 'b')
    expect(res).toEqual({ ok: false, error: 'Block did not save. Try again.' })
    expect(del).not.toHaveBeenCalled()
    expect(console.error).toHaveBeenCalledWith(
      '[blocking] blocked_users upsert failed',
      expect.objectContaining({ code: '42501' }),
    )
  })

  it('still reports ok when only the unfriend fails (the block is in place), and logs it', async () => {
    del.mockResolvedValue({ error: { message: 'timeout', code: '57014' } })
    expect(await blockUser('a', 'b')).toEqual({ ok: true })
    expect(console.error).toHaveBeenCalledWith('[blocking] friendships delete failed after block', expect.any(Object))
  })

  it('refuses a self-block without writing', async () => {
    const res = await blockUser('a', 'a')
    expect(res.ok).toBe(false)
    expect(upsert).not.toHaveBeenCalled()
  })
})

describe('unblockUser', () => {
  it('returns a failure when the delete is refused', async () => {
    del.mockResolvedValue({ error: { message: 'refused', code: '42501' } })
    expect(await unblockUser('a', 'b')).toEqual({ ok: false, error: 'Unblock did not save. Try again.' })
  })
})
