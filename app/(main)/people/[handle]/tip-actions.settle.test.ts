import { describe, it, expect, vi, beforeEach } from 'vitest'

// `settleTipAction` — THE WEBHOOK-INDEPENDENT SETTLE (LIVE-367).
//
// 🔴 WHY IT EXISTS. Same gap LIVE-366 closed for tickets: `confirm({ redirect: 'if_required' })`
// never navigates on the common card path, so the session's `return_url` is never visited. Before
// this action, an on-page tip had exactly one way to become real.

vi.mock('next/headers', () => ({ headers: async () => new Map([['x-forwarded-for', '1.2.3.4']]) }))
const rateLimitOk = vi.fn(async () => true)
vi.mock('@/lib/rate-limit', () => ({ rateLimitOk: (...a: unknown[]) => rateLimitOk(...(a as [])) }))
vi.mock('@/lib/auth', () => ({ getMyProfileId: async () => 'from-1' }))
vi.mock('@/lib/billing/stripe-browser', () => ({ onPageCheckoutAvailable: () => false }))

const recordTipFromSessionId = vi.fn(async (_id: string): Promise<number | null> => 500)
vi.mock('@/lib/billing/tips', () => ({
  createTipCheckout: vi.fn(),
  recordTipFromSessionId: (id: string) => recordTipFromSessionId(id),
}))

import { settleTipAction } from './tip-actions'

beforeEach(() => {
  recordTipFromSessionId.mockReset()
  recordTipFromSessionId.mockResolvedValue(500)
  rateLimitOk.mockReset()
  rateLimitOk.mockResolvedValue(true)
})

describe('settleTipAction', () => {
  it('runs the SAME reconcile the redirect path uses, so the two cannot drift', async () => {
    const r = await settleTipAction('cs_live_abc')
    expect(recordTipFromSessionId).toHaveBeenCalledWith('cs_live_abc')
    expect(r).toEqual({ data: { settled: true } })
  })

  it('reports not-settled when Stripe says the session is not a paid tip', async () => {
    recordTipFromSessionId.mockResolvedValue(null)
    const r = await settleTipAction('cs_live_abc')
    expect(r).toEqual({ data: { settled: false } })
  })

  it('refuses anything that is not a checkout session id', async () => {
    for (const bad of ['', 'pi_123', 'evt_123', '../../etc', 'cs']) {
      const r = await settleTipAction(bad)
      expect('error' in r, `should refuse ${JSON.stringify(bad)}`).toBe(true)
    }
    expect(recordTipFromSessionId).not.toHaveBeenCalled()
  })

  it('is limited per IP, and never touches Stripe once the limiter refuses', async () => {
    rateLimitOk.mockResolvedValue(false)
    const r = await settleTipAction('cs_live_abc')
    expect('error' in r).toBe(true)
    expect(recordTipFromSessionId).not.toHaveBeenCalled()
  })

  it('never turns a reconcile failure into an error the tipper sees', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    recordTipFromSessionId.mockRejectedValue(new Error('stripe down'))
    const r = await settleTipAction('cs_live_abc')
    expect('error' in r, 'a paid tipper must never be told their payment failed').toBe(false)
    expect(r).toEqual({ data: { settled: false } })
    expect(err, 'and the failure is loud, never swallowed').toHaveBeenCalled()
    err.mockRestore()
  })
})
