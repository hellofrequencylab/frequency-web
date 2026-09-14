import { describe, it, expect, vi, beforeEach } from 'vitest'

// THE MEMBER TICKET EMAIL (lib/events/member-ticket-email.ts), the sibling of
// ./guest-ticket-email.test.ts. Golden strings, on purpose: this is the member's receipt for real
// money, and the guest test beside it only asserts the parameters handed to the mailer. Here the
// REAL sender in lib/email.ts renders, and the outbox is the seam, so what is pinned is the message
// a member reads.
//
// Three properties:
//
//   1. IT SAYS WHAT WAS BOUGHT. Event, when, tier, amount, a calendar to put it in.
//   2. IT WITHHOLDS THE ADDRESS ON A hide_address EVENT, exactly as the guest receipt does, and
//      offers no calendar file there, because an .ics carries the address in its LOCATION field
//      (SCAN-209). A member who holds a ticket IS the reader the event PAGE unlocks the address for
//      (ADR-825); the message is held to the guest rule because a message cannot check who is
//      reading it and the page can (ADR-854, the header of the module). Widening this is a
//      decision, not a fix, so the rule is pinned here by name.
//   3. IT NEVER THROWS. It runs from the Stripe webhook's settle, after the ticket is already
//      `succeeded`, so every failure is logged and resolved void.
//
// Plus the gate: a receipt is transactional. A muted events category must not silence it, so the
// module asks the send gate with the 'transactional' category and honours a refusal.

const state = vi.hoisted(() => {
  let event: unknown = null
  let profile: unknown = { display_name: 'Ada', auth_user_id: 'u-1' }
  let tier: unknown = { name: 'General' }
  let email: string | null = 'ada@example.com'
  let throwOnRead = false
  return {
    setEvent(e: unknown) { event = e },
    setProfile(p: unknown) { profile = p },
    setTier(t: unknown) { tier = t },
    setEmail(e: string | null) { email = e },
    setThrowOnRead(v: boolean) { throwOnRead = v },
    email: () => email,
    read(table: string) {
      if (throwOnRead) throw new Error('postgrest unreachable')
      if (table === 'circles') return { data: { name: 'Ocean Beach' }, error: null }
      if (table === 'profiles') return { data: profile, error: null }
      if (table === 'event_ticket_types') return { data: tier, error: null }
      return { data: event, error: null }
    },
    reset() {
      event = null
      profile = { display_name: 'Ada', auth_user_id: 'u-1' }
      tier = { name: 'General' }
      email = 'ada@example.com'
      throwOnRead = false
    },
  }
})

const outbox = vi.hoisted(() => ({
  enqueue: vi.fn(async (_kind: string, _payload: Record<string, unknown>) => {}),
}))
const gate = vi.hoisted(() => ({
  resolveSendGate: vi.fn(async (..._a: unknown[]) => ({ allowed: true, reason: 'ok' })),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const b: any = {
        select: () => b,
        eq: () => b,
        maybeSingle: () => b,
        then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => {
          try {
            return Promise.resolve(state.read(table)).then(resolve, reject)
          } catch (e) {
            return Promise.reject(e).then(resolve, reject)
          }
        },
      }
      return b
    },
    auth: {
      admin: {
        getUserById: async () => ({ data: { user: state.email() ? { email: state.email() } : null } }),
      },
    },
  }),
}))
vi.mock('@/lib/queue/outbox', () => outbox)
vi.mock('@/lib/comms/send-gate', () => gate)
vi.mock('@/lib/time/zone', () => ({
  formatEventWhen: () => 'Thu, Oct 1, 8:00 AM PDT',
  resolveZone: (tz: string | null) => tz ?? 'UTC',
}))
// The real builder lives in a component module; a pure stand-in that echoes the location is enough
// to prove the address never rides along on a hidden-address event.
vi.mock('@/components/events/add-to-calendar', () => ({
  buildGoogleCalendarUrl: (a: { title: string; location?: string | null }) =>
    `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(a.title)}&location=${encodeURIComponent(a.location ?? '')}`,
}))

import { sendMemberTicketReceipt } from './member-ticket-email'

const OPEN_EVENT = {
  title: 'Sunrise Sit',
  slug: 'sunrise-sit',
  starts_at: '2026-10-01T15:00:00Z',
  ends_at: '2026-10-01T16:00:00Z',
  description: 'Bring a mat.',
  is_cancelled: false,
  time_zone: 'America/Los_Angeles',
  hide_address: false,
  location: '3598 Royal Rd, Vista, California',
  venue_name: null,
  street: null,
  city: 'Vista',
  region: 'California',
  scope_id: 'c1',
  scope_type: 'circle',
  host: { display_name: 'Ada' },
}

const args = { eventId: 'ev1', profileId: 'p-1', ticketTypeId: 'tier1', qty: 2, amountCents: 4000, currency: 'usd' }

type Sent = { to: string; subject: string; html: string; text: string; headers?: Record<string, string> }
const sent = () => outbox.enqueue.mock.calls[0]?.[1] as unknown as Sent | undefined

beforeEach(() => {
  state.reset()
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

describe('what the member is told (golden strings)', () => {
  it('sends the receipt: name, event, when, tier, amount, the full address and both calendar links', async () => {
    state.setEvent(OPEN_EVENT)
    await sendMemberTicketReceipt(args)

    expect(outbox.enqueue).toHaveBeenCalledTimes(1)
    expect(outbox.enqueue.mock.calls[0][0]).toBe('email')
    const m = sent()!
    expect(m.to).toBe('ada@example.com')
    expect(m.subject).toBe('Your ticket: Sunrise Sit')

    // The text body, line for line where it matters.
    expect(m.text).toContain('Hi Ada, payment received. This ticket is on your account, and this email is your receipt.')
    expect(m.text).toContain('When: Thu, Oct 1, 8:00 AM PDT')
    expect(m.text).toContain('Where: 3598 Royal Rd, Vista, California')
    expect(m.text).toContain('Hosted by Ada · Ocean Beach')
    expect(m.text).toContain('Ticket: 2 tickets (General), $40')
    expect(m.text).toContain('View event: https://frequencylocal.com/events/sunrise-sit')
    expect(m.text).toContain('Add to your calendar:')
    expect(m.text).toContain('Apple / Outlook (.ics): https://frequencylocal.com/events/sunrise-sit/event.ics')
    expect(m.text).toContain('Google Calendar: https://calendar.google.com/calendar/render?action=TEMPLATE&text=Sunrise%20Sit')
    expect(m.text).toContain('You are getting this because you bought a ticket to Sunrise Sit on Frequency.')

    // The HTML carries the same facts.
    expect(m.html).toContain('Your ticket')
    expect(m.html).toContain('<h1')
    expect(m.html).toContain('Sunrise Sit</h1>')
    expect(m.html).toContain('2 tickets (General), $40')
    expect(m.html).toContain('3598 Royal Rd, Vista, California')
    expect(m.html).toContain('Add to your calendar')
    expect(m.html).toContain('href="https://frequencylocal.com/events/sunrise-sit/event.ics"')
  })

  it('is a member message, not a guest one: no account offer, no "if that was not you"', async () => {
    state.setEvent(OPEN_EVENT)
    await sendMemberTicketReceipt(args)

    const m = sent()!
    for (const body of [m.html, m.text]) {
      expect(body).not.toContain('Add this ticket to an account')
      expect(body).not.toContain('If that was not you')
      expect(body).not.toContain('/sign-in?')
    }
    // A receipt, not a reminder: no List-Unsubscribe header to opt out of a payment record.
    expect(m.headers).toBeUndefined()
  })

  it('reads plainly: no em dashes, one exclamation point at most', async () => {
    state.setEvent(OPEN_EVENT)
    await sendMemberTicketReceipt(args)
    const m = sent()!
    expect(m.subject + m.text).not.toMatch(/—/)
    expect((m.text.match(/!/g) ?? []).length).toBeLessThanOrEqual(1)
  })

  it('names the tier only when there is one', async () => {
    state.setEvent(OPEN_EVENT)
    await sendMemberTicketReceipt({ ...args, ticketTypeId: null, qty: 1 })
    expect(sent()!.text).toContain('Ticket: 1 ticket, $40')
    expect(sent()!.text).not.toContain('(General)')
  })
})

describe('THE ADDRESS RULE: a hidden venue is never in a receipt, member or not (ADR-825 / ADR-854)', () => {
  it('prints the city line, drops both calendar links, and says where the address is', async () => {
    state.setEvent({ ...OPEN_EVENT, hide_address: true })
    await sendMemberTicketReceipt(args)

    const m = sent()!
    expect(m.text).toContain('Where: Vista, California')
    expect(m.text).toContain('The exact address is on the event page for ticket holders.')
    expect(m.html).toContain('The exact address is on the event page for ticket holders.')
    // No calendar file: the .ics carries the address in its LOCATION field, and the Google URL
    // carries it in the query string.
    expect(m.text).not.toContain('Add to your calendar')
    expect(m.html).not.toContain('Add to your calendar')
    expect(m.text).not.toContain('event.ics')
    expect(m.html).not.toContain('calendar.google.com')
    // The whole payload, so a future field cannot smuggle it back in.
    expect(JSON.stringify(m)).not.toContain('Royal Rd')
  })

  it('says nothing about the address when the event is open', async () => {
    state.setEvent(OPEN_EVENT)
    await sendMemberTicketReceipt(args)
    expect(sent()!.text).not.toContain('The exact address is on the event page')
  })
})

describe('the gate', () => {
  it('asks the send gate as TRANSACTIONAL, with the account address, so a muted events category cannot silence a receipt', async () => {
    state.setEvent(OPEN_EVENT)
    await sendMemberTicketReceipt(args)
    expect(gate.resolveSendGate).toHaveBeenCalledWith('p-1', 'email', 'transactional', { email: 'ada@example.com' })
  })

  it('sends nothing when the gate refuses (a suppressed address), and says so', async () => {
    state.setEvent(OPEN_EVENT)
    gate.resolveSendGate.mockResolvedValueOnce({ allowed: false, reason: 'suppressed' })
    await sendMemberTicketReceipt(args)
    expect(outbox.enqueue).not.toHaveBeenCalled()
    expect(console.warn).toHaveBeenCalled()
  })

  it('still sends the receipt for a cancelled event (they paid; the refund path owns the notice)', async () => {
    state.setEvent({ ...OPEN_EVENT, is_cancelled: true })
    await sendMemberTicketReceipt(args)
    expect(outbox.enqueue).toHaveBeenCalledTimes(1)
  })
})

describe('it never throws into the webhook', () => {
  it('logs and resolves when the event cannot be found', async () => {
    state.setEvent(null)
    await expect(sendMemberTicketReceipt(args)).resolves.toBeUndefined()
    expect(outbox.enqueue).not.toHaveBeenCalled()
    expect(console.error).toHaveBeenCalled()
  })

  it('logs and resolves when the buyer has no auth user or no account email', async () => {
    state.setEvent(OPEN_EVENT)
    state.setProfile({ display_name: 'Ada', auth_user_id: null })
    await expect(sendMemberTicketReceipt(args)).resolves.toBeUndefined()
    expect(outbox.enqueue).not.toHaveBeenCalled()

    state.setProfile({ display_name: 'Ada', auth_user_id: 'u-1' })
    state.setEmail(null)
    await expect(sendMemberTicketReceipt(args)).resolves.toBeUndefined()
    expect(outbox.enqueue).not.toHaveBeenCalled()
    expect(console.error).toHaveBeenCalledTimes(2)
  })

  it('logs and resolves when the read throws', async () => {
    state.setThrowOnRead(true)
    await expect(sendMemberTicketReceipt(args)).resolves.toBeUndefined()
    expect(console.error).toHaveBeenCalled()
  })

  it('logs and resolves when the outbox itself throws', async () => {
    state.setEvent(OPEN_EVENT)
    outbox.enqueue.mockRejectedValueOnce(new Error('outbox down') as never)
    await expect(sendMemberTicketReceipt(args)).resolves.toBeUndefined()
    expect(console.error).toHaveBeenCalled()
  })
})
