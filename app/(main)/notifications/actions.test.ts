import { describe, it, expect, beforeEach, vi } from 'vitest'

// scan2 L5-03 (2026-09-05): the bell's two loaders must report a failed RPC, not fold it into
// "no notifications" / "0 unread". Both used to read `data` alone.

const { rpc, getMyProfileId } = vi.hoisted(() => ({
  rpc: vi.fn(),
  getMyProfileId: vi.fn(),
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/auth', () => ({ getMyProfileId }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ rpc }) }))

import { getMyNotifications, getUnreadCount } from './actions'
import { UNREAD_COUNT_UNAVAILABLE } from '@/lib/notifications-map'

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  getMyProfileId.mockResolvedValue('p1')
})

describe('getMyNotifications', () => {
  it('returns kind error, and logs the RPC name, when my_notifications resolves { error }', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'timeout', code: '57014' } })
    const res = await getMyNotifications()
    expect(res).toEqual({ kind: 'error' })
    expect(console.error).toHaveBeenCalledWith(
      '[notifications] rpc failed',
      expect.objectContaining({ rpc: 'my_notifications', code: '57014' }),
    )
  })

  it('returns the mapped rows on a clean call', async () => {
    rpc.mockResolvedValue({
      data: [{
        id: 'n1', type: 'comment', reference_type: null, reference_id: null, body: 'hi',
        read_at: null, created_at: '2026-09-05T00:00:00Z',
        actor_id: 'a1', actor_display_name: 'Ana', actor_handle: 'ana', actor_avatar_url: null,
      }],
      error: null,
    })
    const res = await getMyNotifications()
    expect(res.kind).toBe('ok')
    if (res.kind === 'ok') {
      expect(res.items).toHaveLength(1)
      expect(res.items[0].actor?.display_name).toBe('Ana')
    }
  })

  it('is an empty ok result for a signed-out viewer, without calling the RPC', async () => {
    getMyProfileId.mockResolvedValue(null)
    expect(await getMyNotifications()).toEqual({ kind: 'ok', items: [] })
    expect(rpc).not.toHaveBeenCalled()
  })
})

describe('getUnreadCount', () => {
  it('returns the unavailable sentinel (never 0) when the count RPC resolves { error }', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'timeout', code: '57014' } })
    const n = await getUnreadCount()
    expect(n).toBe(UNREAD_COUNT_UNAVAILABLE)
    expect(n).toBeLessThan(0)
    expect(console.error).toHaveBeenCalledWith(
      '[notifications] rpc failed',
      expect.objectContaining({ rpc: 'my_unread_notification_count' }),
    )
  })

  it('returns the count on a clean call, and 0 for a null count', async () => {
    rpc.mockResolvedValue({ data: 4, error: null })
    expect(await getUnreadCount()).toBe(4)
    rpc.mockResolvedValue({ data: null, error: null })
    expect(await getUnreadCount()).toBe(0)
  })
})
