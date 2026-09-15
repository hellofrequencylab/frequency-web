import { describe, it, expect, beforeEach, vi } from 'vitest'

// THE HOST FINDS OUT THEY SOLD SOMETHING (lib/billing/ticket-sale-notify.ts, LIVE-345).
//
// Before this module there was no ticket-sold notification of any kind anywhere in the product: no
// email, no bell, no notification type. The buyer got a receipt, the ledger got a row, `sold` moved,
// and the person whose event it is and whose money it is was told nothing at all. The first sale on
// this platform is imminent and the seller is a real person waiting to learn whether selling here
// works, so "technically green and reads as broken" is the exact failure to avoid.
//
// What this file locks:
//   1. ONE bell and ONE email per sale, the same shape lib/billing/tips-notify.ts already has for a
//      tip recipient. The email goes to the host's PROVEN account address, on the TRANSACTIONAL
//      gate (money that landed in your account is a record, not a nudge).
//   2. WHO GETS TOLD IS WHO GETS PAID. A Space-hosted event notifies the Space OWNER, not
//      events.host_id -- the same payee resolution createTicketCheckout uses (ADR-819).
//   3. A GUEST buyer has no name and no profile read: the sentence carries itself and the bell
//      carries no actor.
//   4. The OVERAGE from LIVE-343's settle-time re-check rides on this notice with its numbers,
//      because the host is the only party who can act on it.
//   5. Nothing here ever throws. The money has moved and the ticket is already succeeded.
//   6. The words pass docs/CONTENT-VOICE.md and docs/NAMING.md: no em dashes, "payout account"
//      rather than "Stripe Connect", and the fee that was actually charged is named.

const m = vi.hoisted(() => ({
  notificationsInsert: vi.fn(async (_row: Record<string, unknown>) => ({ error: null })),
  enqueueEmail: vi.fn(async (_p: Record<string, unknown>) => {}),
  gateAllowed: true,
  accountEmail: 'host@example.com' as string | null,
  events: new Map<string, Record<string, unknown> | null>(),
  eventError: null as null | { message: string },
  spaces: new Map<string, { owner_profile_id: string | null }>(),
  profiles: new Map<string, { display_name: string | null }>(),
  tiers: new Map<string, { name: string | null }>(),
  reads: [] as string[],
}))

vi.mock('@/lib/email', () => ({ enqueueEmail: (p: Record<string, unknown>) => m.enqueueEmail(p) }))
vi.mock('@/lib/comms/send-gate', () => ({
  resolveSendGate: async () => ({ allowed: m.gateAllowed, reason: m.gateAllowed ? 'ok' : 'suppressed' }),
}))
vi.mock('@/lib/profiles/account-email', () => ({ profileAccountEmail: async () => m.accountEmail }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      m.reads.push(table)
      if (table === 'notifications') return { insert: (row: Record<string, unknown>) => m.notificationsInsert(row) }
      const lookup = (id: string): { data: unknown; error: unknown } => {
        if (table === 'events') return { data: m.events.get(id) ?? null, error: m.eventError }
        if (table === 'spaces') return { data: m.spaces.get(id) ?? null, error: null }
        if (table === 'profiles') return { data: m.profiles.get(id) ?? null, error: null }
        if (table === 'event_ticket_types') return { data: m.tiers.get(id) ?? null, error: null }
        throw new Error(`unexpected table ${table}`)
      }
      return { select: () => ({ eq: (_c: string, id: string) => ({ maybeSingle: async () => lookup(id) }) }) }
    },
  }),
}))

import {
  notifyTicketSaleHost,
  ticketCountLabel,
  overageLine,
  saleSentence,
  payoutSentence,
  ANONYMOUS_BUYER,
  TICKET_SALE_NOTIFICATION_TYPE,
} from './ticket-sale-notify'

const SALE = {
  id: 'tkt-1',
  event_id: 'ev-1',
  ticket_type_id: 'tier-1',
  qty: 2,
  amount_cents: 4000,
  platform_fee_cents: 400,
  currency: 'usd',
  buyer_profile_id: 'buyer-1',
  guest_email: null,
  over_capacity: false,
  tier_quantity: null,
  tier_committed: null,
}

const bell = () => m.notificationsInsert.mock.calls[0][0] as Record<string, unknown>
const mail = () => m.enqueueEmail.mock.calls[0][0] as { to: string; subject: string; html: string; text: string }

beforeEach(() => {
  vi.clearAllMocks()
  m.gateAllowed = true
  m.accountEmail = 'host@example.com'
  m.eventError = null
  m.reads.length = 0
  m.events.clear()
  m.spaces.clear()
  m.profiles.clear()
  m.tiers.clear()
  m.events.set('ev-1', { title: 'Sunrise Session', slug: 'sunrise-session', host_id: 'host-1', host_space_id: null })
  m.profiles.set('host-1', { display_name: 'Rae' })
  m.profiles.set('buyer-1', { display_name: 'Dana' })
  m.tiers.set('tier-1', { name: 'General' })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

// ── The pure pieces, so the WORDS are testable without a database ──────────────────────────────

describe('the sentences', () => {
  it('counts plainly, with the number the host actually wants', () => {
    expect(ticketCountLabel(1)).toBe('a ticket')
    expect(ticketCountLabel(3)).toBe('3 tickets')
    // A nonsense qty must never render "NaN tickets" into somebody's inbox.
    expect(ticketCountLabel(0)).toBe('a ticket')
    expect(ticketCountLabel(Number.NaN)).toBe('a ticket')
  })

  it('names the sale, the tier and the amount in one plain sentence', () => {
    expect(
      saleSentence({ buyerName: 'Dana', countLabel: '2 tickets', eventTitle: 'Sunrise Session', tierName: 'General', grossLabel: '$40' }),
    ).toBe('Dana bought 2 tickets to Sunrise Session (General) for $40.')
  })

  it('drops the tier and the amount rather than printing a hole', () => {
    expect(
      saleSentence({ buyerName: ANONYMOUS_BUYER, countLabel: 'a ticket', eventTitle: 'Sunrise Session', tierName: null, grossLabel: null }),
    ).toBe('A guest bought a ticket to Sunrise Session.')
  })

  it('says what happened to the money in the canon words', () => {
    const charged = payoutSentence({ feeLabel: '$4', feeIsZero: false })
    expect(charged).toContain("Frequency's fee on this sale was $4")
    expect(charged).toContain('payout account')
    // NAMING.md "Money in": member and operator copy says payout account. Stripe Connect is the
    // internal noun and never appears in something a person reads.
    expect(charged).not.toMatch(/Stripe|Connect/)
    // The 0% promise is kept in words on a sale the host sourced themselves (ADR-811).
    expect(payoutSentence({ feeLabel: '$0', feeIsZero: true })).toContain('Frequency took nothing on this sale')
  })

  it('states the overage with both numbers and something to do about it', () => {
    expect(overageLine({ over_capacity: false, tier_quantity: 12, tier_committed: 11, qty: 2 })).toBeNull()
    const line = overageLine({ over_capacity: true, tier_quantity: 12, tier_committed: 11, qty: 2 })
    // 11 already sold plus these 2 is 13 against a limit of 12. "You are over" with no count is
    // not something anyone can act on.
    expect(line).toBe('This tier is now past its limit: 13 sold against 12. You can refund a ticket or make room for one more.')
  })

  it('still says something useful when the re-check reported no numbers', () => {
    const line = overageLine({ over_capacity: true, tier_quantity: null, tier_committed: null, qty: 1 })
    expect(line).toContain('past its limit')
    expect(line).not.toContain('null')
  })

  it('writes no em dashes anywhere in the copy (CONTENT-VOICE 5e)', () => {
    const all = [
      saleSentence({ buyerName: 'Dana', countLabel: '2 tickets', eventTitle: 'Sunrise Session', tierName: 'General', grossLabel: '$40' }),
      payoutSentence({ feeLabel: '$4', feeIsZero: false }),
      payoutSentence({ feeLabel: '$0', feeIsZero: true }),
      overageLine({ over_capacity: true, tier_quantity: 12, tier_committed: 11, qty: 2 }) ?? '',
    ].join(' ')
    expect(all).not.toMatch(/[—–]/)
  })
})

// ── The two channels ───────────────────────────────────────────────────────────────────────────

describe('a member bought a ticket to a personal event', () => {
  it('rings the host bell once, with the buyer as the actor and the event as the reference', async () => {
    await notifyTicketSaleHost(SALE)

    expect(m.notificationsInsert).toHaveBeenCalledTimes(1)
    expect(bell()).toEqual({
      recipient_id: 'host-1',
      actor_id: 'buyer-1',
      type: TICKET_SALE_NOTIFICATION_TYPE,
      reference_type: 'event',
      reference_id: 'ev-1',
      // The bell renders the actor's name in front of `body`, so this reads
      // "Dana bought 2 tickets to Sunrise Session".
      body: 'bought 2 tickets to Sunrise Session',
    })
  })

  it('emails the host once at their account address, with the sale, the fee and the event link', async () => {
    await notifyTicketSaleHost(SALE)

    expect(m.enqueueEmail).toHaveBeenCalledTimes(1)
    expect(mail().to).toBe('host@example.com')
    expect(mail().subject).toBe('You sold 2 tickets to Sunrise Session')
    expect(mail().text).toContain('Hi Rae,')
    expect(mail().text).toContain('Dana bought 2 tickets to Sunrise Session (General) for $40.')
    expect(mail().text).toContain("Frequency's fee on this sale was $4")
    expect(mail().text).toContain('/events/sunrise-session')
    // Both renderings are built from the same sentences, so they cannot drift apart.
    expect(mail().html).toContain('Dana bought 2 tickets to Sunrise Session (General) for $40.')
  })

  it('sends the bell and no email when the gate refuses the address', async () => {
    m.gateAllowed = false
    await notifyTicketSaleHost(SALE)
    expect(m.notificationsInsert).toHaveBeenCalledTimes(1)
    expect(m.enqueueEmail).not.toHaveBeenCalled()
  })

  it('keeps the bell and says so when the host has no account email', async () => {
    m.accountEmail = null
    await notifyTicketSaleHost(SALE)
    expect(m.notificationsInsert).toHaveBeenCalledTimes(1)
    expect(m.enqueueEmail).not.toHaveBeenCalled()
    expect(String((console.error as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0])).toContain('no account email')
  })
})

describe('a GUEST bought the ticket', () => {
  it('carries the whole sentence in the bell body and names no actor', async () => {
    await notifyTicketSaleHost({ ...SALE, buyer_profile_id: null, guest_email: 'jo@example.com' })
    expect(bell()).toMatchObject({
      actor_id: null,
      body: 'A guest bought 2 tickets to Sunrise Session',
    })
  })

  it('looks up no buyer profile: there is none, and issuing the read would imply there might be', async () => {
    await notifyTicketSaleHost({ ...SALE, buyer_profile_id: null, guest_email: 'jo@example.com' })
    // One `profiles` read remains: the HOST's own display name for the greeting.
    expect(m.reads.filter((t) => t === 'profiles')).toHaveLength(1)
  })

  it('never prints the guest address: a bell is not where somebody else email belongs', async () => {
    await notifyTicketSaleHost({ ...SALE, buyer_profile_id: null, guest_email: 'jo@example.com' })
    expect(JSON.stringify(bell())).not.toContain('jo@example.com')
    expect(mail().text).not.toContain('jo@example.com')
  })
})

describe('who gets told is who gets paid (ADR-819)', () => {
  it('notifies the hosting Space OWNER rather than events.host_id', async () => {
    m.events.set('ev-1', { title: 'Sunrise Session', slug: 'sunrise-session', host_id: 'organiser-9', host_space_id: 'sp-1' })
    m.spaces.set('sp-1', { owner_profile_id: 'space-owner-1' })
    m.profiles.set('space-owner-1', { display_name: 'Royal Temple' })

    await notifyTicketSaleHost(SALE)

    // events.host_id on a Space-hosted event can be an organiser who never sees the money. The
    // notice follows the payee, exactly as createTicketCheckout does.
    expect(bell()).toMatchObject({ recipient_id: 'space-owner-1' })
  })

  it('says so loudly when there is no host to tell, and sends nothing', async () => {
    m.events.set('ev-1', { title: 'Sunrise Session', slug: 'sunrise-session', host_id: null, host_space_id: null })
    await notifyTicketSaleHost(SALE)
    expect(m.notificationsInsert).not.toHaveBeenCalled()
    expect(m.enqueueEmail).not.toHaveBeenCalled()
    expect(String((console.error as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0])).toContain('no host to tell')
  })
})

describe('the overage from the settle-time re-check (LIVE-343)', () => {
  it('rides on the same notice, in both renderings, with the numbers', async () => {
    await notifyTicketSaleHost({ ...SALE, over_capacity: true, tier_quantity: 12, tier_committed: 11 })
    expect(mail().text).toContain('This tier is now past its limit: 13 sold against 12.')
    expect(mail().html).toContain('This tier is now past its limit: 13 sold against 12.')
  })

  it('is absent on an ordinary sale', async () => {
    await notifyTicketSaleHost(SALE)
    expect(mail().text).not.toContain('past its limit')
    expect(mail().html).not.toContain('past its limit')
  })
})

describe('it never costs a settled sale', () => {
  it('returns quietly and logs when the event cannot be read', async () => {
    m.eventError = { message: 'connection reset' }
    await expect(notifyTicketSaleHost(SALE)).resolves.toBeUndefined()
    expect(m.notificationsInsert).not.toHaveBeenCalled()
    expect(console.error).toHaveBeenCalled()
  })

  it('returns quietly and logs when the event is gone', async () => {
    m.events.set('ev-1', null)
    await expect(notifyTicketSaleHost(SALE)).resolves.toBeUndefined()
    expect(String((console.error as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0])).toContain('event not found')
  })

  it('still rings the bell when the email throws on its way out', async () => {
    m.enqueueEmail.mockRejectedValueOnce(new Error('outbox down'))
    await expect(notifyTicketSaleHost(SALE)).resolves.toBeUndefined()
    expect(m.notificationsInsert).toHaveBeenCalledTimes(1)
    expect(console.error).toHaveBeenCalled()
  })

  it('still emails when the bell insert fails', async () => {
    m.notificationsInsert.mockResolvedValueOnce({ error: { message: 'insert refused' } as never })
    await notifyTicketSaleHost(SALE)
    expect(m.enqueueEmail).toHaveBeenCalledTimes(1)
  })
})
