import { describe, it, expect, beforeEach, vi } from 'vitest'

// SCAN-752 (2026-10-05). rejectVerification deletes a held completion. The held marker is
// verified_at (null = held); verified_by is only stamped by the leader method, so keying the delete
// on it would let an auto-verified, already credited completion be deleted while its Zap ledger
// row stays. Locked here: the delete is guarded by verified_at null.

const mocks = vi.hoisted(() => ({
  filters: [] as unknown[][],
  caller: { id: 'staff-1', community_role: 'admin', webRole: 'admin' } as Record<string, unknown> | null,
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/auth', () => ({ getCallerProfile: async () => mocks.caller }))
vi.mock('@/lib/admin/guard', () => ({
  authorizeAction: async (caller: Record<string, unknown> | null) => {
    if (!caller || caller.webRole === 'member') throw new Error('Unauthorized')
    return caller
  },
}))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({}) }))
// SCAN-753: the action now reads the completion and its member's circles before the delete; a
// staff caller (webRole admin) passes requireScopedManage with no circle capability needed.
vi.mock('@/lib/core/load-capabilities', () => ({
  getCircleCapabilities: async () => new Set(),
  getHubCapabilities: async () => new Set(),
  getNexusCapabilities: async () => new Set(),
  getEventCapabilities: async () => new Set(),
  getGlobalCapabilities: async () => new Set(),
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => ({
      select: () => {
        const chain: Record<string, unknown> = {}
        chain.eq = () => chain
        chain.maybeSingle = async () => ({
          data: table === 'crew_completions' ? { id: 'c1', profile_id: 'member-9', task_id: 't1', task: { circle_id: null } } : null,
          error: null,
        })
        chain.limit = async () => ({ data: [], error: null })
        return chain
      },
      delete: () => {
        const chain = {
          eq: (...a: unknown[]) => { mocks.filters.push(['eq', ...a]); return chain },
          is: async (...a: unknown[]) => { mocks.filters.push(['is', ...a]); return { error: null } },
        }
        return chain
      },
    }),
  }),
}))

import { rejectVerification } from './actions'

beforeEach(() => {
  mocks.filters.length = 0
  mocks.caller = { id: 'staff-1', community_role: 'admin', webRole: 'admin' }
})

describe('rejectVerification', () => {
  it('deletes only a still-held completion (verified_at null), never keyed on verified_by', async () => {
    await rejectVerification('c1')
    expect(mocks.filters).toContainEqual(['eq', 'id', 'c1'])
    expect(mocks.filters).toContainEqual(['is', 'verified_at', null])
    expect(mocks.filters.some((f) => f[1] === 'verified_by')).toBe(false)
  })

  it('refuses a plain member before touching the row', async () => {
    mocks.caller = { id: 'u1', community_role: 'member', webRole: 'member' }
    await expect(rejectVerification('c1')).rejects.toThrow('Unauthorized')
    expect(mocks.filters).toHaveLength(0)
  })
})
