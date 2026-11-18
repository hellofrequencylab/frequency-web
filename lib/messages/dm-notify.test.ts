import { describe, it, expect, vi, beforeEach } from 'vitest'

// EMAIL-055: a direct message tells the recipient once per unread burst, through the router.
vi.mock('server-only', () => ({}))
process.env.UNSUBSCRIBE_SECRET = 'test-secret'
const routed: { event: string; recipient: Record<string, unknown>; ctx: Record<string, unknown> }[] = []
vi.mock('@/lib/notifications/router', () => ({
  routeNotification: async (event: string, recipient: Record<string, unknown>, ctx: Record<string, unknown>) => {
    routed.push({ event, recipient, ctx })
    return { event, outcomes: [], enqueuedCount: 1 }
  },
}))

import { startsUnreadBurst, notifyDirectMessage } from './dm-notify'

function fakeAdmin(opts: { lastReadAt: string | null; previous: { id: string; created_at: string }[]; recipientDemo?: boolean }) {
  const chain = (result: unknown) => {
    const q: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'order', 'in']) q[m] = () => q
    q.maybeSingle = async () => result
    q.limit = async () => result
    q.then = (r: (v: unknown) => unknown) => Promise.resolve(result).then(r)
    return q
  }
  return {
    from: (t: string) => {
      if (t === 'conversation_participants') return chain({ data: { last_read_at: opts.lastReadAt } })
      if (t === 'messages') return chain({ data: opts.previous })
      return chain({ data: [
        { id: 's', display_name: 'Sam', auth_user_id: 'u-s', is_demo: false },
        { id: 'r', display_name: 'Maya', auth_user_id: 'u-r', is_demo: !!opts.recipientDemo },
      ] })
    },
    auth: { admin: { getUserById: async () => ({ data: { user: { email: 'maya@x.test' } } }) } },
  } as never
}

beforeEach(() => { routed.length = 0 })

describe('startsUnreadBurst', () => {
  it('notifies the first message, and the first after the recipient caught up', () => {
    expect(startsUnreadBurst(null, null)).toBe(true)
    expect(startsUnreadBurst('2026-11-18T10:05:00Z', '2026-11-18T10:00:00Z')).toBe(true)
  })
  it('stays quiet while an earlier message from the sender is still unread', () => {
    expect(startsUnreadBurst('2026-11-18T09:00:00Z', '2026-11-18T10:00:00Z')).toBe(false)
    expect(startsUnreadBurst(null, '2026-11-18T10:00:00Z')).toBe(false)
  })
})

describe('notifyDirectMessage', () => {
  it('routes message.direct with an email and the thread link', async () => {
    await notifyDirectMessage(fakeAdmin({ lastReadAt: null, previous: [{ id: 'm1', created_at: '2026-11-18T10:00:00Z' }] }), {
      conversationId: 'c1', senderId: 's', recipientId: 'r', messageId: 'm1', body: 'Is the room still free?',
    })
    expect(routed).toHaveLength(1)
    expect(routed[0].event).toBe('message.direct')
    expect(routed[0].recipient).toEqual({ profileId: 'r', email: 'maya@x.test' })
    expect(routed[0].ctx.url).toBe('/messages/c1')
    expect((routed[0].ctx.email as { subject: string }).subject).toBe('Sam sent you a message')
  })
  it('skips a follow-up while the first is unread, and never notifies a demo profile', async () => {
    await notifyDirectMessage(fakeAdmin({ lastReadAt: null, previous: [{ id: 'm2', created_at: '2026-11-18T10:01:00Z' }, { id: 'm1', created_at: '2026-11-18T10:00:00Z' }] }), {
      conversationId: 'c1', senderId: 's', recipientId: 'r', messageId: 'm2', body: 'Hello?',
    })
    await notifyDirectMessage(fakeAdmin({ lastReadAt: null, previous: [], recipientDemo: true }), {
      conversationId: 'c1', senderId: 's', recipientId: 'r', body: 'Hi',
    })
    expect(routed).toHaveLength(0)
  })
})
