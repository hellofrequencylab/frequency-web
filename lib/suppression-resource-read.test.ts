import { expect, it, vi } from 'vitest'
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: () => ({ select: () => ({ eq: async () => ({ data: null, error: { code: '08006', message: 'unavailable' } }) }) }) }) }))
import { isSuppressed } from './suppression'
it('a resolved suppression read error fails closed globally and for a Space', async () => {
  expect(await isSuppressed('reader@example.com')).toBe(true)
  expect(await isSuppressed('reader@example.com', 'space')).toBe(true)
})
