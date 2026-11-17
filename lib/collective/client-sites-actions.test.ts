import { beforeEach, describe, expect, it, vi } from 'vitest'

// LIVE-2332: a badge change or a removal changes the CLIENT Space, so its live website is refreshed
// (refreshSite with the client's slug), and a refresh that throws never fails the change.

const state = vi.hoisted(() => ({
  rows: {} as Record<string, Record<string, unknown>>,
  badge: vi.fn(),
  billing: vi.fn(),
  refresh: vi.fn(),
  revalidate: vi.fn(),
}))

function fakeDb() {
  return {
    from: () => {
      let id: string | null = null
      let update: Record<string, unknown> | null = null
      const chain = {
        select: () => chain,
        update: (patch: Record<string, unknown>) => { update = patch; return chain },
        eq: (col: string, value: string) => {
          if (col === 'id') id = value
          if (update) {
            if (id && state.rows[id]) Object.assign(state.rows[id], update)
            return Promise.resolve({ error: null })
          }
          return chain
        },
        maybeSingle: async () => ({ data: id ? state.rows[id] ?? null : null, error: null }),
      }
      return chain
    },
  }
}

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => fakeDb() }))
vi.mock('@/lib/auth', () => ({ getMyProfileId: async () => 'owner' }))
vi.mock('@/lib/spaces/store', () => ({ loadRootSpaceId: async () => null }))
vi.mock('@/lib/spaces/membership', () => ({ addSpaceMember: vi.fn() }))
vi.mock('@/lib/spaces/provision-core', () => ({
  spaceBirthConfig: async () => ({ entitlements: {}, featureRoles: {}, modeVariant: null, preferences: {} }),
  finishSpaceBirth: vi.fn(),
}))
vi.mock('@/lib/spaces/claim', () => ({ mintSpaceClaimToken: vi.fn() }))
vi.mock('./client-site-billing', () => ({
  canManageClientSites: async () => true,
  syncClientSiteBilling: state.billing,
  setClientSiteBadgeRemoval: state.badge,
}))
vi.mock('@/lib/sites/site-cache', () => ({ refreshSite: state.refresh }))
vi.mock('next/cache', () => ({ revalidatePath: state.revalidate }))

import { removeClientSite, toggleClientSiteBadge } from './client-sites-actions'

beforeEach(() => {
  vi.clearAllMocks()
  state.rows = {
    net: { id: 'net', slug: 'the-network' },
    site: { id: 'site', slug: 'client-shop', type: 'business', plan: 'business', entitlements: {} },
  }
  state.badge.mockResolvedValue({ data: undefined })
  state.billing.mockResolvedValue({ data: undefined })
})

describe('client site changes refresh the client website', () => {
  it('a badge change refreshes the client site, not the Network', async () => {
    expect(await toggleClientSiteBadge('net', 'site', true)).toEqual({ data: undefined })
    expect(state.refresh).toHaveBeenCalledWith('client-shop')
    expect(state.refresh).not.toHaveBeenCalledWith('the-network')
    expect(state.revalidate).toHaveBeenCalledWith('/spaces/the-network/settings/websites')
  })

  it('a refused badge change refreshes nothing', async () => {
    state.badge.mockResolvedValue({ error: 'nope' })
    expect(await toggleClientSiteBadge('net', 'site', true)).toEqual({ error: 'nope' })
    expect(state.refresh).not.toHaveBeenCalled()
  })

  it('a removal refreshes the client site once the bill has changed', async () => {
    expect(await removeClientSite('net', 'site')).toEqual({ data: undefined })
    expect(state.refresh).toHaveBeenCalledWith('client-shop')
  })

  it('a removal the bill refuses is rolled back and refreshes nothing', async () => {
    state.billing.mockResolvedValue({ error: 'bill' })
    expect(await removeClientSite('net', 'site')).toEqual({ error: 'bill' })
    expect(state.refresh).not.toHaveBeenCalled()
  })

  it('a refresh that throws never fails the change', async () => {
    state.refresh.mockImplementation(() => { throw new Error('outside a request') })
    expect(await toggleClientSiteBadge('net', 'site', false)).toEqual({ data: undefined })
    expect(await removeClientSite('net', 'site')).toEqual({ data: undefined })
  })
})
