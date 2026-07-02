import { describe, it, expect } from 'vitest'
import { giftGems } from './gifts'
import { isError } from '@/lib/action-result'

// The three input guards run BEFORE any admin-client / DB call (giftGems validates the
// request, then creates the client), so they can be exercised without mocking Supabase.
// This locks the "never lose Gems on a bad request" contract for the money path.
describe('giftGems — input guards', () => {
  it('rejects a missing giver or recipient', async () => {
    const noRecipient = await giftGems('giver-1', '', 10)
    expect(isError(noRecipient)).toBe(true)
    if (isError(noRecipient)) expect(noRecipient.error).toMatch(/member/i)

    const noGiver = await giftGems('', 'recipient-1', 10)
    expect(isError(noGiver)).toBe(true)
  })

  it('refuses gifting to yourself', async () => {
    const res = await giftGems('me-1', 'me-1', 10)
    expect(isError(res)).toBe(true)
    if (isError(res)) expect(res.error).toMatch(/yourself/i)
  })

  it('rejects a non-positive or non-integer amount', async () => {
    for (const bad of [0, -5, 3.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      const res = await giftGems('giver-1', 'recipient-1', bad)
      expect(isError(res)).toBe(true)
      if (isError(res)) expect(res.error).toMatch(/whole number of Gems/i)
    }
  })
})
