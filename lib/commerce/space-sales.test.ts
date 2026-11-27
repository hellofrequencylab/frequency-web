import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))

import { saleStatus } from './space-sales'

describe('saleStatus (LIVE-2545)', () => {
  it('reads a settled sale as paid', () => {
    expect(saleStatus('succeeded', null)).toBe('paid')
  })
  it('reads either the status or the stamp as refunded', () => {
    expect(saleStatus('refunded', null)).toBe('refunded')
    expect(saleStatus('succeeded', '2026-11-27T00:00:00Z')).toBe('refunded')
  })
  it('lists nothing that is not a sale', () => {
    expect(saleStatus('pending', null)).toBeNull()
    expect(saleStatus('failed', null)).toBeNull()
  })
})

import { lifetimeSpendCents } from './space-sales'

describe('lifetimeSpendCents (LIVE-2549)', () => {
  it('adds what stands and leaves refunds out', () => {
    expect(
      lifetimeSpendCents([
        { amountCents: 4400, status: 'paid' },
        { amountCents: 4400, status: 'refunded' },
        { amountCents: 1000, status: 'paid' },
      ]),
    ).toBe(5400)
  })
})
