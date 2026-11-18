import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))

import { orderIsMessageable, orderMessageOpener, orderSellerLines } from './order-message'

const line = (title: string, seller: { kind: 'profile' | 'space'; profileId: string | null; spaceId: string | null } | null) => ({
  id: title,
  title,
  qty: 1,
  unitCents: 100,
  subtotalCents: 100,
  productKind: 'physical',
  seller,
})

describe('orderSellerLines', () => {
  const order = {
    items: [
      line('Mug', { kind: 'profile', profileId: 'p1', spaceId: null }),
      line('Tote', { kind: 'space', profileId: null, spaceId: 's1' }),
      line('Bowl', { kind: 'profile', profileId: 'p1', spaceId: null }),
      line('Gone', null),
    ],
  }
  it('returns the seller and only their lines', () => {
    expect(orderSellerLines(order, 'profile:p1')).toEqual({
      seller: { kind: 'profile', profileId: 'p1', spaceId: null },
      titles: ['Mug', 'Bowl'],
    })
    expect(orderSellerLines(order, 'space:s1')?.titles).toEqual(['Tote'])
  })
  it('never resolves a seller the buyer did not buy from', () => {
    expect(orderSellerLines(order, 'profile:p2')).toBeNull()
    expect(orderSellerLines(order, 'space:null')).toBeNull()
  })
})

describe('orderIsMessageable', () => {
  it('opens for bought orders only', () => {
    expect(orderIsMessageable('paid')).toBe(true)
    expect(orderIsMessageable('fulfilled')).toBe(true)
    expect(orderIsMessageable('refunded')).toBe(true)
    expect(orderIsMessageable('pending')).toBe(false)
    expect(orderIsMessageable('failed')).toBe(false)
  })
})

describe('orderMessageOpener', () => {
  it('names the order, the date and what was in it, with no em dash', () => {
    const text = orderMessageOpener({ orderId: 'abcdef1234567890', createdAt: '2026-11-18T12:00:00Z', titles: ['Mug', 'Bowl'] })
    expect(text).toBe('Hi! I have a question about my order from Nov 18, 2026: Mug, Bowl. Order ref abcdef12.')
    expect(text).not.toMatch(/[–—]/)
  })
  it('folds a long order', () => {
    const text = orderMessageOpener({ orderId: 'x', createdAt: '2026-01-02T00:00:00Z', titles: ['A', 'B', 'C', 'D', 'E'] })
    expect(text).toContain('A, B, C and 2 more.')
  })
})
