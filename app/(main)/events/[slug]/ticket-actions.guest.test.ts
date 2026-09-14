import { describe, it, expect, vi, beforeEach } from 'vitest'

// THE GUEST TICKET ACTION — `startGuestTicket`, the signed-out door beside `startTicket`.
//
// It is a SEPARATE export on purpose: widening `startTicket` would have made its
// `getMyProfileId()` guard conditional, and these tests pin that the member path still refuses
// anyone without a profile, unambiguously.
//
// The door idioms are copied from app/(main)/events/guest-rsvp-actions.ts and pinned here:
//   * TICKETING_ENABLED is checked FIRST, before anything else runs;
//   * the honeypot returns a success and calls NOTHING;
//   * the per-IP limiter refuses, and it runs before the signed-in branch so a session cannot buy
//     its way past it;
//   * the address is trimmed + lowercased once and the SQL re-validates (this check is for UX);
//   * a signed-in caller is routed to the MEMBER path rather than given a guest row.
//
// `createTicketCheckout` is stubbed: what it does with a guest email is proven against the real
// gates in lib/billing/tickets.guest.test.ts. Mocking idiom is guest-rsvp-actions.test.ts.

vi.mock('next/headers', () => ({
  headers: async () => new Map([['x-forwarded-for', '1.2.3.4']]),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const rateLimitOk = vi.fn(async () => true)
vi.mock('@/lib/rate-limit', () => ({ rateLimitOk: (...a: unknown[]) => rateLimitOk(...(a as [])) }))

const getMyProfileId = vi.fn(async (): Promise<string | null> => null)
vi.mock('@/lib/auth', () => ({ getMyProfileId: () => getMyProfileId() }))

const createTicketCheckout = vi.fn(async (_opts: Record<string, unknown>) => ({
  url: 'https://stripe.test/cs_1',
} as { url?: string; error?: string; free?: boolean }))
const refundTicket = vi.fn(async () => ({}))
vi.mock('@/lib/billing/tickets', () => ({
  createTicketCheckout: (o: Record<string, unknown>) => createTicketCheckout(o),
  refundTicket: () => refundTicket(),
}))

const setRsvpStatus = vi.fn(async () => {})
vi.mock('@/app/(main)/events/actions', () => ({ setRsvpStatus: (...a: unknown[]) => setRsvpStatus(...(a as [])) }))

// The guest free-claim recorder (LIVE-318): the guest RSVP action, which forwards the tier id to
// capture_guest_rsvp. What the SQL does with it is proven in supabase/tests/guest_free_tier_claim.test.sql.
const submitGuestRsvp = vi.fn(async (_input: Record<string, unknown>) => ({ ok: true } as { ok: true } | { ok: false; error: string }))
vi.mock('@/app/(main)/events/guest-rsvp-actions', () => ({
  submitGuestRsvp: (i: Record<string, unknown>) => submitGuestRsvp(i),
}))
vi.mock('@/lib/core/load-capabilities', () => ({ getEventCapabilities: async () => new Set<string>() }))

const ticketing = vi.hoisted(() => ({ on: true }))
vi.mock('@/lib/events/ticketing', () => ({
  get TICKETING_ENABLED() {
    return ticketing.on
  },
}))

import { startGuestTicket, startTicket } from './ticket-actions'

const EVENT = '11111111-1111-4111-8111-111111111111'

beforeEach(() => {
  vi.clearAllMocks()
  ticketing.on = true
  rateLimitOk.mockResolvedValue(true)
  getMyProfileId.mockResolvedValue(null)
  createTicketCheckout.mockResolvedValue({ url: 'https://stripe.test/cs_1' })
  submitGuestRsvp.mockResolvedValue({ ok: true })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('startGuestTicket — the door checks, in order', () => {
  it('refuses on the hard TICKETING_ENABLED off switch before anything else runs', async () => {
    ticketing.on = false
    const res = await startGuestTicket({ eventId: EVENT, email: 'sam@example.com' })
    expect(res).toEqual({ error: 'Ticket sales are off right now.' })
    expect(rateLimitOk).not.toHaveBeenCalled()
    expect(createTicketCheckout).not.toHaveBeenCalled()
  })

  it('honeypot: anything in `company` returns a success and calls NOTHING', async () => {
    const res = await startGuestTicket({ eventId: EVENT, email: 'sam@example.com', company: 'Acme' })
    expect(res).toEqual({ data: {} })
    expect('error' in res).toBe(false)
    expect(rateLimitOk).not.toHaveBeenCalled()
    expect(getMyProfileId).not.toHaveBeenCalled()
    expect(createTicketCheckout).not.toHaveBeenCalled()
  })

  it('the honeypot success claims NOTHING: no url and no free', async () => {
    // Deliberately unlike the guest RSVP's full success shape. A `free: true` here would tell a
    // human whose browser autofilled a hidden field that they hold a ticket they do not hold.
    const res = await startGuestTicket({ eventId: EVENT, email: 'sam@example.com', company: ' x ' })
    expect(res).toEqual({ data: {} })
  })

  it('an EMPTY company is not the honeypot', async () => {
    const res = await startGuestTicket({ eventId: EVENT, email: 'sam@example.com', company: '   ' })
    expect(res).toEqual({ data: { url: 'https://stripe.test/cs_1' } })
    expect(createTicketCheckout).toHaveBeenCalledTimes(1)
  })

  it('refuses a rate-limited caller and starts no checkout', async () => {
    rateLimitOk.mockResolvedValue(false)
    const res = await startGuestTicket({ eventId: EVENT, email: 'sam@example.com' })
    expect(res).toEqual({ error: 'Too many requests. Please try again in a few minutes.' })
    expect(createTicketCheckout).not.toHaveBeenCalled()
    expect(getMyProfileId).not.toHaveBeenCalled()
  })

  it('throttles per IP on its own bucket, 5 per 10 minutes, like the guest RSVP door', async () => {
    await startGuestTicket({ eventId: EVENT, email: 'sam@example.com' })
    expect(rateLimitOk).toHaveBeenCalledWith('event_guest_ticket', '1.2.3.4', 5, '10 m')
    // No `whenUnconfigured` override: the default is deny, so an unconfigured Upstash in
    // production fails CLOSED on a door that reserves inventory.
    expect(rateLimitOk.mock.calls[0]).toHaveLength(4)
  })

  it('refuses a malformed address for UX, without starting a checkout', async () => {
    const res = await startGuestTicket({ eventId: EVENT, email: 'not-an-email' })
    expect(res).toEqual({ error: 'Please enter a valid email address.' })
    expect(createTicketCheckout).not.toHaveBeenCalled()
  })
})

describe('startGuestTicket — what it hands the money boundary', () => {
  it('passes the trimmed, lowercased address as guestEmail and NEVER a buyerProfileId', async () => {
    const res = await startGuestTicket({
      eventId: EVENT,
      email: '  Sam@Example.COM  ',
      name: 'Sam',
      ticketTypeId: 'tt-1',
      amountCents: 2500,
      qty: 2,
    })
    expect(res).toEqual({ data: { url: 'https://stripe.test/cs_1' } })
    expect(createTicketCheckout).toHaveBeenCalledWith({
      guestEmail: 'sam@example.com',
      eventId: EVENT,
      qty: 2,
      ticketTypeId: 'tt-1',
      amountCents: 2500,
    })
    const [opts] = createTicketCheckout.mock.calls[0]
    expect(opts).not.toHaveProperty('buyerProfileId')
  })

  it('passes a refusal from the money boundary through verbatim', async () => {
    createTicketCheckout.mockResolvedValue({ error: 'This ticket is for members only.' })
    const res = await startGuestTicket({ eventId: EVENT, email: 'sam@example.com', ticketTypeId: 'tt-1' })
    expect(res).toEqual({ error: 'This ticket is for members only.' })
  })

  it('records a free tier as a GUEST RSVP with the tier id, and never through the member recorder (LIVE-318)', async () => {
    createTicketCheckout.mockResolvedValue({ free: true })
    const res = await startGuestTicket({
      eventId: EVENT,
      email: ' Sam@Example.com ',
      name: 'Sam',
      ticketTypeId: 'tt-1',
    })
    expect(res).toEqual({ data: { free: true } })
    // The guest twin of setRsvpStatus: the same going RSVP row, under the typed address. The name
    // goes along on this path only (it is the host's roster line, not a billing name), and the
    // tier id is what lets capture_guest_rsvp seat a guest on a tickets-mode event.
    expect(submitGuestRsvp).toHaveBeenCalledTimes(1)
    expect(submitGuestRsvp).toHaveBeenCalledWith({
      eventId: EVENT,
      email: 'sam@example.com',
      name: 'Sam',
      ticketTypeId: 'tt-1',
    })
    // The member claim recorder needs a profile; it must never be reached from the guest door.
    expect(setRsvpStatus).not.toHaveBeenCalled()
  })

  it('a free claim the SQL could not write is a refusal, passed through verbatim, never a success', async () => {
    createTicketCheckout.mockResolvedValue({ free: true })
    submitGuestRsvp.mockResolvedValue({ ok: false, error: 'We could not save your spot. Please try again.' })
    const res = await startGuestTicket({ eventId: EVENT, email: 'sam@example.com', ticketTypeId: 'tt-1' })
    expect(res).toEqual({ error: 'We could not save your spot. Please try again.' })
  })

  it('a free claim passes a null tier id, not undefined, when the form named none (the flat-price path)', async () => {
    createTicketCheckout.mockResolvedValue({ free: true })
    await startGuestTicket({ eventId: EVENT, email: 'sam@example.com' })
    expect(submitGuestRsvp).toHaveBeenCalledWith(expect.objectContaining({ ticketTypeId: null }))
  })

  it('refuses when the boundary returns neither a url nor a free claim', async () => {
    createTicketCheckout.mockResolvedValue({})
    const res = await startGuestTicket({ eventId: EVENT, email: 'sam@example.com' })
    expect(res).toEqual({ error: 'Could not start checkout.' })
  })

  it('every member-facing line carries no em dash (CONTENT-VOICE)', async () => {
    const lines: string[] = []
    ticketing.on = false
    lines.push((await startGuestTicket({ eventId: EVENT, email: 'a@b.co' }) as { error: string }).error)
    ticketing.on = true
    rateLimitOk.mockResolvedValue(false)
    lines.push((await startGuestTicket({ eventId: EVENT, email: 'a@b.co' }) as { error: string }).error)
    rateLimitOk.mockResolvedValue(true)
    lines.push((await startGuestTicket({ eventId: EVENT, email: 'nope' }) as { error: string }).error)
    createTicketCheckout.mockResolvedValue({})
    lines.push((await startGuestTicket({ eventId: EVENT, email: 'a@b.co' }) as { error: string }).error)
    for (const l of lines) expect(l).not.toMatch(/[—–]/)
  })
})

describe('startGuestTicket — a signed-in caller gets their MEMBER ticket, not a guest row', () => {
  it('routes to the member path and never sends a guestEmail', async () => {
    getMyProfileId.mockResolvedValue('buyer-1')
    const res = await startGuestTicket({
      eventId: EVENT,
      email: 'someone-else@example.com',
      ticketTypeId: 'tt-1',
      qty: 3,
    })
    expect(res).toEqual({ data: { url: 'https://stripe.test/cs_1' } })
    expect(createTicketCheckout).toHaveBeenCalledTimes(1)
    const [opts] = createTicketCheckout.mock.calls[0]
    expect(opts).toEqual({ buyerProfileId: 'buyer-1', eventId: EVENT, qty: 3, ticketTypeId: 'tt-1', amountCents: null })
    // The address they typed does not decide who the ticket belongs to.
    expect(opts).not.toHaveProperty('guestEmail')
  })

  it('does not even check the address shape for a signed-in caller', async () => {
    getMyProfileId.mockResolvedValue('buyer-1')
    const res = await startGuestTicket({ eventId: EVENT, email: '' })
    expect(res).toEqual({ data: { url: 'https://stripe.test/cs_1' } })
  })
})

describe('startTicket — the member path is untouched (regression)', () => {
  it('still refuses a signed-out caller outright', async () => {
    getMyProfileId.mockResolvedValue(null)
    const res = await startTicket(EVENT)
    expect(res).toEqual({ error: 'Sign in to buy a ticket.' })
    expect(createTicketCheckout).not.toHaveBeenCalled()
  })

  it('still checks the hard off switch first', async () => {
    ticketing.on = false
    const res = await startTicket(EVENT)
    expect(res).toEqual({ error: 'Ticket sales are off right now.' })
    expect(getMyProfileId).not.toHaveBeenCalled()
  })

  it('still passes buyerProfileId and its defaults unchanged', async () => {
    getMyProfileId.mockResolvedValue('buyer-1')
    const res = await startTicket(EVENT)
    expect(res).toEqual({ data: { url: 'https://stripe.test/cs_1' } })
    expect(createTicketCheckout).toHaveBeenCalledWith({
      buyerProfileId: 'buyer-1',
      eventId: EVENT,
      qty: 1,
      ticketTypeId: null,
      amountCents: null,
    })
  })

  it('still records a free tier as a going RSVP and is NOT rate limited', async () => {
    getMyProfileId.mockResolvedValue('buyer-1')
    createTicketCheckout.mockResolvedValue({ free: true })
    const res = await startTicket(EVENT)
    expect(res).toEqual({ data: { free: true } })
    expect(setRsvpStatus).toHaveBeenCalledWith(EVENT, 'going')
    expect(rateLimitOk).not.toHaveBeenCalled()
  })
})
