import { describe, it, expect, vi, beforeEach } from 'vitest'

// THE GUEST COMMERCE DOOR — `startGuestCheckoutAction`, the signed-out door beside
// `startCheckoutAction` (LIVE-396).
//
// It is a SEPARATE export on purpose: widening `startCheckoutAction` would have made its
// `getMyProfileId()` guard conditional, and that guard is what keeps a member's purchase attached
// to their account. These tests pin the door checks IN ORDER, because the order is the security:
//
//   * the honeypot returns a success that CLAIMS NOTHING and calls nothing;
//   * the per-IP limiter refuses, and it runs BEFORE the signed-in branch so a caller cannot buy
//     their way past it by holding a session;
//   * a signed-in caller is routed to the MEMBER path rather than given a guest row;
//   * the address is trimmed + lowercased once, and checkout re-validates;
//   * no entry-point stamp is read, so a guest sale cannot be classified network-sourced off
//     provenance nobody recorded.
//
// The same idioms are pinned for tickets in app/(main)/events/[slug]/ticket-actions.guest.test.ts;
// this door copies them deliberately, because a second guest door that guards differently is a
// second door to get wrong. `createCommerceCheckout` is stubbed — what it does with a guest email
// is proven against the real gates in lib/commerce/checkout.test.ts.

vi.mock('next/headers', () => ({
  headers: async () => new Map([['x-forwarded-for', '1.2.3.4']]),
  cookies: async () => ({ get: () => undefined }),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))

const rateLimitOk = vi.fn(async () => true)
vi.mock('@/lib/rate-limit', () => ({ rateLimitOk: (...a: unknown[]) => rateLimitOk(...(a as [])) }))

const getMyProfileId = vi.fn(async (): Promise<string | null> => null)
vi.mock('@/lib/auth', () => ({
  getMyProfileId: () => getMyProfileId(),
  getCallerProfile: async () => null,
}))

const createCommerceCheckout = vi.fn(async (_opts: Record<string, unknown>) => ({
  url: 'https://stripe.test/cs_1',
}) as { url?: string; clientSecret?: string; sessionId?: string; error?: string })
vi.mock('@/lib/commerce/checkout', () => ({
  createCommerceCheckout: (o: Record<string, unknown>) => createCommerceCheckout(o),
  recordCommerceOrderFromSessionId: vi.fn(async () => true),
}))

vi.mock('@/lib/billing/stripe-browser', () => ({ onPageCheckoutAvailable: () => false }))
vi.mock('@/lib/commerce/products', () => ({
  createProduct: vi.fn(),
  setProductStatus: vi.fn(),
  deleteProduct: vi.fn(),
  productOwnerProfileId: vi.fn(),
  journeySlugForProduct: vi.fn(async () => null),
}))
vi.mock('@/lib/commerce/selling', () => ({ canListNew: vi.fn(async () => true) }))
vi.mock('@/lib/commerce/categories', () => ({ normalizeCategory: (v: string) => v, normalizeTags: () => [] }))
vi.mock('@/lib/ai/listing-copy', () => ({ draftListingCopy: vi.fn() }))
vi.mock('@/lib/ai/vera/create-entity', () => ({ proposeAndConfirmCreate: vi.fn() }))
vi.mock('@/lib/commerce/marketplace-entry', () => ({
  MARKETPLACE_ENTRY_COOKIE: 'fq_mk',
  entryPointFromStamp: vi.fn(() => 'marketplace'),
  verifyStamp: vi.fn(() => null),
}))

import { startGuestCheckoutAction } from './commerce-actions'

beforeEach(() => {
  rateLimitOk.mockClear()
  rateLimitOk.mockResolvedValue(true)
  getMyProfileId.mockClear()
  getMyProfileId.mockResolvedValue(null)
  createCommerceCheckout.mockClear()
  createCommerceCheckout.mockResolvedValue({ url: 'https://stripe.test/cs_1' })
})

describe('startGuestCheckoutAction — the door checks, in order', () => {
  it('honeypot: returns a success that claims nothing, and calls nothing', async () => {
    const res = await startGuestCheckoutAction({ productId: 'p1', email: 'sam@example.com', company: 'Acme' })
    expect(res).toEqual({})
    expect(res.url).toBeUndefined()
    expect(rateLimitOk).not.toHaveBeenCalled()
    expect(createCommerceCheckout).not.toHaveBeenCalled()
  })

  it('a whitespace-only honeypot is NOT a bot', async () => {
    const res = await startGuestCheckoutAction({ productId: 'p1', email: 'sam@example.com', company: '   ' })
    expect(res.url).toBe('https://stripe.test/cs_1')
    expect(createCommerceCheckout).toHaveBeenCalled()
  })

  it('refuses over the per-IP limit, and opens no checkout', async () => {
    rateLimitOk.mockResolvedValue(false)
    const res = await startGuestCheckoutAction({ productId: 'p1', email: 'sam@example.com' })
    expect(res.error).toMatch(/too many requests/i)
    expect(createCommerceCheckout).not.toHaveBeenCalled()
  })

  it('🔴 the limiter runs BEFORE the signed-in branch, so a session cannot buy past it', async () => {
    rateLimitOk.mockResolvedValue(false)
    getMyProfileId.mockResolvedValue('member-1')
    const res = await startGuestCheckoutAction({ productId: 'p1', email: 'sam@example.com' })
    expect(res.error).toMatch(/too many requests/i)
    expect(getMyProfileId).not.toHaveBeenCalled()
    expect(createCommerceCheckout).not.toHaveBeenCalled()
  })

  it('a signed-in caller buys as THEMSELVES, never as a guest row', async () => {
    getMyProfileId.mockResolvedValue('member-1')
    await startGuestCheckoutAction({ productId: 'p1', email: 'typed@example.com' })
    expect(createCommerceCheckout).toHaveBeenCalledTimes(1)
    const opts = createCommerceCheckout.mock.calls[0][0]
    expect(opts.buyerProfileId).toBe('member-1')
    expect(opts.guestEmail).toBeUndefined()
  })

  it('refuses a malformed address without opening a checkout', async () => {
    for (const email of ['', '   ', 'nope', 'a@b', 'a b@c.com']) {
      createCommerceCheckout.mockClear()
      const res = await startGuestCheckoutAction({ productId: 'p1', email })
      expect(res.error).toMatch(/valid email/i)
      expect(createCommerceCheckout).not.toHaveBeenCalled()
    }
  })

  it('trims and lowercases the address exactly once', async () => {
    await startGuestCheckoutAction({ productId: 'p1', email: '  SAM@Example.COM  ' })
    expect(createCommerceCheckout.mock.calls[0][0].guestEmail).toBe('sam@example.com')
  })

  it('reads no entry-point stamp, so a guest sale is not classified network-sourced', async () => {
    await startGuestCheckoutAction({ productId: 'p1', email: 'sam@example.com' })
    expect(createCommerceCheckout.mock.calls[0][0].entryPoint).toBeUndefined()
  })

  it('passes the checkout error straight back rather than inventing one', async () => {
    createCommerceCheckout.mockResolvedValue({ error: 'Sign in to buy this.' })
    const res = await startGuestCheckoutAction({ productId: 'p1', email: 'sam@example.com' })
    expect(res).toEqual({ error: 'Sign in to buy this.' })
  })

  it('forceHosted demands a redirectable session after an on-page form failed', async () => {
    await startGuestCheckoutAction({ productId: 'p1', email: 'sam@example.com', forceHosted: true })
    expect(createCommerceCheckout.mock.calls[0][0].ui).toBe('hosted')
  })

  it('returns the client secret with its session id when the on-page form is used', async () => {
    createCommerceCheckout.mockResolvedValue({ clientSecret: 'cs_secret', sessionId: 'cs_1' })
    const res = await startGuestCheckoutAction({ productId: 'p1', email: 'sam@example.com' })
    expect(res).toEqual({ clientSecret: 'cs_secret', sessionId: 'cs_1' })
  })
})
