import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

// LIVE-697 — submitProductReviewAction used hasPurchasedProduct only as a label.
//
// THE DEFECT. verifiedPurchase was computed, then handed to upsertProductReview as
// verified_purchase. Nothing refused on !verifiedPurchase, so any signed-in member who was
// not the seller could review a listing they never bought. Payments have been on since
// OWN-046; the TODO(payments-on) in this file was the leftover.
//
// SOURCE-SHAPE: the failure is a missing branch between the purchase read and the write.
// A runtime happy-path of a buyer still saving would not notice the hole.

const ROOT = path.join(import.meta.dirname, '../../..')
const src = readFileSync(path.join(ROOT, 'app/(main)/marketplace/review-actions.ts'), 'utf8')

describe('submitProductReviewAction gates creation on a settled order (LIVE-697)', () => {
  it('is non-trivial (guards a vacuous pass)', () => {
    expect(src.length).toBeGreaterThan(500)
    expect(src).toContain('export async function submitProductReviewAction')
  })

  it('refuses before upsert when the member has no settled order', () => {
    const a = src.indexOf('await hasPurchasedProduct(')
    const b = src.indexOf('upsertProductReview(', a)
    expect(a).toBeGreaterThan(0)
    expect(b).toBeGreaterThan(a)
    expect(
      /!\s*verifiedPurchase/.test(src.slice(a, b)),
      'the purchase check only labels the review again. Any signed-in member can review a product they never bought (LIVE-697).',
    ).toBe(true)
  })

  it('says so in the house voice, parallel to the sign-in refusal', () => {
    expect(src).toContain("fail('Buy this to leave a review.')")
    expect(src).toContain("fail('Sign in to leave a review.')")
  })

  it('still derives verified_purchase rather than taking it from the client', () => {
    expect(src).toContain('verifiedPurchase,')
    expect(src).not.toMatch(/verifiedPurchase:\s*input/)
  })
})
