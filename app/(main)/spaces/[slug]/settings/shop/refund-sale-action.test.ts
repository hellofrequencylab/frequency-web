import { beforeEach, describe, expect, it, vi } from 'vitest'

// LIVE-2550: refunding a sale from the Orders tab is the owner's or a Space admin's call. An editor
// can run the Shop and still cannot send money back.
const H = vi.hoisted(() => ({
  role: 'admin' as string,
  refund: vi.fn(async (_spaceId: string, _kind: string, _id: string) => ({ ok: true }) as { ok: true } | { error: string }),
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/auth', () => ({ getCallerProfile: async () => ({ id: 'p1', webRole: 'member' }) }))
vi.mock('@/lib/spaces/store', () => ({
  getVisibleSpaceBySlug: async () => ({ id: 'space-1', slug: 'hearts', type: 'business', preferences: {} }),
  patchSpacePreferences: async () => true,
}))
vi.mock('@/lib/spaces/entitlements', () => ({
  resolveSpaceManageAccess: async () => ({ canManage: true }),
  getSpaceCapabilities: async () => ({ role: H.role }),
}))
vi.mock('@/lib/spaces/functions', () => ({ spaceFunctionAccess: () => true }))
vi.mock('@/lib/spaces/types', () => ({ isConsoleSpaceType: () => true }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))
vi.mock('@/lib/commerce/space-refunds', () => ({ refundSpaceSale: H.refund }))

import { refundSpaceSaleAction } from './shop-actions'

describe('refundSpaceSaleAction (LIVE-2550)', () => {
  beforeEach(() => {
    H.role = 'admin'
    H.refund.mockClear()
  })

  it('refunds for the owner or an admin, scoped to the Space the slug resolves to', async () => {
    expect(await refundSpaceSaleAction('hearts', 'ticket', 't1')).toEqual({ ok: true })
    expect(H.refund).toHaveBeenCalledWith('space-1', 'ticket', 't1')
  })

  it('refuses an editor before any money path runs', async () => {
    H.role = 'editor'
    expect(await refundSpaceSaleAction('hearts', 'order', 'o1')).toHaveProperty('error')
    expect(H.refund).not.toHaveBeenCalled()
  })

  it('refuses a kind it does not know', async () => {
    expect(await refundSpaceSaleAction('hearts', 'tip' as never, 'x')).toHaveProperty('error')
    expect(H.refund).not.toHaveBeenCalled()
  })
})
