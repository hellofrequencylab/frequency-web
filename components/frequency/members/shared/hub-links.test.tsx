import { describe, expect, it, vi } from 'vitest'
import { HubLinks } from './hub-links'
import type { FqMenuViewer } from '@/components/frequency/members/shell/nav'

vi.mock('@/lib/auth', () => ({ getCachedViewerProfile: async () => ({ id: 'operator', community_role: 'host' }) }))
vi.mock('@/lib/view-as', () => ({ applyViewAs: async () => 'member', viewingAsVisitor: async () => false }))
vi.mock('@/lib/staff', () => ({ getStaffMember: async () => ({ role: 'admin' }) }))
vi.mock('@/lib/core/viewer-hats', () => ({ getViewerHats: async () => ({ tier: 'free', personas: [] }) }))
vi.mock('@/lib/spaces/operated', () => ({ hasOperatedSpaces: async () => true }))
vi.mock('@/lib/marketplace/visibility', async (original) => {
  const actual = await original<typeof import('@/lib/marketplace/visibility')>()
  return {
    ...actual,
    browsableAreas: async () => actual.MARKET_AREAS,
    marketplaceVisibility: async () => ({ market: true, housing: true, makers: true, shop: false }),
  }
})

describe('hub links in a downgraded operator preview', () => {
  it('hides unpublished commerce even though the real operator can browse it', async () => {
    const links = vi.fn((_viewer: FqMenuViewer) => [])
    await HubLinks({ title: 'Marketplace', links })
    expect(links.mock.calls[0]?.[0]).toMatchObject({ navAccess: { shop: 'none' }, operatesSpaces: false })
  })
})
