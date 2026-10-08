import { beforeEach, expect, it, vi } from 'vitest'
const state = vi.hoisted(() => ({ protected: true, expired: false, safeProtection: false, safeExpiry: false }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: () => {
  const query = {
    select: () => query, eq: () => query, neq: () => query, order: () => query, limit: () => query,
    or: (filter: string) => { if (filter.includes('is_protected')) state.safeProtection = true; if (filter.includes('expires_at')) state.safeExpiry = true; return query },
    maybeSingle: async () => ({ error: null, data: (state.safeProtection && state.protected) || (state.safeExpiry && state.expired) ? null : { id: 'same-site', url: 'https://images.example/duplicate.jpg', title: 'Duplicate' } }),
  }
  return query
} }) }))
vi.mock('./quota', () => ({ loomAdmits: vi.fn() }))
import { findLibraryAssetBySha256 } from './store'
beforeEach(() => { state.protected = true; state.expired = false; state.safeProtection = false; state.safeExpiry = false })
it('keeps protected and expired dedupe URLs out of website upload responses while preserving legacy behavior', async () => {
  expect(await findLibraryAssetBySha256('site', 'hash', true)).toBeNull()
  state.protected = false; state.expired = true
  expect(await findLibraryAssetBySha256('site', 'hash', true)).toBeNull()
  state.safeProtection = false; state.safeExpiry = false
  expect(await findLibraryAssetBySha256('site', 'hash')).toHaveProperty('id', 'same-site')
  state.expired = false
  expect(await findLibraryAssetBySha256('site', 'hash', true)).toHaveProperty('id', 'same-site')
})
