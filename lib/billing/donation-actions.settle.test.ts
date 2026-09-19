import { describe, it, expect, vi, beforeEach } from 'vitest'

// `settleDonationAction` — THE WEBHOOK-INDEPENDENT SETTLE (LIVE-367).
// Same gap LIVE-366 closed for tickets, applied to Space gifts. A gift does not require an
// account, so this action has no session gate; Stripe is the authority.

vi.mock('next/headers', () => ({ headers: async () => new Map([['x-forwarded-for', '1.2.3.4']]) }))
const rateLimitOk = vi.fn(async () => true)
vi.mock('@/lib/rate-limit', () => ({ rateLimitOk: (...a: unknown[]) => rateLimitOk(...(a as [])) }))
vi.mock('@/lib/auth', () => ({ getMyProfileId: async () => null }))
vi.mock('./stripe-browser', () => ({ onPageCheckoutAvailable: () => false }))

const recordSpaceDonationFromSessionId = vi.fn(async (_id: string): Promise<number | null> => 2500)
vi.mock('./space-donation-checkout', () => ({
  createSpaceDonationCheckout: vi.fn(),
  recordSpaceDonationFromSessionId: (id: string) => recordSpaceDonationFromSessionId(id),
}))

import { settleDonationAction } from './donation-actions'

beforeEach(() => {
  recordSpaceDonationFromSessionId.mockReset()
  recordSpaceDonationFromSessionId.mockResolvedValue(2500)
  rateLimitOk.mockReset()
  rateLimitOk.mockResolvedValue(true)
})

describe('settleDonationAction', () => {
  it('runs the SAME reconcile the redirect path uses, so the two cannot drift', async () => {
    const r = await settleDonationAction('cs_live_abc')
    expect(recordSpaceDonationFromSessionId).toHaveBeenCalledWith('cs_live_abc')
    expect(r).toEqual({ data: { settled: true } })
  })

  it('reports not-settled when Stripe says the session is not a paid gift', async () => {
    recordSpaceDonationFromSessionId.mockResolvedValue(null)
    const r = await settleDonationAction('cs_live_abc')
    expect(r).toEqual({ data: { settled: false } })
  })

  it('refuses anything that is not a checkout session id', async () => {
    for (const bad of ['', 'pi_123', 'evt_123', '../../etc', 'cs']) {
      const r = await settleDonationAction(bad)
      expect('error' in r, `should refuse ${JSON.stringify(bad)}`).toBe(true)
    }
    expect(recordSpaceDonationFromSessionId).not.toHaveBeenCalled()
  })

  it('is limited per IP, and never touches Stripe once the limiter refuses', async () => {
    rateLimitOk.mockResolvedValue(false)
    const r = await settleDonationAction('cs_live_abc')
    expect('error' in r).toBe(true)
    expect(recordSpaceDonationFromSessionId).not.toHaveBeenCalled()
  })

  it('never turns a reconcile failure into an error the donor sees', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    recordSpaceDonationFromSessionId.mockRejectedValue(new Error('stripe down'))
    const r = await settleDonationAction('cs_live_abc')
    expect('error' in r, 'a paid donor must never be told their payment failed').toBe(false)
    expect(r).toEqual({ data: { settled: false } })
    expect(err, 'and the failure is loud, never swallowed').toHaveBeenCalled()
    err.mockRestore()
  })
})
