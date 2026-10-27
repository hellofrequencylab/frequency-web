import { beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ profile: vi.fn(), is: vi.fn(), revalidate: vi.fn(), create: vi.fn() }))
vi.mock('@/lib/auth', () => ({ getMyProfileId: mocks.profile }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.create }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidate }))
import { markAllRead } from './actions'
beforeEach(() => { vi.clearAllMocks(); mocks.profile.mockResolvedValue('profile'); mocks.create.mockResolvedValue({ from: () => ({ update: () => ({ is: mocks.is }) }) }) })
it('refuses false persistence success and hides database internals', async () => {
  mocks.is.mockResolvedValue({ error: { message: 'private table detail' } })
  await expect(markAllRead()).rejects.toThrow('Could not mark notifications read')
  expect(mocks.revalidate).not.toHaveBeenCalled()
})
it('only revalidates after successful caller-RLS mutation', async () => {
  mocks.is.mockResolvedValue({ error: null }); await markAllRead()
  expect(mocks.is).toHaveBeenCalledWith('read_at', null); expect(mocks.revalidate).toHaveBeenCalledWith('/notifications')
})
it('does not mutate for a signed-out caller', async () => {
  mocks.profile.mockResolvedValue(null); await markAllRead(); expect(mocks.create).not.toHaveBeenCalled()
})
