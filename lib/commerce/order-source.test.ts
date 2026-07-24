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

import { classifyOrderSource } from './order-source'

beforeEach(() => cookieStore.clear())

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
