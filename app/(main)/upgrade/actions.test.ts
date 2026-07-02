import { describe, it, expect, beforeEach, vi } from 'vitest'

// SUPPORTER CONTRIBUTION action (startSupporterContribution). MONEY CODE — the test that matters
// most is the DORMANT-WHEN-OFF invariant: while billingLive() is false the action turns the badge
// on and NEVER touches Stripe (no session, no charge, no card), exactly like toggleSupporterBadge.
// When billingLive() is true it creates a mode:'payment' PWYW session tagged with the contribution
// kind + profile metadata, records the pending ledger row, and returns the URL. Mirrors
// app/(marketing)/founders/checkout/actions.test.ts.

const {
  sessionsCreate,
  sessionsExpire,
  billingLiveMock,
  loadCatalogConfig,
  insertPendingContribution,
  getUser,
  profilesMaybeSingle,
  profilesUpdate,
} = vi.hoisted(() => ({
  sessionsCreate: vi.fn(),
  sessionsExpire: vi.fn(),
  billingLiveMock: vi.fn(),
  loadCatalogConfig: vi.fn(),
  insertPendingContribution: vi.fn(),
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
vi.mock('@/lib/billing/supporter', async (importOriginal) => {
  // Keep the real PURE helpers (validation + the kind tag) but mock the DB writes.
  const actual = await importOriginal<typeof import('@/lib/billing/supporter')>()
  return { ...actual, insertPendingContribution, recordSupporterContributionFromSession: vi.fn() }
})
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

import { startSupporterContribution } from './actions'

beforeEach(() => {
  vi.clearAllMocks()
  getUser.mockResolvedValue({ data: { user: { id: 'auth-1' } } })
  profilesMaybeSingle.mockResolvedValue({ data: { id: 'profile-1' } })
  loadCatalogConfig.mockResolvedValue({ pwyw: { minCents: 500, suggestedCents: 1200 } })
  insertPendingContribution.mockResolvedValue(null)
  sessionsCreate.mockResolvedValue({ id: 'cs_test_1', url: 'https://checkout.stripe.com/c/pay/cs_test_1' })
})

describe('startSupporterContribution - dormant when billing is OFF (no-charge invariant)', () => {
  beforeEach(() => billingLiveMock.mockResolvedValue(false))

  it('turns the badge on and NEVER touches Stripe', async () => {
    const res = await startSupporterContribution(1200)
    expect(res).toEqual({ ok: true, dormant: true, isSupporter: true })
    expect(profilesUpdate).toHaveBeenCalledWith({ is_supporter: true })
    // THE GUARANTEE: no Stripe session, no pending charge row.
    expect(sessionsCreate).not.toHaveBeenCalled()
    expect(insertPendingContribution).not.toHaveBeenCalled()
  })

  it('requires a signed-in profile (no write when anonymous)', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    const res = await startSupporterContribution(1200)
    expect(res).toEqual({ ok: false, error: 'Not signed in' })
    expect(profilesUpdate).not.toHaveBeenCalled()
    expect(sessionsCreate).not.toHaveBeenCalled()
  })
})

describe('startSupporterContribution - live (billingLive true)', () => {
  beforeEach(() => billingLiveMock.mockResolvedValue(true))

  it('creates a mode:payment PWYW session with the contribution kind + profile metadata, records the pending row, returns the URL', async () => {
    const res = await startSupporterContribution(1200)
    expect(res).toEqual({ ok: true, url: 'https://checkout.stripe.com/c/pay/cs_test_1' })

    expect(sessionsCreate).toHaveBeenCalledTimes(1)
    const params = sessionsCreate.mock.calls[0][0]
    expect(params.mode).toBe('payment')
    expect(params.metadata).toMatchObject({ kind: 'supporter_contribution', profile_id: 'profile-1' })
    expect(params.client_reference_id).toBe('profile-1')
    // Inline PWYW price at the chosen amount, NO recurring block.
    const line = params.line_items[0]
    expect(line.price_data.unit_amount).toBe(1200)
    expect(line.price_data.recurring).toBeUndefined()
    // The pending ledger row is recorded before the URL is returned.
    expect(insertPendingContribution).toHaveBeenCalledWith({
      profileId: 'profile-1',
      amountCents: 1200,
      checkoutSessionId: 'cs_test_1',
    })
    // The badge is NOT flipped here — it turns on only on a successful payment.
    expect(profilesUpdate).not.toHaveBeenCalled()
  })

  it('refuses an amount below the operator PWYW floor without creating a session', async () => {
    const res = await startSupporterContribution(100) // floor is 500
    expect(res.ok).toBe(false)
    expect(sessionsCreate).not.toHaveBeenCalled()
    expect(insertPendingContribution).not.toHaveBeenCalled()
  })

  it('refuses the URL + expires the session when the pending row fails to insert', async () => {
    insertPendingContribution.mockResolvedValue('db down')
    const res = await startSupporterContribution(1200)
    expect(res.ok).toBe(false)
    expect(sessionsExpire).toHaveBeenCalledWith('cs_test_1')
  })
})
