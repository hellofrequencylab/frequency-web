import { describe, it, expect, vi, beforeEach } from 'vitest'

// THE LEAD BESIDE THE SEAT (Phase 1). The signed-out RSVP form now captures a `signup_leads` row
// next to the guest seat, so an address that arrived through an event door is a proto-profile the
// rest of the platform can see rather than a row only the event knows about.
//
// What these tests pin is mostly a NEGATIVE: the lead capture may never change what the reader is
// told. This file's whole design is one identical reply for every good-faith submission
// (anti-enumeration, ADR-1032), and a best-effort CRM write is exactly the kind of helpful addition
// that erodes that one careful improvement at a time. So:
//   1. a good submission captures the lead with p_source 'event_rsvp' and the NORMALISED address;
//   2. a capture_signup_lead that THROWS still returns { ok: true };
//   3. a capture_signup_lead that resolves { error } still returns { ok: true };
//   4. a failed SEAT (the WRITE_FAILED path) captures no lead at all — there is no RSVP to record;
//   5. the honeypot captures no lead, or the silent-success door becomes a free write endpoint;
//   6. attribution that throws does not drop the lead;
//   7. the claim_token in the RPC's reply is never read (it cannot reach the person it belongs to).
// Mocking idiom is lifted from guest-rsvp-actions.test.ts: headers, rate limiter, Supabase client
// and the email module are stubbed, plus the attribution cookie reader this path added.

vi.mock('next/headers', () => ({
  headers: async () => new Map([['x-forwarded-for', '1.2.3.4']]),
}))
vi.mock('@/lib/rate-limit', () => ({ rateLimitOk: vi.fn(async () => true) }))

type RpcReply = { data: unknown; error: { message: string } | null }

const rpc = vi.fn(async (_fn: string, _args: Record<string, unknown>): Promise<RpcReply> => ({
  data: 'receipt-1',
  error: null,
}))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ rpc }) }))

const sendGuestRsvpReceipt = vi.fn(async (_eventId: string, _email: string) => {})
vi.mock('@/lib/events/guest-rsvp-email', () => ({
  sendGuestRsvpReceipt: (eventId: string, email: string) => sendGuestRsvpReceipt(eventId, email),
}))

const resolveAcquisition = vi.fn(async () => ACQUISITION as unknown)
vi.mock('@/lib/attribution/server', () => ({
  resolveAcquisition: () => resolveAcquisition(),
}))

import { submitGuestRsvp } from './guest-rsvp-actions'

const EVENT = '11111111-1111-4111-8111-111111111111'

/** Shape-compatible with AcquisitionRecord; passed through as-is, so the action never reads it. */
const ACQUISITION = {
  channel: 'direct',
  first_touch: null,
  last_touch_channel: 'direct',
  signals: {},
  stamped_at: '2026-09-11T00:00:00.000Z',
}

/** The args of the one capture_signup_lead call, or undefined if it never happened. */
function leadArgs(): Record<string, unknown> | undefined {
  return rpc.mock.calls.find((c) => c[0] === 'capture_signup_lead')?.[1]
}

/** Default: both RPCs succeed. `capture_signup_lead` answers the shape the SQL really returns. */
function bothOk() {
  rpc.mockImplementation(async (fn: string) =>
    fn === 'capture_signup_lead'
      ? { data: { id: 'lead-1', claim_token: 'tok-secret' }, error: null }
      : { data: 'receipt-1', error: null },
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  bothOk()
  sendGuestRsvpReceipt.mockResolvedValue(undefined)
  resolveAcquisition.mockResolvedValue(ACQUISITION)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('submitGuestRsvp captures a signup lead beside the seat', () => {
  it('calls capture_signup_lead with event_rsvp as the source and the normalised address', async () => {
    const res = await submitGuestRsvp({ eventId: EVENT, email: ' Sam@Example.COM ', name: ' Sam ' })

    expect(res).toEqual({ ok: true })
    expect(leadArgs()).toEqual({
      p_email: 'sam@example.com',
      p_source: 'event_rsvp',
      p_step: 0,
      p_first_name: null,
      p_last_name: null,
      p_display_name: 'Sam',
      p_handle: null,
      p_payload: { eventId: EVENT },
      p_attribution: ACQUISITION,
    })
  })

  it('still captures the seat first: the lead is an addition, not a replacement', async () => {
    await submitGuestRsvp({ eventId: EVENT, email: 'sam@example.com' })
    const names = rpc.mock.calls.map((c) => c[0])
    expect(names).toContain('capture_guest_rsvp')
    expect(names).toContain('capture_signup_lead')
    expect(names.indexOf('capture_guest_rsvp')).toBeLessThan(names.indexOf('capture_signup_lead'))
  })

  it('leaves the name null when the guest gave none', async () => {
    await submitGuestRsvp({ eventId: EVENT, email: 'sam@example.com' })
    expect(leadArgs()?.p_display_name).toBeNull()
  })

  it('captures the lead unattributed rather than dropping it when attribution throws', async () => {
    resolveAcquisition.mockRejectedValue(new Error('no cookie jar'))
    const res = await submitGuestRsvp({ eventId: EVENT, email: 'sam@example.com' })
    expect(res).toEqual({ ok: true })
    expect(leadArgs()?.p_attribution).toEqual({})
  })
})

describe('the lead capture never changes the reply (ADR-1032)', () => {
  it('returns ok when capture_signup_lead THROWS', async () => {
    rpc.mockImplementation(async (fn: string) => {
      if (fn === 'capture_signup_lead') throw new Error('fetch failed')
      return { data: 'receipt-1', error: null }
    })

    const res = await submitGuestRsvp({ eventId: EVENT, email: 'sam@example.com' })
    expect(res).toEqual({ ok: true })
    // The receipt is the guest's only record of the seat and must still have gone out.
    expect(sendGuestRsvpReceipt).toHaveBeenCalledWith(EVENT, 'sam@example.com')
    expect(console.error).toHaveBeenCalled()
  })

  it('returns ok when capture_signup_lead resolves { error }', async () => {
    rpc.mockImplementation(async (fn: string) =>
      fn === 'capture_signup_lead'
        ? { data: null, error: { message: 'permission denied for function capture_signup_lead' } }
        : { data: 'receipt-1', error: null },
    )

    const res = await submitGuestRsvp({ eventId: EVENT, email: 'sam@example.com' })
    expect(res).toEqual({ ok: true })
    expect(sendGuestRsvpReceipt).toHaveBeenCalledTimes(1)
    expect(console.error).toHaveBeenCalled()
  })

  it('returns ok whatever the lead RPC hands back, including nothing at all', async () => {
    rpc.mockImplementation(async (fn: string) =>
      fn === 'capture_signup_lead' ? { data: null, error: null } : { data: 'receipt-1', error: null },
    )
    await expect(submitGuestRsvp({ eventId: EVENT, email: 'sam@example.com' })).resolves.toEqual({
      ok: true,
    })
  })

  it('a receipt email that fails does not stop the lead from being captured', async () => {
    sendGuestRsvpReceipt.mockRejectedValue(new Error('outbox down'))
    const res = await submitGuestRsvp({ eventId: EVENT, email: 'sam@example.com' })
    expect(res).toEqual({ ok: true })
    expect(leadArgs()).toBeDefined()
  })
})

describe('the paths that must capture NO lead', () => {
  it('captures nothing when the seat write fails with { error }', async () => {
    rpc.mockImplementation(async (fn: string) =>
      fn === 'capture_guest_rsvp'
        ? { data: null, error: { message: 'connection refused' } }
        : { data: null, error: null },
    )

    const res = await submitGuestRsvp({ eventId: EVENT, email: 'sam@example.com' })
    expect(res).toEqual({ ok: false, error: 'We could not save your spot. Please try again.' })
    expect(leadArgs()).toBeUndefined()
    expect(rpc).toHaveBeenCalledTimes(1)
  })

  it('captures nothing when the seat write THROWS', async () => {
    rpc.mockImplementation(async (fn: string) => {
      if (fn === 'capture_guest_rsvp') throw new Error('fetch failed')
      return { data: null, error: null }
    })

    const res = await submitGuestRsvp({ eventId: EVENT, email: 'sam@example.com' })
    expect(res.ok).toBe(false)
    expect(leadArgs()).toBeUndefined()
  })

  it('captures nothing on the honeypot path', async () => {
    const res = await submitGuestRsvp({
      eventId: EVENT,
      email: 'bot@example.com',
      company: 'Acme Ltd',
    })
    expect(res).toEqual({ ok: true })
    expect(rpc).not.toHaveBeenCalled()
    expect(leadArgs()).toBeUndefined()
  })

  it('captures nothing for a malformed address', async () => {
    const res = await submitGuestRsvp({ eventId: EVENT, email: 'not-an-email' })
    expect(res.ok).toBe(false)
    expect(rpc).not.toHaveBeenCalled()
  })
})
