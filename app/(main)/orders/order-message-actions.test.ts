import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  cart: true,
  me: 'buyer' as string | null,
  order: null as unknown,
  spaceOwner: 'owner' as string | null,
  blocked: false,
  rateOk: true,
  mine: [] as { conversation_id: string }[],
  shared: null as { conversation_id: string } | null,
  open: vi.fn(async (_id: string) => ({ ok: true as boolean, conversationId: 'new-conv', error: '' })),
  send: vi.fn(async (_conv: string, _fd: FormData) => {}),
}))

vi.mock('@/lib/commerce/cart-flag', () => ({ cartEnabled: () => m.cart }))
vi.mock('@/lib/auth', () => ({ getMyProfileId: async () => m.me }))
vi.mock('@/lib/commerce/orders', async (orig) => ({
  ...(await orig<typeof import('@/lib/commerce/orders')>()),
  getOrderForBuyer: async () => m.order,
}))
vi.mock('@/lib/spaces/store', () => ({ getSpaceById: async () => (m.spaceOwner ? { ownerProfileId: m.spaceOwner } : null) }))
vi.mock('@/lib/blocking', () => ({ isBlockedBetween: async () => m.blocked }))
vi.mock('@/lib/rate-limit', () => ({ rateLimitOk: async () => m.rateOk }))
vi.mock('@/app/(main)/messages/actions', () => ({ openDirectConversation: m.open, sendMessage: m.send }))
// The buyer's own session: the first participants read lists their threads, the second finds the seller in one.
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from: () => {
      // Two reads: my threads (ends at .eq) and the seller in one of them (ends at .maybeSingle).
      let lookingForSeller = false
      const q = {
        select: () => q,
        in: () => {
          lookingForSeller = true
          return q
        },
        limit: () => q,
        maybeSingle: async () => ({ data: m.shared }),
        eq: () => (lookingForSeller ? q : Promise.resolve({ data: m.mine })),
      }
      return q
    },
  }),
}))

import { messageSellerAboutOrder } from './order-message-actions'

const item = (title: string, seller: { kind: 'profile' | 'space'; profileId: string | null; spaceId: string | null }) => ({
  id: title,
  title,
  qty: 1,
  unitCents: 100,
  subtotalCents: 100,
  productKind: 'physical',
  seller,
})

beforeEach(() => {
  m.cart = true
  m.me = 'buyer'
  m.spaceOwner = 'owner'
  m.blocked = false
  m.rateOk = true
  m.mine = [{ conversation_id: 'conv-1' }]
  m.shared = { conversation_id: 'conv-1' }
  m.order = {
    id: 'order-123456789',
    status: 'paid',
    createdAt: '2026-11-18T12:00:00Z',
    items: [item('Mug', { kind: 'profile', profileId: 'maker', spaceId: null }), item('Tote', { kind: 'space', profileId: null, spaceId: 's1' })],
  }
  m.open.mockClear()
  m.send.mockClear()
  m.open.mockImplementation(async () => ({ ok: true, conversationId: 'new-conv', error: '' }))
})

describe('messageSellerAboutOrder', () => {
  it('stays dark while the cart switch is off', async () => {
    m.cart = false
    expect(await messageSellerAboutOrder('order-123456789', 'profile:maker')).toEqual({ error: 'Order messages are not open yet.' })
    expect(m.send).not.toHaveBeenCalled()
  })

  it('refuses an order that is not the buyer’s or not settled', async () => {
    m.order = null
    expect((await messageSellerAboutOrder('x', 'profile:maker')).error).toBe('That order is not available.')
    m.order = { id: 'x', status: 'failed', createdAt: '2026-11-18T00:00:00Z', items: [] }
    expect((await messageSellerAboutOrder('x', 'profile:maker')).error).toBe('That order is not available.')
  })

  it('never reaches a seller who is not on the order', async () => {
    expect((await messageSellerAboutOrder('order-123456789', 'profile:stranger')).error).toBe('That seller is not on this order.')
    expect(m.send).not.toHaveBeenCalled()
  })

  it('honours blocks and the rate limit', async () => {
    m.blocked = true
    expect((await messageSellerAboutOrder('order-123456789', 'profile:maker')).error).toBe('You cannot message this seller.')
    m.blocked = false
    m.rateOk = false
    expect((await messageSellerAboutOrder('order-123456789', 'profile:maker')).error).toMatch(/a lot of messages/)
    expect(m.send).not.toHaveBeenCalled()
  })

  it('posts the order line into the existing thread through the dock’s own send', async () => {
    const res = await messageSellerAboutOrder('order-123456789', 'profile:maker')
    expect(res).toEqual({ conversationId: 'conv-1' })
    expect(m.open).not.toHaveBeenCalled()
    const [conv, fd] = m.send.mock.calls[0]
    expect(conv).toBe('conv-1')
    expect(String(fd.get('body'))).toContain('Mug')
    expect(String(fd.get('body'))).not.toContain('Tote')
  })

  it('opens a thread for a friend when none exists, and routes a Space line to its owner', async () => {
    m.mine = []
    const res = await messageSellerAboutOrder('order-123456789', 'space:s1')
    expect(m.open).toHaveBeenCalledWith('owner')
    expect(res).toEqual({ conversationId: 'new-conv' })
  })

  it('points a non-friend with no thread at the listing instead of opening one', async () => {
    m.mine = []
    m.open.mockImplementation(async () => ({ ok: false, conversationId: '', error: 'friends' }))
    expect((await messageSellerAboutOrder('order-123456789', 'profile:maker')).error).toMatch(/Contact seller/)
    expect(m.send).not.toHaveBeenCalled()
  })

  it('reports a failed send', async () => {
    m.send.mockImplementation(async () => {
      throw new Error('rls')
    })
    expect((await messageSellerAboutOrder('order-123456789', 'profile:maker')).error).toBe('Could not send your message. Try again.')
  })

  it('refuses the buyer’s own listing', async () => {
    m.spaceOwner = 'buyer'
    expect((await messageSellerAboutOrder('order-123456789', 'space:s1')).error).toBe('This is your own listing.')
  })
})
