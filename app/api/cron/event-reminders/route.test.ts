import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { NextRequest } from 'next/server'

// Meta-scan L6-17 (2026-09-05): the RSVP reminder cron sent the push, the email and the SMS and only
// THEN stamped reminder_*_sent_at, with no claim. A crash between the send and the stamp, or two
// overlapping 15-minute runs on a large event, re-sent the same reminder. The stamp is now taken
// FIRST as a conditional claim (`update ... set col = now() where id = ? and col is null` returning
// the row), so of two runs racing on one RSVP exactly one sends. These tests pin that contract on a
// fake admin client whose event_rsvps update honours the `is null` predicate:
//   1. claimed once  -> sent once, and a second run over the same rows sends nothing;
//   2. claim returns no row (another run already holds it) -> nothing is sent;
//   3. a send that throws is logged at ERROR and the row STAYS claimed (at-most-once), so the next
//      run does not re-send it.
// Every collaborator is mocked; the only thing under test is the claim-then-send ordering.
//
// LIVE-320 (2026-09-14): the GUEST TICKET arm. A guest who bought a ticket has no RSVP row, so the
// cron reads event_tickets beside event_rsvps and claims the same-named stamp on the ticket row.
// The cases below pin: selection (succeeded, no buyer, an address, this touch unclaimed), the
// claim-then-send order on the ticket row, the receipt's footer identity on the message, the one
// gate a guest has (the suppression list, honoured by stamping and skipping), and the dedupe
// against an admitted guest RSVP under the same address.

type TicketRow = {
  id: string
  event_id: string
  buyer_profile_id: string | null
  guest_email: string | null
  status: string
  reminder_7d_sent_at: string | null
  reminder_24h_sent_at: string | null
  reminder_2h_sent_at: string | null
}

type RsvpRow = {
  id: string
  event_id: string
  profile_id: string | null
  guest_email: string | null
  guest_name: string | null
  status: string
  approval_status: string
  reminder_7d_sent_at: string | null
  reminder_24h_sent_at: string | null
  reminder_2h_sent_at: string | null
}

const state = vi.hoisted(() => ({
  events: [] as Record<string, unknown>[],
  rsvps: [] as RsvpRow[],
  tickets: [] as TicketRow[],
  profiles: [] as Record<string, unknown>[],
  /** Addresses the suppression list holds (lib/suppression isSuppressed). */
  suppressed: new Set<string>(),
  /** When set, every claim update resolves with zero rows (simulates another run holding the row). */
  claimReturnsNothing: false,
  /** When set, every claim update resolves `{ error }`. */
  claimErrors: false,
  claimAttempts: 0,
}))

const sends = vi.hoisted(() => ({
  memberEmail: [] as Record<string, unknown>[],
  guestEmail: [] as Record<string, unknown>[],
  push: [] as Record<string, unknown>[],
  sms: [] as Record<string, unknown>[],
  /** Which legs throw on this run. */
  throwOn: new Set<'memberEmail' | 'guestEmail' | 'push'>(),
}))

const logged = vi.hoisted(() => ({
  error: [] as { event: string; fields?: Record<string, unknown> }[],
  info: [] as { event: string; fields?: Record<string, unknown> }[],
}))

/**
 * A chainable, thenable query builder over the in-memory rows above. It records the operation and
 * the filters, then resolves on await (or on `.select()` after an update, which is how the claim
 * reads its row count back). Only the shapes the route actually uses are modelled.
 */
function builder(table: string) {
  const filters: { op: 'eq' | 'neq' | 'is' | 'not-is' | 'gte' | 'lt' | 'in'; col: string; val: unknown }[] = []
  let op: 'select' | 'update' | 'count' = 'select'
  let patch: Record<string, unknown> = {}

  const rows = (): Record<string, unknown>[] => {
    if (table === 'events') return state.events
    if (table === 'event_rsvps') return state.rsvps as unknown as Record<string, unknown>[]
    if (table === 'event_tickets') return state.tickets as unknown as Record<string, unknown>[]
    if (table === 'profiles') return state.profiles
    throw new Error(`unexpected table ${table}`)
  }
  const matches = (r: Record<string, unknown>) =>
    filters.every((f) => {
      const v = r[f.col]
      if (f.op === 'eq') return v === f.val
      if (f.op === 'neq') return v !== f.val
      if (f.op === 'is') return v === f.val
      if (f.op === 'not-is') return v !== f.val
      if (f.op === 'in') return (f.val as unknown[]).includes(v)
      if (f.op === 'gte') return String(v) >= String(f.val)
      if (f.op === 'lt') return String(v) < String(f.val)
      return true
    })

  const resolve = () => {
    if (op === 'update') {
      state.claimAttempts += 1
      if (state.claimErrors) return { data: null, error: { message: 'boom' } }
      if (state.claimReturnsNothing) return { data: [], error: null }
      const hit = rows().filter(matches)
      for (const r of hit) Object.assign(r, patch)
      return { data: hit.map((r) => ({ id: r.id })), error: null }
    }
    if (op === 'count') return { count: rows().filter(matches).length, error: null }
    return { data: rows().filter(matches), error: null }
  }

  const api = {
    select(_cols?: string, opts?: { count?: 'exact'; head?: boolean }) {
      if (opts?.head) op = 'count'
      return api
    },
    update(p: Record<string, unknown>) {
      op = 'update'
      patch = p
      return api
    },
    eq(col: string, val: unknown) { filters.push({ op: 'eq', col, val }); return api },
    neq(col: string, val: unknown) { filters.push({ op: 'neq', col, val }); return api },
    is(col: string, val: unknown) { filters.push({ op: 'is', col, val }); return api },
    /** Only the `.not(col, 'is', null)` shape the ticket read uses. */
    not(col: string, operator: string, val: unknown) {
      if (operator !== 'is') throw new Error(`unexpected not() operator ${operator}`)
      filters.push({ op: 'not-is', col, val })
      return api
    },
    gte(col: string, val: unknown) { filters.push({ op: 'gte', col, val }); return api },
    lt(col: string, val: unknown) { filters.push({ op: 'lt', col, val }); return api },
    in(col: string, val: unknown[]) { filters.push({ op: 'in', col, val }); return api },
    then(onOk: (v: unknown) => unknown, onErr?: (e: unknown) => unknown) {
      return Promise.resolve(resolve()).then(onOk, onErr)
    },
  }
  return api
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => builder(table),
    auth: {
      admin: {
        getUserById: async (id: string) => ({ data: { user: { id, email: `${id}@example.com` } } }),
      },
    },
  }),
}))

// The stored wall-clock IS the instant here (zone = UTC), so a fixture can place an event inside
// the 2h window by arithmetic alone.
vi.mock('@/lib/time/zone', () => ({
  eventInstant: (iso: string) => new Date(iso),
  resolveZone: () => 'UTC',
}))
vi.mock('@/lib/events/follower-reminders', () => ({
  formatAbsolute: () => 'Sat Jun 20 · 7:00 PM UTC',
}))
vi.mock('@/lib/email', () => ({
  sendEventReminderEmail: async (p: Record<string, unknown>) => {
    if (sends.throwOn.has('memberEmail')) throw new Error('smtp down')
    sends.memberEmail.push(p)
  },
  sendGuestEventReminderEmail: async (p: Record<string, unknown>) => {
    if (sends.throwOn.has('guestEmail')) throw new Error('smtp down')
    sends.guestEmail.push(p)
  },
  enqueueEmail: async () => {},
  listUnsubscribeHeaders: () => ({}),
}))
vi.mock('@/lib/unsubscribe-tokens', () => ({ buildUnsubscribeUrl: () => 'https://x/unsub' }))
vi.mock('@/lib/comms/send-gate', () => ({
  resolveSendGate: async () => ({ allowed: true }),
}))
vi.mock('@/lib/suppression', () => ({
  isSuppressed: async (email: string) => state.suppressed.has(email),
}))
vi.mock('@/lib/push', () => ({
  sendPushToProfile: async (profileId: string, payload: Record<string, unknown>) => {
    if (sends.throwOn.has('push')) throw new Error('push down')
    sends.push.push({ profileId, ...payload })
  },
}))
vi.mock('@/lib/comms/sms', () => ({
  sendSms: async (p: Record<string, unknown>) => {
    sends.sms.push(p)
    return { allowed: false }
  },
}))
vi.mock('@/lib/crm/interactions', () => ({ recordContactInteraction: async () => {} }))
vi.mock('@/lib/cron-auth', () => ({ rejectUnauthorizedCron: () => null }))
vi.mock('@/lib/observability/cron-heartbeat', () => ({
  withCronHeartbeat: (_name: string, handler: (req: NextRequest) => Promise<Response>) => handler,
}))
vi.mock('@/lib/log', () => ({
  log: {
    info: (event: string, fields?: Record<string, unknown>) => logged.info.push({ event, fields }),
    warn: () => {},
    error: (event: string, fields?: Record<string, unknown>) => logged.error.push({ event, fields }),
    time: async <T,>(_event: string, fn: () => T | Promise<T>) => fn(),
  },
}))

import { GET } from './route'

const req = new Request('http://localhost/api/cron/event-reminders') as unknown as NextRequest

const EVENT = 'event-1'
const MEMBER = 'profile-1'

function seedEventInTwoHourWindow(over: Record<string, unknown> = {}) {
  // 2h + 5min from now: inside the {2h, 2h + 30min} slack window, outside the 24h and 7d bands.
  seedEvent(new Date(Date.now() + 2 * 60 * 60 * 1000 + 5 * 60 * 1000).toISOString(), over)
}

function seedEventInDayWindow() {
  // 24h + 5min from now: inside the {24h, 24h + 30min} slack window, outside the 2h and 7d bands.
  seedEvent(new Date(Date.now() + 24 * 60 * 60 * 1000 + 5 * 60 * 1000).toISOString())
}

function seedEvent(startsAt: string, over: Record<string, unknown> = {}) {
  state.events.push({
    id: EVENT,
    title: 'Sunrise practice',
    starts_at: startsAt,
    location: 'The park',
    slug: 'sunrise-practice',
    is_cancelled: false,
    status: 'published',
    removed_at: null,
    time_zone: null,
    hide_address: false,
    ...over,
  })
}

function ticket(over: Partial<TicketRow> = {}): TicketRow {
  return {
    id: 'ticket-1',
    event_id: EVENT,
    buyer_profile_id: null,
    guest_email: 'buyer@example.com',
    status: 'succeeded',
    reminder_7d_sent_at: null,
    reminder_24h_sent_at: null,
    reminder_2h_sent_at: null,
    ...over,
  }
}

function rsvp(over: Partial<RsvpRow> = {}): RsvpRow {
  return {
    id: 'rsvp-1',
    event_id: EVENT,
    profile_id: MEMBER,
    guest_email: null,
    guest_name: null,
    status: 'going',
    approval_status: 'none',
    reminder_7d_sent_at: null,
    reminder_24h_sent_at: null,
    reminder_2h_sent_at: null,
    ...over,
  }
}

beforeEach(() => {
  state.events = []
  state.rsvps = []
  state.tickets = []
  state.suppressed = new Set()
  state.profiles = [{ id: MEMBER, display_name: 'Sam', auth_user_id: 'auth-1', home_timezone: null }]
  state.claimReturnsNothing = false
  state.claimErrors = false
  state.claimAttempts = 0
  sends.memberEmail = []
  sends.guestEmail = []
  sends.push = []
  sends.sms = []
  sends.throwOn = new Set()
  logged.error = []
  logged.info = []
})

describe('GET /api/cron/event-reminders, claim-then-send (L6-17)', () => {
  it('claims the row BEFORE sending, sends once, and a second run over the same rows sends nothing', async () => {
    seedEventInTwoHourWindow()
    state.rsvps.push(rsvp())

    const first = await GET(req)
    expect(first.status).toBe(200)
    expect((await first.json())['2h']).toEqual({ events: 1, sent: 1 })
    expect(sends.memberEmail).toHaveLength(1)
    expect(sends.push).toHaveLength(1)
    // The stamp landed on the row (the claim IS the stamp).
    expect(state.rsvps[0]!.reminder_2h_sent_at).not.toBeNull()
    expect(state.claimAttempts).toBe(1)

    // The next run: the `is null` filter on the read excludes the row, so nothing is re-sent.
    const second = await GET(req)
    expect((await second.json())['2h']).toEqual({ events: 1, sent: 0 })
    expect(sends.memberEmail).toHaveLength(1)
    expect(sends.push).toHaveLength(1)
    expect(logged.error).toHaveLength(0)
  })

  it('sends NOTHING when the claim returns no row (another run already holds it)', async () => {
    seedEventInTwoHourWindow()
    state.rsvps.push(rsvp())
    state.claimReturnsNothing = true

    const res = await GET(req)
    expect((await res.json())['2h']).toEqual({ events: 1, sent: 0 })
    expect(state.claimAttempts).toBe(1)
    expect(sends.memberEmail).toHaveLength(0)
    expect(sends.push).toHaveLength(0)
    expect(sends.sms).toHaveLength(0)
  })

  it('sends NOTHING when the claim itself errors, and logs it at ERROR', async () => {
    seedEventInTwoHourWindow()
    state.rsvps.push(rsvp())
    state.claimErrors = true

    const res = await GET(req)
    expect((await res.json())['2h']).toEqual({ events: 1, sent: 0 })
    expect(sends.memberEmail).toHaveLength(0)
    expect(sends.push).toHaveLength(0)
    expect(logged.error.map((l) => l.event)).toContain('cron.event_reminders.claim_failed')
  })

  it('a send that throws is logged at ERROR and the row STAYS claimed, so the next run does not re-send', async () => {
    seedEventInTwoHourWindow()
    state.rsvps.push(rsvp())
    sends.throwOn.add('memberEmail')

    const first = await GET(req)
    expect(first.status).toBe(200)
    // The push leg still ran (each leg is isolated), so the row counts as delivered.
    expect(sends.push).toHaveLength(1)
    expect(sends.memberEmail).toHaveLength(0)
    const failure = logged.error.find((l) => l.event === 'cron.event_reminders.send_failed')
    expect(failure).toBeDefined()
    expect(failure!.fields).toMatchObject({ leg: 'email', rsvpId: 'rsvp-1', lead: '2h', error: 'smtp down' })
    // At-most-once: the claim is not undone by the failure.
    expect(state.rsvps[0]!.reminder_2h_sent_at).not.toBeNull()

    sends.throwOn.clear()
    const second = await GET(req)
    expect((await second.json())['2h']).toEqual({ events: 1, sent: 0 })
    expect(sends.memberEmail).toHaveLength(0)
    expect(sends.push).toHaveLength(1)
  })

  it('the guest leg claims first too: one email per guest seat, and the row is stamped even with no address', async () => {
    seedEventInTwoHourWindow()
    state.rsvps.push(rsvp({ id: 'guest-1', profile_id: null, guest_email: 'guest@example.com', guest_name: 'Guest' }))
    state.rsvps.push(rsvp({ id: 'guest-2', profile_id: null, guest_email: null }))

    const first = await GET(req)
    expect((await first.json())['2h']).toEqual({ events: 1, sent: 1 })
    expect(sends.guestEmail).toHaveLength(1)
    expect(sends.guestEmail[0]).toMatchObject({ to: 'guest@example.com' })
    expect(state.rsvps.every((r) => r.reminder_2h_sent_at !== null)).toBe(true)

    const second = await GET(req)
    expect((await second.json())['2h']).toEqual({ events: 1, sent: 0 })
    expect(sends.guestEmail).toHaveLength(1)
  })

  it('a guest send that throws is logged at ERROR and not retried on the next run', async () => {
    seedEventInTwoHourWindow()
    state.rsvps.push(rsvp({ id: 'guest-1', profile_id: null, guest_email: 'guest@example.com' }))
    sends.throwOn.add('guestEmail')

    const first = await GET(req)
    expect((await first.json())['2h']).toEqual({ events: 1, sent: 0 })
    expect(logged.error.find((l) => l.event === 'cron.event_reminders.send_failed')?.fields).toMatchObject({
      leg: 'guest_email',
      rsvpId: 'guest-1',
    })

    sends.throwOn.clear()
    const second = await GET(req)
    expect((await second.json())['2h']).toEqual({ events: 1, sent: 0 })
    expect(sends.guestEmail).toHaveLength(0)
  })
})

describe('GET /api/cron/event-reminders, the guest TICKET arm (LIVE-320)', () => {
  it('reminds a guest ticket holder once, at the address on the ticket, with the receipt identity, and stamps the TICKET row', async () => {
    seedEventInTwoHourWindow()
    state.tickets.push(ticket())

    const first = await GET(req)
    expect(first.status).toBe(200)
    expect((await first.json())['2h']).toEqual({ events: 1, sent: 1 })
    expect(sends.guestEmail).toHaveLength(1)
    expect(sends.guestEmail[0]).toMatchObject({
      to: 'buyer@example.com',
      held: 'ticket',
      guestName: null,
      eventTitle: 'Sunrise practice',
      location: 'The park',
      whenLabel: 'in about 2 hours',
      eventUrl: expect.stringMatching(/\/events\/sunrise-practice$/),
    })
    // The one account offer, in the receipt's shape: a /sign-in magic link carrying the address.
    expect(String(sends.guestEmail[0]!.claimUrl)).toMatch(
      /\/sign-in\?next=%2Fevents%2Fsunrise-practice&email=buyer%40example\.com$/,
    )
    // Nothing that assumes a session, and no other leg for a guest.
    expect(sends.memberEmail).toHaveLength(0)
    expect(sends.push).toHaveLength(0)
    expect(sends.sms).toHaveLength(0)
    // The stamp landed on the TICKET row for THIS touch only (the claim IS the stamp).
    expect(state.tickets[0]!.reminder_2h_sent_at).not.toBeNull()
    expect(state.tickets[0]!.reminder_24h_sent_at).toBeNull()
    expect(state.tickets[0]!.reminder_7d_sent_at).toBeNull()
    expect(state.claimAttempts).toBe(1)

    // Idempotent on the stamp: the `is null` filter excludes the row next run.
    const second = await GET(req)
    expect((await second.json())['2h']).toEqual({ events: 1, sent: 0 })
    expect(sends.guestEmail).toHaveLength(1)
    expect(logged.error).toHaveLength(0)
  })

  it('selects by touch window: the 24h pass claims reminder_24h_sent_at and leaves the other stamps alone', async () => {
    seedEventInDayWindow()
    state.tickets.push(ticket())

    const res = await GET(req)
    const body = await res.json()
    expect(body['24h']).toEqual({ events: 1, sent: 1 })
    expect(body['2h']).toEqual({ events: 0, sent: 0 })
    expect(body['7d']).toEqual({ events: 0, sent: 0 })
    expect(sends.guestEmail[0]).toMatchObject({ to: 'buyer@example.com', held: 'ticket', whenLabel: 'tomorrow' })
    expect(state.tickets[0]!.reminder_24h_sent_at).not.toBeNull()
    expect(state.tickets[0]!.reminder_2h_sent_at).toBeNull()
    expect(state.tickets[0]!.reminder_7d_sent_at).toBeNull()
  })

  it('never reads a refunded, pending or failed ticket, a member ticket, or a row with no address: nothing sent, nothing stamped', async () => {
    seedEventInTwoHourWindow()
    state.tickets.push(ticket({ id: 'refunded', status: 'refunded' }))
    state.tickets.push(ticket({ id: 'pending', status: 'pending' }))
    state.tickets.push(ticket({ id: 'failed', status: 'failed' }))
    // A member's ticket: reminded through their RSVP row, never here.
    state.tickets.push(ticket({ id: 'member', buyer_profile_id: MEMBER, guest_email: null }))
    // A claimed guest ticket (the door fills the buyer in and leaves the address): a member row now.
    state.tickets.push(ticket({ id: 'claimed', buyer_profile_id: MEMBER, guest_email: 'buyer@example.com' }))
    // A deleted account: neither identity, nobody to tell.
    state.tickets.push(ticket({ id: 'deleted', buyer_profile_id: null, guest_email: null }))

    const res = await GET(req)
    expect((await res.json())['2h']).toEqual({ events: 1, sent: 0 })
    expect(sends.guestEmail).toHaveLength(0)
    expect(state.claimAttempts).toBe(0)
    expect(state.tickets.every((t) => t.reminder_2h_sent_at === null)).toBe(true)
  })

  it('honours the one gate a guest has: a suppressed address is claimed and NOT sent, so it is not re-read forever', async () => {
    seedEventInTwoHourWindow()
    state.tickets.push(ticket())
    state.suppressed.add('buyer@example.com')

    const first = await GET(req)
    expect((await first.json())['2h']).toEqual({ events: 1, sent: 0 })
    expect(sends.guestEmail).toHaveLength(0)
    expect(state.tickets[0]!.reminder_2h_sent_at).not.toBeNull()

    const second = await GET(req)
    expect((await second.json())['2h']).toEqual({ events: 1, sent: 0 })
    expect(state.claimAttempts).toBe(1)
  })

  it('claims BEFORE sending: a claim that returns no row sends nothing', async () => {
    seedEventInTwoHourWindow()
    state.tickets.push(ticket())
    state.claimReturnsNothing = true

    const res = await GET(req)
    expect((await res.json())['2h']).toEqual({ events: 1, sent: 0 })
    expect(state.claimAttempts).toBe(1)
    expect(sends.guestEmail).toHaveLength(0)
  })

  it('a ticket send that throws is logged at ERROR against the ticket and the row STAYS claimed', async () => {
    seedEventInTwoHourWindow()
    state.tickets.push(ticket())
    sends.throwOn.add('guestEmail')

    const first = await GET(req)
    expect((await first.json())['2h']).toEqual({ events: 1, sent: 0 })
    expect(logged.error.find((l) => l.event === 'cron.event_reminders.send_failed')?.fields).toMatchObject({
      leg: 'guest_ticket_email',
      rsvpId: 'ticket-1',
      lead: '2h',
    })
    expect(state.tickets[0]!.reminder_2h_sent_at).not.toBeNull()

    sends.throwOn.clear()
    const second = await GET(req)
    expect((await second.json())['2h']).toEqual({ events: 1, sent: 0 })
    expect(sends.guestEmail).toHaveLength(0)
  })

  it('an address holding an admitted guest RSVP AND a ticket is reminded once, through the RSVP leg; the ticket is stamped and not sent', async () => {
    seedEventInTwoHourWindow()
    state.rsvps.push(rsvp({ id: 'guest-1', profile_id: null, guest_email: 'Buyer@Example.com', guest_name: 'Sam' }))
    state.tickets.push(ticket({ guest_email: 'buyer@example.com' }))

    const res = await GET(req)
    expect((await res.json())['2h']).toEqual({ events: 1, sent: 1 })
    expect(sends.guestEmail).toHaveLength(1)
    expect(sends.guestEmail[0]).toMatchObject({ to: 'Buyer@Example.com' })
    expect(sends.guestEmail[0]!.held).toBeUndefined()
    expect(state.rsvps[0]!.reminder_2h_sent_at).not.toBeNull()
    expect(state.tickets[0]!.reminder_2h_sent_at).not.toBeNull()
  })

  it('a PENDING guest RSVP does not own the address: the ticket leg still reminds, because the ticket is an admission', async () => {
    seedEventInTwoHourWindow()
    state.rsvps.push(rsvp({ id: 'guest-1', profile_id: null, guest_email: 'buyer@example.com', approval_status: 'pending' }))
    state.tickets.push(ticket())

    const res = await GET(req)
    expect((await res.json())['2h']).toEqual({ events: 1, sent: 1 })
    expect(sends.guestEmail).toHaveLength(1)
    expect(sends.guestEmail[0]).toMatchObject({ to: 'buyer@example.com', held: 'ticket' })
    // The pending seat is never read by the RSVP leg (it is a request, not an admission).
    expect(state.rsvps[0]!.reminder_2h_sent_at).toBeNull()
  })

  it('one address holding two tickets on one event is told once; both rows are stamped', async () => {
    seedEventInTwoHourWindow()
    state.tickets.push(ticket({ id: 'ticket-1' }))
    state.tickets.push(ticket({ id: 'ticket-2', guest_email: 'BUYER@example.com ' }))

    const res = await GET(req)
    expect((await res.json())['2h']).toEqual({ events: 1, sent: 1 })
    expect(sends.guestEmail).toHaveLength(1)
    expect(state.tickets.every((t) => t.reminder_2h_sent_at !== null)).toBe(true)
  })

  it('withholds the venue on a hide_address event, exactly as the RSVP guest leg does', async () => {
    seedEventInTwoHourWindow({ hide_address: true })
    state.tickets.push(ticket())

    await GET(req)
    expect(sends.guestEmail).toHaveLength(1)
    expect(sends.guestEmail[0]!.location).toBeNull()
  })

  it('the member path is untouched: a member RSVP beside a guest ticket still gets email + push, and the guest gets email only', async () => {
    seedEventInTwoHourWindow()
    state.rsvps.push(rsvp())
    state.tickets.push(ticket())

    const res = await GET(req)
    expect((await res.json())['2h']).toEqual({ events: 1, sent: 2 })
    expect(sends.memberEmail).toHaveLength(1)
    expect(sends.push).toHaveLength(1)
    expect(sends.guestEmail).toHaveLength(1)
    expect(state.rsvps[0]!.reminder_2h_sent_at).not.toBeNull()
    expect(state.tickets[0]!.reminder_2h_sent_at).not.toBeNull()
  })
})
