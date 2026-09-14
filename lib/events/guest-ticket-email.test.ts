import { describe, it, expect, vi, beforeEach } from 'vitest'

// THE GUEST TICKET EMAIL (lib/events/guest-ticket-email.ts).
//
// Two properties, and both of them are about what this module refuses to do.
//
//   1. IT NEVER THROWS. It is called from the Stripe webhook's settle, after the ticket is already
//      `succeeded`. A throw there turns a finished payment into a 500, Stripe redelivers, and the
//      redelivery can only no-op. So a missing event, a dead database and a failing mailer all end
//      the same way: logged, and resolved void.
//   2. IT WITHHOLDS THE ADDRESS ON A hide_address EVENT. A guest ticket holder is ticketed in the
//      row and NOT PROVEN as a person. Stripe collected the address, it did not prove it, so this
//      reader gets what every other unproven reader gets (ADR-825/ADR-854): the city line.
//
// The claim link is asserted in shape because it is the ENTIRE account offer: a magic link at
// /sign-in, prefilled with the address, so that the TAP is what proves ownership. A future edit
// that turns it into a one-click signup would hand an account to whoever finished a checkout form.

const state = vi.hoisted(() => {
  let event: unknown = null
  let throwOnRead = false
  return {
    setEvent(e: unknown) {
      event = e
    },
    setThrowOnRead(v: boolean) {
      throwOnRead = v
    },
    read(table: string) {
      if (throwOnRead) throw new Error('postgrest unreachable')
      if (table === 'circles') return { data: { name: 'Ocean Beach' }, error: null }
      return { data: event, error: null }
    },
    reset() {
      event = null
      throwOnRead = false
    },
  }
})

const mailer = vi.hoisted(() => ({
  sendGuestTicketEmail: vi.fn(async (_params: Record<string, unknown>) => {}),
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
  }),
}))
vi.mock('@/lib/email', () => mailer)

import { sendGuestTicketReceipt, formatTicketAmount } from './guest-ticket-email'

const OPEN_EVENT = {
  title: 'Sunrise Sit',
  slug: 'sunrise-sit',
  starts_at: '2026-10-01T15:00:00Z',
  is_cancelled: false,
  time_zone: 'America/Los_Angeles',
  hide_address: false,
  location: '3598 Royal Rd, Vista, California',
  venue_name: null,
  street: null,
  city: 'Vista',
  region: 'California',
  scope_id: null,
  scope_type: null,
  host: { display_name: 'Ada' },
}

const args = { eventId: 'ev1', guestEmail: 'jo@example.com', qty: 2, amountCents: 4000, currency: 'usd' }
const sent = () => mailer.sendGuestTicketEmail.mock.calls[0]?.[0] as Record<string, unknown> | undefined

beforeEach(() => {
  state.reset()
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('what the guest is told', () => {
  it('sends the full address when the event does not hide it', async () => {
    state.setEvent(OPEN_EVENT)
    await sendGuestTicketReceipt(args)

    expect(mailer.sendGuestTicketEmail).toHaveBeenCalledTimes(1)
    expect(sent()).toMatchObject({
      to: 'jo@example.com',
      eventTitle: 'Sunrise Sit',
      location: '3598 Royal Rd, Vista, California',
      qty: 2,
      amountLabel: '$40',
      hostName: 'Ada',
    })
  })

  it('WITHHOLDS the address and sends the city line when hide_address is set', async () => {
    state.setEvent({ ...OPEN_EVENT, hide_address: true })
    await sendGuestTicketReceipt(args)

    expect(sent()?.location).toBe('Vista, California')
    expect(JSON.stringify(sent())).not.toContain('Royal Rd')
  })

  it('offers exactly one account link, and it is a magic link prefilled with the address', async () => {
    state.setEvent(OPEN_EVENT)
    await sendGuestTicketReceipt(args)

    const claimUrl = String(sent()?.claimUrl)
    expect(claimUrl).toContain('/sign-in?')
    expect(claimUrl).toContain(`next=${encodeURIComponent('/events/sunrise-sit')}`)
    expect(claimUrl).toContain(`email=${encodeURIComponent('jo@example.com')}`)
    // Not a signup form, not a session-derived account, not a token in a URL.
    expect(claimUrl).not.toContain('/sign-up')
    expect(claimUrl).not.toContain('token')
  })

  it('still sends the receipt for a cancelled event (they paid; the refund path owns the notice)', async () => {
    state.setEvent({ ...OPEN_EVENT, is_cancelled: true })
    await sendGuestTicketReceipt(args)
    expect(mailer.sendGuestTicketEmail).toHaveBeenCalledTimes(1)
  })
})

describe('it never throws into the webhook', () => {
  it('logs and resolves when the event cannot be found', async () => {
    state.setEvent(null)
    await expect(sendGuestTicketReceipt(args)).resolves.toBeUndefined()
    expect(mailer.sendGuestTicketEmail).not.toHaveBeenCalled()
    expect(console.error).toHaveBeenCalled()
  })

  it('logs and resolves when the read throws', async () => {
    state.setThrowOnRead(true)
    await expect(sendGuestTicketReceipt(args)).resolves.toBeUndefined()
    expect(console.error).toHaveBeenCalled()
  })

  it('logs and resolves when the mailer itself throws', async () => {
    state.setEvent(OPEN_EVENT)
    mailer.sendGuestTicketEmail.mockRejectedValueOnce(new Error('resend down') as never)
    await expect(sendGuestTicketReceipt(args)).resolves.toBeUndefined()
    expect(console.error).toHaveBeenCalled()
  })
})

describe('formatTicketAmount', () => {
  it('drops the cents on a whole amount and keeps them otherwise', () => {
    expect(formatTicketAmount(4000, 'usd')).toBe('$40')
    expect(formatTicketAmount(4050, 'usd')).toBe('$40.50')
  })

  it('prints nothing rather than a wrong number when the amount is unknown', () => {
    expect(formatTicketAmount(null, 'usd')).toBeNull()
    expect(formatTicketAmount(0, 'usd')).toBeNull()
  })
})
