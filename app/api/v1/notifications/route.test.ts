import { beforeEach, describe, expect, it, vi } from 'vitest'
import { notificationsReadResponse, notificationsResponse } from '@/lib/contract'

// /api/v1/notifications (LIVE-716): the list with the unread count, and mark all read.

let authOk = true
const getMyNotifications = vi.fn()
const getUnreadCount = vi.fn()
const markAllRead = vi.fn()

vi.mock('@/lib/contract/caller', () => ({
  authorizeCaller: async () =>
    authOk ? { ok: true, via: 'bearer', caller: { id: 'p-1' }, profile: {} } : { ok: false, code: 'unauthorized', message: 'Sign in again.' },
  asCaller: (_auth: unknown, fn: () => unknown) => fn(),
}))
vi.mock('@/lib/rate-limit', () => ({ clientIp: () => '203.0.113.9', rateLimitOk: async () => true }))
vi.mock('@/app/(main)/notifications/actions', () => ({ getMyNotifications, getUnreadCount, markAllRead }))

beforeEach(() => {
  authOk = true
  getMyNotifications.mockReset().mockResolvedValue({
    kind: 'ok',
    items: [
      {
        id: 'n1',
        type: 'reaction',
        reference_type: 'post',
        reference_id: 'x',
        body: null,
        read_at: null,
        created_at: '2026-10-06T00:00:00Z',
        actor: { id: 'a-1', display_name: 'Ana', handle: 'ana', avatar_url: null },
      },
    ],
  })
  getUnreadCount.mockReset().mockResolvedValue(-1)
  markAllRead.mockReset().mockResolvedValue(undefined)
})

describe('/api/v1/notifications', () => {
  it('lists notifications, and an unavailable count is null rather than zero', async () => {
    const { GET } = await import('./route')
    const json = await (await GET(new Request('https://x/api/v1/notifications'))).json()
    expect(notificationsResponse.safeParse(json).success).toBe(true)
    expect(json.data.unread).toBeNull()
    expect(json.data.items[0].actor.handle).toBe('ana')
  })

  it('is internal when the list failed, never an empty list', async () => {
    getMyNotifications.mockResolvedValue({ kind: 'error' })
    const { GET } = await import('./route')
    expect((await GET(new Request('https://x/api/v1/notifications'))).status).toBe(500)
  })

  it('marks all read', async () => {
    const { POST } = await import('./read/route')
    const json = await (await POST(new Request('https://x/api', { method: 'POST' }))).json()
    expect(notificationsReadResponse.safeParse(json).success).toBe(true)
    expect(markAllRead).toHaveBeenCalled()
  })

  it('is a 401 signed out', async () => {
    authOk = false
    const { POST } = await import('./read/route')
    expect((await POST(new Request('https://x/api', { method: 'POST' }))).status).toBe(401)
    expect(markAllRead).not.toHaveBeenCalled()
  })
})
