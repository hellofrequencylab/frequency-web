import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─────────────────────────────────────────────────────────────────────────────
// "A spot opened up and you're in." (scan2 L5-02)
//
// Every waitlist receipt promises "if a spot opens up we'll move you in automatically and let you
// know". promoteFromWaitlist did the moving; nobody did the telling. These tests pin the notifier
// on FAKES, measuring what went out (and through which gate), never the row it wrote:
//   * a member seat sends ONCE through resolveSendGate('email', 'events') with NO subject, ONCE
//     through the push sender, and writes one bell row;
//   * a guest seat emails ONCE through the guest confirmation sender and never touches the gate;
//   * the gate saying no sends no email;
//   * an unknown event sends nothing on any channel;
//   * a seat that no longer reads 'going' sends nothing (the read-back is real);
//   * it never throws.
// ─────────────────────────────────────────────────────────────────────────────

type Row = Record<string, unknown> | null

let eventRow: Row = null
let rsvpRow: Row = null
let profileRow: Row = { display_name: 'Ada', auth_user_id: 'auth-1' }
let userEmail: string | null = 'ada@example.com'
let gateAllowed = true
let circleRow: Row = null

const gateCalls: Array<{ profileId: string; channel: string; category: string; options: Record<string, unknown> }> = []
const emailsEnqueued: Array<Record<string, unknown>> = []
const guestEmails: Array<Record<string, unknown>> = []
const pushes: Array<{ profileId: string; payload: Record<string, unknown>; category: string; options: unknown }> = []
const bellInserts: Array<Record<string, unknown>> = []

function table(name: string) {
  const b: Record<string, unknown> = {}
  Object.assign(b, {
    select: () => b,
    eq: () => b,
    maybeSingle: () =>
      Promise.resolve({
        data:
          name === 'events' ? eventRow
          : name === 'event_rsvps' ? rsvpRow
          : name === 'profiles' ? profileRow
          : name === 'circles' ? circleRow
          : null,
        error: null,
      }),
    insert: (row: Record<string, unknown>) => {
      if (name === 'notifications') bellInserts.push(row)
      return Promise.resolve({ error: null })
    },
  })
  return b
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    from: table,
    auth: {
      admin: {
        getUserById: async () => ({ data: { user: userEmail ? { email: userEmail } : null } }),
      },
    },
  })),
}))

vi.mock('@/lib/comms/send-gate', () => ({
  resolveSendGate: async (profileId: string, channel: string, category: string, options: Record<string, unknown> = {}) => {
    gateCalls.push({ profileId, channel, category, options })
    return gateAllowed ? { allowed: true, reason: 'ok' } : { allowed: false, reason: 'pref_off' }
  },
}))

vi.mock('@/lib/email', () => ({
  enqueueEmail: async (payload: Record<string, unknown>) => { emailsEnqueued.push(payload) },
  listUnsubscribeHeaders: (url: string) => ({ 'List-Unsubscribe': `<${url}>` }),
  sendGuestRsvpConfirmationEmail: async (params: Record<string, unknown>) => { guestEmails.push(params) },
}))

vi.mock('@/lib/unsubscribe-tokens', () => ({
  buildUnsubscribeUrl: ({ profileId, category }: { profileId: string; category: string }) =>
    `https://unsub.test/${profileId}/${category}`,
}))

vi.mock('@/lib/push', () => ({
  sendPushToProfile: async (profileId: string, payload: Record<string, unknown>, category: string, options?: unknown) => {
    pushes.push({ profileId, payload, category, options })
    return 1
  },
}))

// next/link + lucide-react live in this module; the builder itself is a pure URL function.
vi.mock('@/components/events/add-to-calendar', () => ({
  buildGoogleCalendarUrl: () => 'https://calendar.google.test/render',
}))

import { notifyPromotedSeat, PROMOTED_SEAT_LINE, PROMOTED_SEAT_NOTIFICATION_TYPE } from './waitlist-notify'

const EVENT_ID = '11111111-1111-1111-1111-111111111111'

function openEvent(overrides: Record<string, unknown> = {}): Row {
  return {
    title: 'Sunrise Paddle', slug: 'sunrise-paddle', starts_at: '2026-09-12T15:00:00Z', ends_at: null,
    location: 'Alki Beach, Seattle', description: null, is_cancelled: false, time_zone: 'America/Los_Angeles',
    hide_address: false, venue_name: null, street: null, city: 'Seattle', region: 'WA',
    scope_id: null, scope_type: 'public', host: { display_name: 'Sam' },
    ...overrides,
  }
}

beforeEach(() => {
  eventRow = openEvent()
  rsvpRow = { status: 'going', approval_status: 'none', profile_id: 'p-1', guest_email: null, guest_name: null }
  profileRow = { display_name: 'Ada', auth_user_id: 'auth-1' }
  userEmail = 'ada@example.com'
  gateAllowed = true
  circleRow = null
  gateCalls.length = 0
  emailsEnqueued.length = 0
  guestEmails.length = 0
  pushes.length = 0
  bellInserts.length = 0
})

describe('notifyPromotedSeat: a member seat', () => {
  it('sends the email ONCE through the events email gate, with no subject (RSVP lifecycle is not subject-muted)', async () => {
    await notifyPromotedSeat({ rsvpId: 'r-1', profileId: 'p-1', guestEmail: null }, EVENT_ID)

    const emailGate = gateCalls.filter((c) => c.channel === 'email')
    expect(emailGate).toHaveLength(1)
    expect(emailGate[0]).toMatchObject({ profileId: 'p-1', category: 'events' })
    // Address first, so suppression can see it; NO subject, so a Circle mute cannot swallow it.
    expect(emailGate[0].options.email).toBe('ada@example.com')
    expect(emailGate[0].options.subject).toBeUndefined()

    expect(emailsEnqueued).toHaveLength(1)
    const mail = emailsEnqueued[0]
    expect(mail.to).toBe('ada@example.com')
    expect(String(mail.subject)).toContain(PROMOTED_SEAT_LINE)
    expect(String(mail.subject)).toContain('Sunrise Paddle')
    expect(String(mail.text)).toContain('https://frequencylocal.com/events/sunrise-paddle')
    expect(String(mail.html)).toContain('/events/sunrise-paddle')
    // Same outbox plumbing as the RSVP confirmation: an events-category unsubscribe header.
    expect((mail.headers as Record<string, string>)['List-Unsubscribe']).toContain('/p-1/events')
    // The guest sender is never used for a member.
    expect(guestEmails).toHaveLength(0)
  })

  it('pushes once through the events category with the event link, and no subject', async () => {
    await notifyPromotedSeat({ rsvpId: 'r-1', profileId: 'p-1', guestEmail: null }, EVENT_ID)
    expect(pushes).toHaveLength(1)
    expect(pushes[0]).toMatchObject({ profileId: 'p-1', category: 'events' })
    expect(pushes[0].payload).toMatchObject({ body: PROMOTED_SEAT_LINE, url: 'https://frequencylocal.com/events/sunrise-paddle' })
    expect(pushes[0].options).toBeUndefined()
  })

  it('writes one bell row referencing the event', async () => {
    await notifyPromotedSeat({ rsvpId: 'r-1', profileId: 'p-1', guestEmail: null }, EVENT_ID)
    expect(bellInserts).toHaveLength(1)
    expect(bellInserts[0]).toMatchObject({
      recipient_id: 'p-1',
      type: PROMOTED_SEAT_NOTIFICATION_TYPE,
      reference_type: 'event',
      reference_id: EVENT_ID,
    })
    expect(String(bellInserts[0].body)).toContain(PROMOTED_SEAT_LINE)
    expect(String(bellInserts[0].body)).toContain('Sunrise Paddle')
  })

  it('the copy carries no em dash anywhere it goes out', async () => {
    await notifyPromotedSeat({ rsvpId: 'r-1', profileId: 'p-1', guestEmail: null }, EVENT_ID)
    const everything = [
      String(emailsEnqueued[0].subject), String(emailsEnqueued[0].text), String(emailsEnqueued[0].html),
      String(pushes[0].payload.body), String(bellInserts[0].body),
    ].join('\n')
    expect(everything).not.toMatch(/[—–]/)
  })

  it('gate says no: no email is enqueued (the bell row and the push gate are unaffected)', async () => {
    gateAllowed = false
    await notifyPromotedSeat({ rsvpId: 'r-1', profileId: 'p-1', guestEmail: null }, EVENT_ID)
    expect(gateCalls.filter((c) => c.channel === 'email')).toHaveLength(1)
    expect(emailsEnqueued).toHaveLength(0)
    expect(guestEmails).toHaveLength(0)
  })

  it('a member with no deliverable address gets no email and no gate read', async () => {
    userEmail = null
    await notifyPromotedSeat({ rsvpId: 'r-1', profileId: 'p-1', guestEmail: null }, EVENT_ID)
    expect(gateCalls).toHaveLength(0)
    expect(emailsEnqueued).toHaveLength(0)
  })
})

describe('notifyPromotedSeat: a guest seat', () => {
  beforeEach(() => {
    rsvpRow = { status: 'going', approval_status: 'none', profile_id: null, guest_email: 'guest@example.com', guest_name: 'Gus' }
  })

  it('emails ONCE through the guest confirmation sender as a going seat, and never reads the member gate', async () => {
    await notifyPromotedSeat({ rsvpId: 'r-2', profileId: null, guestEmail: 'guest@example.com' }, EVENT_ID)
    expect(guestEmails).toHaveLength(1)
    expect(guestEmails[0]).toMatchObject({
      to: 'guest@example.com',
      guestName: 'Gus',
      eventTitle: 'Sunrise Paddle',
      status: 'going',
      eventUrl: 'https://frequencylocal.com/events/sunrise-paddle',
    })
    // A guest has no profile: no preference gate, no member email, no push, no bell.
    expect(gateCalls).toHaveLength(0)
    expect(emailsEnqueued).toHaveLength(0)
    expect(pushes).toHaveLength(0)
    expect(bellInserts).toHaveLength(0)
  })

  it('hands an open-address event the full location and both calendar links', async () => {
    await notifyPromotedSeat({ rsvpId: 'r-2', profileId: null, guestEmail: 'guest@example.com' }, EVENT_ID)
    expect(guestEmails[0].location).toBe('Alki Beach, Seattle')
    expect(guestEmails[0].icsUrl).toBe('https://frequencylocal.com/events/sunrise-paddle/event.ics')
    expect(guestEmails[0].googleCalUrl).toBe('https://calendar.google.test/render')
  })

  it('mirrors the address gate: a hidden-address event sends the city line and no calendar links', async () => {
    eventRow = openEvent({ hide_address: true })
    await notifyPromotedSeat({ rsvpId: 'r-2', profileId: null, guestEmail: 'guest@example.com' }, EVENT_ID)
    expect(guestEmails).toHaveLength(1)
    expect(guestEmails[0].location).toBe('Seattle, WA')
    expect(guestEmails[0].icsUrl).toBeNull()
    expect(guestEmails[0].googleCalUrl).toBeNull()
  })
})

describe('notifyPromotedSeat: nothing to say', () => {
  it('unknown event: nothing is sent on any channel', async () => {
    eventRow = null
    await notifyPromotedSeat({ rsvpId: 'r-1', profileId: 'p-1', guestEmail: null }, EVENT_ID)
    expect(gateCalls).toHaveLength(0)
    expect(emailsEnqueued).toHaveLength(0)
    expect(guestEmails).toHaveLength(0)
    expect(pushes).toHaveLength(0)
    expect(bellInserts).toHaveLength(0)
  })

  it('cancelled event: nothing is sent', async () => {
    eventRow = openEvent({ is_cancelled: true })
    await notifyPromotedSeat({ rsvpId: 'r-1', profileId: 'p-1', guestEmail: null }, EVENT_ID)
    expect(emailsEnqueued.length + guestEmails.length + pushes.length + bellInserts.length).toBe(0)
  })

  it('the seat is read back: a row that no longer says going sends nothing', async () => {
    rsvpRow = { status: 'waitlist', approval_status: 'none', profile_id: 'p-1', guest_email: null, guest_name: null }
    await notifyPromotedSeat({ rsvpId: 'r-1', profileId: 'p-1', guestEmail: null }, EVENT_ID)
    expect(emailsEnqueued.length + guestEmails.length + pushes.length + bellInserts.length).toBe(0)
  })

  it('a still-pending row sends nothing (promotion never says yes for the host)', async () => {
    rsvpRow = { status: 'going', approval_status: 'pending', profile_id: 'p-1', guest_email: null, guest_name: null }
    await notifyPromotedSeat({ rsvpId: 'r-1', profileId: 'p-1', guestEmail: null }, EVENT_ID)
    expect(emailsEnqueued.length + guestEmails.length + pushes.length + bellInserts.length).toBe(0)
  })

  it('never throws into the RSVP path, even when every read explodes', async () => {
    const boom = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { createAdminClient } = await import('@/lib/supabase/admin')
    const spy = vi.mocked(createAdminClient).mockImplementationOnce(() => { throw new Error('db down') })
    await expect(
      notifyPromotedSeat({ rsvpId: 'r-1', profileId: 'p-1', guestEmail: null }, EVENT_ID),
    ).resolves.toBeUndefined()
    expect(boom).toHaveBeenCalled()
    spy.mockRestore()
    boom.mockRestore()
  })
})
