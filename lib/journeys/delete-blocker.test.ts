import { beforeEach, describe, expect, it, vi } from 'vitest'

let offers: { data: unknown; error: unknown } = { data: [], error: null }
let paid: { data: unknown; error: unknown } = { data: [], error: null }
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const res = table === 'commerce_products' ? offers : paid
      const q = { select: () => q, eq: () => q, neq: () => q, not: () => q, limit: () => Promise.resolve(res) }
      return q
    },
  }),
}))

import { journeyDeleteBlocker } from './paid'

describe('journeyDeleteBlocker (JRN-009)', () => {
  beforeEach(() => { offers = { data: [], error: null }; paid = { data: [], error: null } })

  it('lets a free Journey nobody paid for be deleted', async () => {
    expect(await journeyDeleteBlocker('p')).toBeNull()
  })
  it('refuses a Journey that is on sale', async () => {
    offers = { data: [{ id: 'x' }], error: null }
    expect(await journeyDeleteBlocker('p')).toMatch(/on sale/)
  })
  it('refuses a Journey people paid for, even off sale', async () => {
    paid = { data: [{ id: 'e' }], error: null }
    expect(await journeyDeleteBlocker('p')).toMatch(/paid/)
  })
  it('refuses when the check fails', async () => {
    paid = { data: null, error: { message: 'boom' } }
    expect(await journeyDeleteBlocker('p')).not.toBeNull()
  })
})
