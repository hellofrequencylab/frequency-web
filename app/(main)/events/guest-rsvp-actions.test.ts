import { describe, it, expect, vi, beforeEach } from 'vitest'

// Meta-scan L5-14 (2026-09-05): the signed-out guest RSVP always answered "ok" and always sent the
// receipt email, even when the capture RPC failed. A guest read "Check your email" while no seat
// existed and no email could be composed for it. These tests pin the repaired contract:
//   1. an RPC that resolves `{ error }` -> the form's error shape, plain message, NO receipt email;
//   2. an RPC that throws (network, PostgREST unreachable) -> the same;
//   3. an RPC that resolves a receipt -> ok, and the receipt email is sent;
//   4. the receipt email failing AFTER the seat is written never turns a success into an error;
//   5. the reply never branches on `data` (the opaque receipt): a null receipt is still "ok".
// The cookie jar, headers, rate limiter, Supabase client and the email module are all stubbed.

vi.mock('next/headers', () => ({
  headers: async () => new Map([['x-forwarded-for', '1.2.3.4']]),
}))
vi.mock('@/lib/rate-limit', () => ({ rateLimitOk: vi.fn(async () => true) }))

const rpc = vi.fn(async (_fn: string, _args: Record<string, unknown>) => ({
  data: 'receipt-1' as unknown,
  error: null as { message: string } | null,
}))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ rpc }) }))

const sendGuestRsvpReceipt = vi.fn(async (_eventId: string, _email: string) => {})
vi.mock('@/lib/events/guest-rsvp-email', () => ({
  sendGuestRsvpReceipt: (eventId: string, email: string) => sendGuestRsvpReceipt(eventId, email),
}))

import { submitGuestRsvp } from './guest-rsvp-actions'

const EVENT = '11111111-1111-4111-8111-111111111111'

beforeEach(() => {
  vi.clearAllMocks()
  rpc.mockResolvedValue({ data: 'receipt-1', error: null })
  sendGuestRsvpReceipt.mockResolvedValue(undefined)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('submitGuestRsvp, the write result (L5-14)', () => {
  it('returns the error shape and sends NO receipt when the capture RPC resolves { error }', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'connection refused' } })
    const res = await submitGuestRsvp({ eventId: EVENT, email: 'sam@example.com' })
    expect(res).toEqual({ ok: false, error: 'We could not save your spot. Please try again.' })
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(sendGuestRsvpReceipt).not.toHaveBeenCalled()
    expect(console.error).toHaveBeenCalled()
  })

  it('returns the error shape and sends NO receipt when the capture RPC throws', async () => {
    rpc.mockRejectedValue(new Error('fetch failed'))
    const res = await submitGuestRsvp({ eventId: EVENT, email: 'sam@example.com' })
    expect(res).toEqual({ ok: false, error: 'We could not save your spot. Please try again.' })
    expect(sendGuestRsvpReceipt).not.toHaveBeenCalled()
  })

  it('returns ok and sends the receipt when the RPC resolves a receipt', async () => {
    const res = await submitGuestRsvp({ eventId: EVENT, email: ' Sam@Example.COM ', name: 'Sam' })
    expect(res).toEqual({ ok: true })
    expect(rpc).toHaveBeenCalledWith('capture_guest_rsvp', {
      p_event_id: EVENT,
      p_email: 'sam@example.com',
      p_name: 'Sam',
    })
    expect(sendGuestRsvpReceipt).toHaveBeenCalledWith(EVENT, 'sam@example.com')
  })

  it('a receipt email that fails AFTER the seat is written does not turn the reply into an error', async () => {
    sendGuestRsvpReceipt.mockRejectedValue(new Error('outbox down'))
    const res = await submitGuestRsvp({ eventId: EVENT, email: 'sam@example.com' })
    expect(res).toEqual({ ok: true })
  })

  it('never branches on the receipt itself: a null receipt with no error is still ok', async () => {
    // capture_guest_rsvp returns null only for a malformed address, which this action screens
    // before calling it; either way the receipt is opaque and must not decide the reply.
    rpc.mockResolvedValue({ data: null, error: null })
    const res = await submitGuestRsvp({ eventId: EVENT, email: 'sam@example.com' })
    expect(res).toEqual({ ok: true })
    expect(sendGuestRsvpReceipt).toHaveBeenCalledTimes(1)
  })

  it('the member-facing error line carries no em dash', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'x' } })
    const res = await submitGuestRsvp({ eventId: EVENT, email: 'sam@example.com' })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).not.toMatch(/[—–]/)
  })
})
