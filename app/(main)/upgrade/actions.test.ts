import { describe, it, expect, beforeEach, vi } from 'vitest'

// The /upgrade server actions. The SUPPORTER CONTRIBUTION half of this file is gone with the
// action it covered (LIVE-361): Supporter is a PWYW badge on Crew, not a second purchase, and the
// contribution had no caller anywhere in the product. What remains is toggleMembership, whose
// no-charge invariant is unrelated and still load-bearing. MONEY CODE — the test that matters
// most is the DORMANT-WHEN-OFF invariant: while billingLive() is false the action turns the badge
// on and NEVER touches Stripe (no session, no charge, no card). Since ADR-1030 removed the orphan
// `toggleSupporterBadge`, this dormant branch is the only code that writes profiles.is_supporter.
// When billingLive() is true it creates a mode:'payment' PWYW session tagged with the contribution
// kind + profile metadata, records the pending ledger row, and returns the URL.

const {
  sessionsCreate,
  sessionsExpire,
  billingLiveMock,
  loadCatalogConfig,
  getUser,
  profilesMaybeSingle,
  profilesUpdate,
} = vi.hoisted(() => ({
  sessionsCreate: vi.fn(),
  sessionsExpire: vi.fn(),
  billingLiveMock: vi.fn(),
  loadCatalogConfig: vi.fn(),
  getUser: vi.fn(),
  profilesMaybeSingle: vi.fn(),
  profilesUpdate: vi.fn(),
}))

vi.mock('@/lib/billing/stripe', () => ({
  stripe: { checkout: { sessions: { create: sessionsCreate, expire: sessionsExpire } } },
  appUrl: () => 'https://frequencylocal.com',
}))
vi.mock('@/lib/pricing/settings', () => ({ billingLive: billingLiveMock }))
vi.mock('@/lib/pricing/catalog-config', () => ({ loadCatalogConfig }))
vi.mock('@/lib/billing/checkout', () => ({ createMembershipCheckout: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser } }),
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: profilesMaybeSingle }) }),
      update: (patch: unknown) => {
        profilesUpdate(patch)
        return { eq: async () => ({ error: null }) }
      },
    }),
  }),
}))

import { toggleMembership } from './actions'

beforeEach(() => {
  vi.clearAllMocks()
  getUser.mockResolvedValue({ data: { user: { id: 'auth-1' } } })
  profilesMaybeSingle.mockResolvedValue({ data: { id: 'profile-1' } })
  loadCatalogConfig.mockResolvedValue({ pwyw: { minCents: 500, suggestedCents: 1200 } })
  sessionsCreate.mockResolvedValue({ id: 'cs_test_1', url: 'https://checkout.stripe.com/c/pay/cs_test_1' })
})

// LIVE-090. `toggleMembership` writes the ENTITLEMENT that both payout paths read to pick the
// take-rate rung, so "may I change my own tier" is a policy question, not an identity one. The
// action was self-scoped and signed-in-gated from the start and still let any member flip
// themselves to crew while billing was live — the render was the only thing hiding it, and a
// server action is a POST endpoint rather than a button. These two tests pin both halves.
describe('toggleMembership - closed once billing is live (LIVE-090)', () => {
  it('refuses and writes NOTHING when billingLive() is true', async () => {
    billingLiveMock.mockResolvedValue(true)
    const res = await toggleMembership()
    expect(res).toEqual({ error: 'Manage your membership in billing.' })
    // THE GUARANTEE: no tier write at all. Not a different tier — none.
    expect(profilesUpdate).not.toHaveBeenCalled()
  })

  it('still works as the beta toggle while billing is OFF', async () => {
    billingLiveMock.mockResolvedValue(false)
    profilesMaybeSingle.mockResolvedValue({ data: { id: 'profile-1', membership_tier: 'free' } })
    const res = await toggleMembership()
    expect(res).toEqual({ data: { tier: 'crew' } })
    expect(profilesUpdate).toHaveBeenCalledWith({ membership_tier: 'crew' })
  })

  it('requires a signed-in profile', async () => {
    billingLiveMock.mockResolvedValue(false)
    getUser.mockResolvedValue({ data: { user: null } })
    const res = await toggleMembership()
    expect(res).toEqual({ error: 'Not signed in' })
    expect(profilesUpdate).not.toHaveBeenCalled()
  })
})
