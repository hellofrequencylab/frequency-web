import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import { viaStripe } from './via-stripe'

// LIVE-094. ADR-1093 fixed the MEMBER billing surface and defined viaStripe privately inside it,
// so the sibling SPACE surface — three Stripe reaches, edited in the same range — kept throwing
// for another four days. One page fixed, one page not, and nothing made the omission visible.
//
// The behaviour tests below pin the wrapper. The source-shape test is the part that matters for
// the regression: it holds BOTH billing surfaces to the rule at once, so adding a fourth Stripe
// reach to either file without a wrapper fails here rather than in production.

const SURFACES = [
  'app/(main)/settings/billing/actions.ts',
  'app/(main)/spaces/[slug]/settings/billing/actions.ts',
]

// The calls that reach Stripe from these two files. Each throws a StripeInvalidRequestError on a
// half-finished dashboard, which is an ordinary outcome rather than an exceptional one.
const STRIPE_REACHING = [
  'createBillingPortal',
  'createBundleCheckout',
  'createOnboardingLink',
  'createDashboardLink',
  'createSpaceBillingPortal',
  'createSpaceLoadoutCheckout',
  'updateOperatorSeats',
]

describe('viaStripe - the wrapper itself', () => {
  it('returns the value when the call succeeds', async () => {
    await expect(viaStripe('t', async () => 'https://stripe/x')).resolves.toEqual({
      value: 'https://stripe/x',
    })
  })

  it('converts a throw into a readable error instead of letting it reach the error boundary', async () => {
    const res = await viaStripe('t', async () => {
      throw Object.assign(new Error('You must complete your platform profile'), { requestId: 'req_1' })
    })
    expect('error' in res).toBe(true)
    expect((res as { error: string }).error).toContain('Stripe could not complete that')
    // The member never sees Stripe's own wording; an operator gets it in the server log.
    expect((res as { error: string }).error).not.toContain('platform profile')
  })

  it('survives a non-Error throw', async () => {
    const res = await viaStripe('t', async () => {
      throw 'string throw'
    })
    expect('error' in res).toBe(true)
  })
})

describe('both billing surfaces route every Stripe reach through viaStripe (LIVE-094)', () => {
  for (const file of SURFACES) {
    it(`${file} leaves no Stripe call unwrapped`, () => {
      const src = fs.readFileSync(file, 'utf8')
      for (const fn of STRIPE_REACHING) {
        // Only assert about calls this file actually makes.
        if (!src.includes(`${fn}(`)) continue
        // A bare `await <stripeCall>(` is the shape that trips the error boundary. Inside a
        // viaStripe thunk the call is reached as `() => fn(` or `() =>\n  fn(`, never as `await fn(`.
        const bare = new RegExp(String.raw`await\s+${fn}\s*\(`)
        expect(bare.test(src), `${fn} is awaited directly in ${file}; wrap it in viaStripe`).toBe(false)
      }
      expect(src).toContain("from '@/lib/billing/via-stripe'")
    })
  }
})
