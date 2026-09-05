import { describe, it, expect, beforeEach, vi } from 'vitest'

// scan2 L5-12 (2026-09-05): blockProfileAction returns a failure with member copy, and does NOT
// revalidate, when the block write was refused. It used to return { ok: true } unconditionally.

const { getMyProfileId, blockUser, unblockUser, revalidatePath } = vi.hoisted(() => ({
  getMyProfileId: vi.fn(),
  blockUser: vi.fn(),
  unblockUser: vi.fn(),
  revalidatePath: vi.fn(),
}))

vi.mock('next/cache', () => ({ revalidatePath }))
vi.mock('@/lib/auth', () => ({ getMyProfileId }))
vi.mock('@/lib/blocking', () => ({ blockUser, unblockUser }))
vi.mock('@/lib/core/load-capabilities', () => ({ getProfileCapabilities: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))

import { blockProfileAction, unblockProfileAction } from './actions'

beforeEach(() => {
  vi.clearAllMocks()
  getMyProfileId.mockResolvedValue('me')
})

describe('blockProfileAction', () => {
  it('returns the failure and does not revalidate when the write was refused', async () => {
    blockUser.mockResolvedValue({ ok: false, error: 'Block did not save. Try again.' })
    const res = await blockProfileAction('them')
    expect(res).toEqual({ ok: false, error: 'Block did not save. Try again.' })
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('returns ok and revalidates when the block landed', async () => {
    blockUser.mockResolvedValue({ ok: true })
    expect(await blockProfileAction('them')).toEqual({ ok: true })
    expect(revalidatePath).toHaveBeenCalledWith('/people')
  })

  it('refuses a signed-out caller without writing', async () => {
    getMyProfileId.mockResolvedValue(null)
    const res = await blockProfileAction('them')
    expect(res.ok).toBe(false)
    expect(blockUser).not.toHaveBeenCalled()
  })
})

describe('unblockProfileAction', () => {
  it('returns the failure and does not revalidate when the delete was refused', async () => {
    unblockUser.mockResolvedValue({ ok: false, error: 'Unblock did not save. Try again.' })
    expect(await unblockProfileAction('them')).toEqual({ ok: false, error: 'Unblock did not save. Try again.' })
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})
