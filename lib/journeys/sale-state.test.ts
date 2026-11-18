import { beforeEach, describe, expect, it, vi } from 'vitest'

let result: { data: unknown; error: unknown } = { data: [], error: null }
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => {
    const q = { select: () => q, eq: () => q, neq: () => q, limit: () => Promise.resolve(result) }
    return { from: () => q }
  },
}))

import { getJourneySaleState } from './paid'

describe('getJourneySaleState (JRN-002)', () => {
  beforeEach(() => { result = { data: [], error: null } })

  it('is free with no product', async () => {
    expect(await getJourneySaleState('p')).toBe('free')
  })
  it('is on sale with an active product', async () => {
    result = { data: [{ status: 'active' }], error: null }
    expect(await getJourneySaleState('p')).toBe('on_sale')
  })
  it('is paused, not free, when the product is hidden or sold out', async () => {
    result = { data: [{ status: 'draft' }], error: null }
    expect(await getJourneySaleState('p')).toBe('paused')
    result = { data: [{ status: 'sold_out' }], error: null }
    expect(await getJourneySaleState('p')).toBe('paused')
  })
  it('fails closed when the read fails', async () => {
    result = { data: null, error: { message: 'boom' } }
    expect(await getJourneySaleState('p')).toBe('paused')
  })
})
