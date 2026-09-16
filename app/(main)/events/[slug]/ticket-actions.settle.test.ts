import { describe, it, expect, vi, beforeEach } from 'vitest'

// `settleTicketAction` — THE WEBHOOK-INDEPENDENT SETTLE (LIVE-366).
//
// 🔴 WHY IT EXISTS. `confirm({ redirect: 'if_required' })` is what keeps a buyer on the page, and
// it means the common card path NEVER navigates. The session's `return_url`, carrying
// `session_id={CHECKOUT_SESSION_ID}` and written as the webhook's backstop, is therefore never
// visited on the path that became the default. Before this action, an on-page ticket had exactly
// one way to become real, and a late or misconfigured webhook meant no row flipped, no receipt
// sent, and no host told -- behind a confirmation panel that had already promised a ticket.
//
// WHAT IS PINNED HERE is the action's SAFETY, not its plumbing (the settle itself is proven
// against the real SQL in the tickets suite):
//   · it delegates to the SAME reconcile the webhook's landing page uses, so the two cannot drift;
//   · the kill switch is checked first, exactly as every other ticket action checks it;
//   · a caller cannot hand it anything that is not a checkout session id;
//   · 🔴 A THROW IS NEVER FATAL. The buyer has already paid. Turning a reconcile failure into an
//     error would send someone who was successfully charged back to pay a second time.

vi.mock('next/headers', () => ({ headers: async () => new Map([['x-forwarded-for', '1.2.3.4']]) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
const rateLimitOk = vi.fn(async () => true)
vi.mock('@/lib/rate-limit', () => ({ rateLimitOk: (...a: unknown[]) => rateLimitOk(...(a as [])) }))
vi.mock('@/lib/auth', () => ({ getMyProfileId: async () => 'buyer-1' }))
vi.mock('@/app/(main)/events/actions', () => ({ setRsvpStatus: vi.fn() }))
vi.mock('@/app/(main)/events/guest-rsvp-actions', () => ({ submitGuestRsvp: vi.fn() }))
vi.mock('@/lib/core/load-capabilities', () => ({ getEventCapabilities: async () => new Set<string>() }))

const recordTicketFromSessionId = vi.fn(async (_id: string): Promise<number | null> => 4400)
vi.mock('@/lib/billing/tickets', () => ({
  createTicketCheckout: vi.fn(),
  refundTicket: vi.fn(),
  recordTicketFromSessionId: (id: string) => recordTicketFromSessionId(id),
}))

const ticketing = vi.hoisted(() => ({ on: true }))
vi.mock('@/lib/events/ticketing', () => ({
  get TICKETING_ENABLED() {
    return ticketing.on
  },
}))

import { settleTicketAction } from './ticket-actions'

beforeEach(() => {
  ticketing.on = true
  recordTicketFromSessionId.mockReset()
  recordTicketFromSessionId.mockResolvedValue(4400)
  rateLimitOk.mockReset()
  rateLimitOk.mockResolvedValue(true)
})

describe('settleTicketAction', () => {
  it('runs the SAME reconcile the redirect path uses, so the two cannot drift', async () => {
    const r = await settleTicketAction('cs_live_abc')
    expect(recordTicketFromSessionId).toHaveBeenCalledWith('cs_live_abc')
    expect(r).toEqual({ data: { settled: true } })
  })

  it('reports not-settled when Stripe says the session is not a paid ticket', async () => {
    recordTicketFromSessionId.mockResolvedValue(null)
    const r = await settleTicketAction('cs_live_abc')
    expect(r).toEqual({ data: { settled: false } })
  })

  it('checks the kill switch before it touches Stripe, like every other ticket action', async () => {
    ticketing.on = false
    const r = await settleTicketAction('cs_live_abc')
    expect('error' in r).toBe(true)
    expect(recordTicketFromSessionId).not.toHaveBeenCalled()
  })

  it('refuses anything that is not a checkout session id', async () => {
    for (const bad of ['', 'pi_123', 'evt_123', '../../etc', 'cs']) {
      const r = await settleTicketAction(bad)
      expect('error' in r, `should refuse ${JSON.stringify(bad)}`).toBe(true)
    }
    expect(recordTicketFromSessionId).not.toHaveBeenCalled()
  })

  // The endpoint answers a yes/no about a session id, and a yes/no answered without limit is an
  // oracle. It is limited per IP, and -- unlike the guest door -- it fails OPEN when the limiter is
  // not wired, because denying a post-charge reconcile protects nothing and silently deletes the
  // fast path the webhook is only the backstop for.
  it('is limited per IP, and never touches Stripe once the limiter refuses', async () => {
    rateLimitOk.mockResolvedValue(false)
    const r = await settleTicketAction('cs_live_abc')
    expect('error' in r).toBe(true)
    expect(recordTicketFromSessionId).not.toHaveBeenCalled()
  })

  // 🔴 The buyer has already been charged. A thrown reconcile is our problem; the webhook still
  // owes them the ticket, and an error here would send a paid buyer back to pay again.
  it('never turns a reconcile failure into an error the buyer sees', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    recordTicketFromSessionId.mockRejectedValue(new Error('stripe down'))
    const r = await settleTicketAction('cs_live_abc')
    expect('error' in r, 'a paid buyer must never be told their payment failed').toBe(false)
    expect(r).toEqual({ data: { settled: false } })
    expect(err, 'and the failure is loud, never swallowed').toHaveBeenCalled()
    err.mockRestore()
  })
})
