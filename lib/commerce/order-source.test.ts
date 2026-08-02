import { describe, it, expect, vi, beforeEach } from 'vitest'

// Phase 2 (ADR-811 §A): classifyOrderSource decides self (0% fee) vs network (tier take-rate). We mock the
// cookie jar (next/headers) to drive the live attribution signals. The contract that matters most: DEFAULT
// self on any ambiguity, and the self-scan guard (a referral cookie equal to the buyer/seller is not network).

const cookieStore = new Map<string, string>()
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (k: string) => {
      const v = cookieStore.get(k)
      return v ? { value: v } : undefined
    },
  }),
}))

// ── The RELATIONSHIP check (ADR-913) is mocked so the COOKIE contract stays testable ──────────
//
// classifyOrderSource now asks `buyerIsSellersAudience` before it looks at any cookie, and that does
// six live table reads. Unmocked in a test process there is no database, so it fail-safes to
// own-audience and EVERY case below would return `self` — which is correct behaviour and useless as a
// test of the cookie precedence. The default here is "not their audience" (a stranger), so the cookie
// cases exercise the branch they are about. The relationship precedence gets its own cases at the end,
// and the fail-safe direction is pinned in lib/commerce/seller-audience.test.ts.
type Verdict = { isOwnAudience: boolean; signal: string | null; degraded: boolean }
const audience = vi.fn<() => Promise<Verdict>>(async () => ({
  isOwnAudience: false,
  signal: null,
  degraded: false,
}))
vi.mock('@/lib/commerce/seller-audience', () => ({
  buyerIsSellersAudience: (...args: unknown[]) => audience(...(args as [])),
}))

import { classifyOrderSource } from './order-source'

beforeEach(() => {
  cookieStore.clear()
  audience.mockReset()
  audience.mockResolvedValue({ isOwnAudience: false, signal: null, degraded: false })
})

describe('classifyOrderSource', () => {
  it('an explicit network entry point (discovery/marketplace/referral) wins', async () => {
    expect(await classifyOrderSource({ entryPoint: 'marketplace' })).toEqual({ source: 'network', attributionRef: 'ep:marketplace' })
    expect(await classifyOrderSource({ entryPoint: 'discovery' })).toEqual({ source: 'network', attributionRef: 'ep:discovery' })
  })

  it('a self-scan (buyer IS the seller) overrides even an explicit network entry point → self', async () => {
    // The hard promise: an operator buying their own listing off a marketplace/discovery surface is never
    // billed the network rate. The self-scan guard must beat entryPoint.
    expect(await classifyOrderSource({ entryPoint: 'marketplace', buyerProfileId: 'me', sellerProfileId: 'me' })).toEqual({
      source: 'self',
      attributionRef: null,
    })
  })

  it('a referral cookie from a real other person → network', async () => {
    cookieStore.set('fq_ref', 'referrer-1')
    expect(await classifyOrderSource({ buyerProfileId: 'buyer', sellerProfileId: 'seller' })).toEqual({
      source: 'network',
      attributionRef: 'ref:referrer-1',
    })
  })

  it('a referral cookie equal to the buyer or the seller → self (self-scan guard)', async () => {
    cookieStore.set('fq_ref', 'buyer')
    expect(await classifyOrderSource({ buyerProfileId: 'buyer' })).toEqual({ source: 'self', attributionRef: null })
    cookieStore.set('fq_ref', 'seller')
    expect(await classifyOrderSource({ sellerProfileId: 'seller' })).toEqual({ source: 'self', attributionRef: null })
  })

  it('fq_src=referral → network; other channels (qr_scan/direct/event_guest) → self (conservative)', async () => {
    cookieStore.set('fq_src', 'referral')
    expect((await classifyOrderSource()).source).toBe('network')
    for (const ch of ['qr_scan', 'direct', 'event_guest', 'organic']) {
      cookieStore.clear()
      cookieStore.set('fq_src', ch)
      expect((await classifyOrderSource()).source, ch).toBe('self')
    }
  })

  it('no cookies → self (default-safe)', async () => {
    expect(await classifyOrderSource()).toEqual({ source: 'self', attributionRef: null })
    expect(await classifyOrderSource({ buyerProfileId: 'b', sellerProfileId: 's' })).toEqual({ source: 'self', attributionRef: null })
  })
})

describe('the relationship check outranks the cookies (ADR-913)', () => {
  it('an existing relationship is self, even with a referral cookie from someone else', async () => {
    // 🔴 THE DELIBERATE TRADE-OFF. A third party referring someone who ALREADY follows the seller
    // earns no network credit, because the promise is absolute: "once you have your contact,
    // Frequency doesn't take a cut." Letting the referral win would bill a host for a person they
    // already had, which is the one thing the model forbids.
    audience.mockResolvedValue({ isOwnAudience: true, signal: 'follows', degraded: false })
    cookieStore.set('fq_ref', 'referrer-1')
    expect(await classifyOrderSource({ buyerProfileId: 'buyer', sellerProfileId: 'seller' })).toEqual({
      source: 'self',
      attributionRef: 'own:follows',
    })
  })

  it('an existing relationship beats an explicit discovery entry point', async () => {
    audience.mockResolvedValue({ isOwnAudience: true, signal: 'prior_purchase', degraded: false })
    expect(
      await classifyOrderSource({ entryPoint: 'discovery', buyerProfileId: 'buyer', sellerProfileId: 'seller' }),
    ).toEqual({ source: 'self', attributionRef: 'own:prior_purchase' })
  })

  it('records a degraded read as self, so a database hiccup never charges a fee', async () => {
    // Under-collecting on an error is recoverable; charging a fee we promised not to is not.
    audience.mockResolvedValue({ isOwnAudience: true, signal: null, degraded: true })
    cookieStore.set('fq_ref', 'referrer-1')
    expect(await classifyOrderSource({ buyerProfileId: 'buyer', sellerProfileId: 'seller' })).toEqual({
      source: 'self',
      attributionRef: 'own:degraded',
    })
  })

  it('a STRANGER still classifies from the cookies', async () => {
    // The check must not swallow the network case: with no relationship, a referral is network.
    cookieStore.set('fq_ref', 'referrer-1')
    expect(await classifyOrderSource({ buyerProfileId: 'buyer', sellerProfileId: 'seller' })).toEqual({
      source: 'network',
      attributionRef: 'ref:referrer-1',
    })
  })

  it('is skipped entirely when there is no seller to compare against', async () => {
    await classifyOrderSource({ buyerProfileId: 'buyer' })
    expect(audience).not.toHaveBeenCalled()
  })
})
