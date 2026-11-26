import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// BOOK-008 and BOOK-014: booking mail that keeps the booker's calendar right and names what was booked.
//   1. The invite is a REQUEST with an ORGANIZER, the booker as ATTENDEE, a SEQUENCE, and the UID of the
//      first booking of a reschedule chain, so a move updates one event instead of adding a second.
//   2. A cancellation attaches a METHOD:CANCEL file with the same UID and a higher SEQUENCE, and names the
//      service, even when its caller passed neither the booking nor the service.
//   3. A booking made inside 24 hours gets no instant reminder: one an hour out when there is room, else none.
//   4. The reminder names the service, and a guest's opens their manage page.

type Row = Record<string, unknown>
const tables: Record<string, Row[]> = {}
function builder(table: string) {
  const filters: Record<string, unknown> = {}
  const api = {
    select: () => api,
    eq(col: string, val: unknown) {
      filters[col] = val
      return api
    },
    order: () => api,
    limit: () => api,
    async maybeSingle() {
      const rows = (tables[table] ?? []).filter((r) => Object.entries(filters).every(([k, v]) => r[k] === v))
      return { data: rows[0] ?? null, error: null }
    },
  }
  return api
}
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (t: string) => builder(t),
    auth: { admin: { getUserById: async () => ({ data: { user: { email: 'member@example.test' } } }) } },
  }),
}))

const jobs: { kind: string; payload: Record<string, unknown>; opts?: { runAfter?: Date } }[] = []
vi.mock('@/lib/queue/outbox', () => ({
  enqueue: async (kind: string, payload: Record<string, unknown>, opts?: { runAfter?: Date }) => {
    jobs.push({ kind, payload, opts })
  },
  enqueueMany: async () => undefined,
}))
vi.mock('@/lib/suppression', () => ({ isSuppressed: async () => false }))
const routed: unknown[] = []
vi.mock('@/lib/notifications/router', () => ({
  routeNotification: async (_t: string, _to: unknown, body: unknown) => {
    routed.push(body)
    return { sent: true }
  },
}))
vi.mock('@/lib/sites/site-booking', () => ({
  siteBookUrl: async () => 'https://river.test/book',
  siteManageBookingUrl: async (_s: unknown, t: string) => `https://river.test/manage-booking?token=${t}`,
}))

import {
  buildBookingIcs,
  notifyBookingCancelled,
  notifyBookingConfirmed,
  runBookingReminder,
  scheduleBookingReminder,
} from './booking-notify'

const emails = () => jobs.filter((j) => j.kind === 'email').map((j) => j.payload as { to: string; subject: string; html: string; attachments?: { filename: string; content: string }[] })
const icsOf = (m: { attachments?: { content: string }[] }) => Buffer.from(m.attachments?.[0]?.content ?? '', 'base64').toString('utf-8')

beforeEach(() => {
  for (const k of Object.keys(tables)) delete tables[k]
  jobs.length = 0
  routed.length = 0
  tables.space_availability_schedules = [{ space_id: 'space-1', active: true, timezone: 'UTC' }]
  tables.profiles = [{ id: 'member-1', display_name: 'Ana', auth_user_id: 'auth-1' }]
  tables.space_service_types = [{ id: 'svc-1', name: 'Deep tissue' }]
})
afterEach(() => vi.useRealTimers())

describe('buildBookingIcs', () => {
  const base = {
    uid: 'root-1',
    sequence: 2,
    startsAt: '2030-01-01T10:00:00.000Z',
    endsAt: '2030-01-01T11:00:00.000Z',
    summary: 'Deep tissue',
    url: 'https://river.test/manage-booking?token=abc',
    organizerName: 'River "Yoga"; North',
    attendee: { name: 'Ana', email: 'ana@example.test' },
  }

  it('is an invite with an organizer, the booker, a sequence and a stable UID', () => {
    const ics = buildBookingIcs({ ...base, method: 'REQUEST' })
    expect(ics).toContain('METHOD:REQUEST')
    expect(ics).toContain('UID:root-1@frequency')
    expect(ics).toContain('SEQUENCE:2')
    expect(ics).toMatch(/ORGANIZER;CN="River Yoga; North":mailto:\S+@\S+/)
    expect(ics).toContain('ATTENDEE;CN="Ana"')
    expect(ics.replace(/\r\n /g, '')).toContain('mailto:ana@example.test')
    expect(ics).toContain('STATUS:CONFIRMED')
    expect(ics).not.toContain('LOCATION')
    expect(ics).not.toContain('METHOD:PUBLISH')
  })

  it('names a place only when there is one', () => {
    expect(buildBookingIcs({ ...base, method: 'REQUEST', location: '12 Main St, Suite 4' })).toContain('LOCATION:12 Main St\\, Suite 4')
    expect(buildBookingIcs({ ...base, method: 'REQUEST', location: '   ' })).not.toContain('LOCATION')
  })

  it('cancels with the same UID', () => {
    const ics = buildBookingIcs({ ...base, method: 'CANCEL', sequence: 3 })
    expect(ics).toContain('METHOD:CANCEL')
    expect(ics).toContain('UID:root-1@frequency')
    expect(ics).toContain('SEQUENCE:3')
    expect(ics).toContain('STATUS:CANCELLED')
  })

  it('folds long lines at 75 octets', () => {
    const ics = buildBookingIcs({ ...base, method: 'REQUEST', summary: 'A very long session name '.repeat(8) })
    for (const line of ics.split('\r\n')) expect(Buffer.byteLength(line, 'utf-8')).toBeLessThanOrEqual(75)
    expect(ics.replace(/\r\n /g, '')).toContain(`SUMMARY:${'A very long session name '.repeat(8)}`)
  })
})

describe('notifyBookingConfirmed', () => {
  it('keeps the first booking of a reschedule chain as the UID and counts the moves', async () => {
    tables.space_bookings = [
      { id: 'b1', rescheduled_from: null },
      { id: 'b2', rescheduled_from: 'b1' },
      { id: 'b3', rescheduled_from: 'b2' },
    ]
    await notifyBookingConfirmed({
      bookingId: 'b3',
      spaceId: 'space-1',
      spaceSlug: 'river',
      spaceName: 'River Yoga',
      ownerProfileId: null,
      memberProfileId: 'member-1',
      memberName: null,
      startsAt: '2030-01-01T10:00:00.000Z',
      endsAt: '2030-01-01T11:00:00.000Z',
      serviceName: 'Deep tissue',
    })
    const [mail] = emails()
    expect(mail.attachments).toHaveLength(1)
    const ics = icsOf(mail)
    expect(ics).toContain('UID:b1@frequency')
    expect(ics).toContain('SEQUENCE:2')
    expect(ics).toContain('METHOD:REQUEST')
  })
})

describe('notifyBookingCancelled', () => {
  it('attaches a calendar CANCEL and names the service, even when the caller passed neither', async () => {
    tables.space_bookings = [
      { id: 'b1', rescheduled_from: null },
      {
        id: 'b2',
        rescheduled_from: 'b1',
        space_id: 'space-1',
        starts_at: '2030-01-01T10:00:00.000Z',
        ends_at: '2030-01-01T11:00:00.000Z',
        status: 'cancelled',
        member_profile_id: 'member-1',
        service_type_id: 'svc-1',
      },
    ]
    await notifyBookingCancelled(
      {
        spaceId: 'space-1',
        spaceSlug: 'river',
        spaceName: 'River Yoga',
        ownerProfileId: null,
        memberProfileId: 'member-1',
        memberName: null,
        startsAt: '2030-01-01T10:00:00.000Z',
        serviceName: null,
      },
      null,
    )
    const [mail] = emails()
    expect(mail.subject).toBe('Cancelled: Deep tissue')
    expect(mail.attachments?.[0]?.filename).toBe('booking.ics')
    const ics = icsOf(mail)
    expect(ics).toContain('METHOD:CANCEL')
    expect(ics).toContain('UID:b1@frequency')
    expect(ics).toContain('SEQUENCE:2')
  })

  it('still sends the notice, without a file, when the booking cannot be found', async () => {
    tables.space_bookings = []
    await notifyBookingCancelled(
      {
        spaceId: 'space-1',
        spaceSlug: 'river',
        spaceName: 'River Yoga',
        ownerProfileId: null,
        memberProfileId: 'member-1',
        memberName: null,
        startsAt: '2030-01-01T10:00:00.000Z',
        serviceName: null,
      },
      null,
    )
    const [mail] = emails()
    expect(mail.subject).toBe('Cancelled: River Yoga')
    expect(mail.attachments).toBeUndefined()
  })
})

describe('scheduleBookingReminder', () => {
  const NOW = new Date('2030-01-01T00:00:00.000Z')
  const at = (hours: number) => new Date(NOW.getTime() + hours * 3600000).toISOString()
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })

  it('reminds 24 hours out when there is room', async () => {
    await scheduleBookingReminder('b1', at(72))
    expect(jobs).toHaveLength(1)
    expect(jobs[0].opts?.runAfter?.toISOString()).toBe(at(48))
  })

  it('reminds an hour out, not now, for a booking made inside 24 hours', async () => {
    await scheduleBookingReminder('b1', at(5))
    expect(jobs).toHaveLength(1)
    expect(jobs[0].opts?.runAfter?.toISOString()).toBe(at(4))
  })

  it('sends no reminder when the hour mark is too close', async () => {
    await scheduleBookingReminder('b1', at(1.25))
    expect(jobs).toHaveLength(0)
  })
})

describe('runBookingReminder', () => {
  beforeEach(() => {
    tables.spaces = [{ id: 'space-1', name: 'River Yoga', brand_name: null, slug: 'river', domain: null }]
  })

  it("names the service and opens a guest's manage page", async () => {
    tables.space_bookings = [
      {
        id: 'b1',
        space_id: 'space-1',
        member_profile_id: null,
        guest_name: 'Ana',
        guest_email: 'ana@example.test',
        guest_confirm_token: 'tok_1',
        service_type_id: 'svc-1',
        starts_at: '2099-01-01T10:00:00.000Z',
        ends_at: '2099-01-01T11:00:00.000Z',
        status: 'confirmed',
      },
    ]
    await runBookingReminder({ bookingId: 'b1' })
    const [mail] = emails()
    expect(mail.subject).toBe('Reminder: Deep tissue')
    expect(mail.html).toContain('https://river.test/manage-booking?token=tok_1')
  })

  it('names the service for a member too', async () => {
    tables.space_bookings = [
      {
        id: 'b1',
        space_id: 'space-1',
        member_profile_id: 'member-1',
        service_type_id: 'svc-1',
        starts_at: '2099-01-01T10:00:00.000Z',
        ends_at: '2099-01-01T11:00:00.000Z',
        status: 'confirmed',
      },
    ]
    await runBookingReminder({ bookingId: 'b1' })
    expect(routed).toHaveLength(1)
    expect((routed[0] as { email: { subject: string } }).email.subject).toBe('Reminder: Deep tissue')
  })
})

describe('where the session happens (BOOK-010)', () => {
  beforeEach(() => {
    tables.spaces = [{ id: 'space-1', name: 'River Yoga', brand_name: null, slug: 'river', domain: null }]
    tables.space_service_types = [
      { id: 'svc-1', name: 'Deep tissue', location_kind: 'in_person', location_value: '12 Main St, Encinitas' },
      { id: 'svc-2', name: 'Intro call', location_kind: 'video', location_value: 'https://meet.example.com/abc' },
    ]
  })

  it('puts the address in the confirmation and the invite LOCATION', async () => {
    tables.space_bookings = [{ id: 'b1', rescheduled_from: null, service_type_id: 'svc-1' }]
    await notifyBookingConfirmed({
      bookingId: 'b1',
      spaceId: 'space-1',
      spaceSlug: 'river',
      spaceName: 'River Yoga',
      ownerProfileId: null,
      memberProfileId: 'member-1',
      memberName: null,
      startsAt: '2030-01-01T10:00:00.000Z',
      endsAt: '2030-01-01T11:00:00.000Z',
      serviceName: 'Deep tissue',
    })
    const [mail] = emails()
    expect(mail.html).toContain('In person:')
    expect(mail.html).toContain('12 Main St, Encinitas')
    expect(icsOf(mail)).toContain('LOCATION:12 Main St\\, Encinitas')
  })

  it('puts the meeting link in the reminder', async () => {
    tables.space_bookings = [
      {
        id: 'b2',
        space_id: 'space-1',
        member_profile_id: 'member-1',
        service_type_id: 'svc-2',
        starts_at: '2099-01-01T10:00:00.000Z',
        ends_at: '2099-01-01T11:00:00.000Z',
        status: 'confirmed',
      },
    ]
    await runBookingReminder({ bookingId: 'b2' })
    const body = routed[0] as { email: { html: string; text: string } }
    expect(body.email.text).toContain('Video call: https://meet.example.com/abc')
    expect(body.email.html).toContain('href="https://meet.example.com/abc"')
  })

  it('says nothing about a place when the service names none', async () => {
    tables.space_service_types = [{ id: 'svc-1', name: 'Deep tissue' }]
    tables.space_bookings = [{ id: 'b1', rescheduled_from: null, service_type_id: 'svc-1' }]
    await notifyBookingConfirmed({
      bookingId: 'b1',
      spaceId: 'space-1',
      spaceSlug: 'river',
      spaceName: 'River Yoga',
      ownerProfileId: null,
      memberProfileId: 'member-1',
      memberName: null,
      startsAt: '2030-01-01T10:00:00.000Z',
      endsAt: '2030-01-01T11:00:00.000Z',
      serviceName: 'Deep tissue',
    })
    const [mail] = emails()
    expect(mail.html).not.toContain('In person:')
    expect(icsOf(mail)).not.toContain('LOCATION:')
  })
})

describe("the booker's own time zone (BOOK-009)", () => {
  beforeEach(() => {
    tables.spaces = [{ id: 'space-1', name: 'River Yoga', brand_name: null, slug: 'river', domain: null }]
    tables.profiles = [
      { id: 'member-1', display_name: 'Ana', auth_user_id: 'auth-1' },
      { id: 'owner-1', display_name: 'Rio', auth_user_id: 'auth-2' },
    ]
  })

  it("shows the booker their zone and keeps the Space's for the owner", async () => {
    tables.space_bookings = [{ id: 'b1', rescheduled_from: null, booker_time_zone: 'America/New_York' }]
    await notifyBookingConfirmed({
      bookingId: 'b1',
      spaceId: 'space-1',
      spaceSlug: 'river',
      spaceName: 'River Yoga',
      ownerProfileId: 'owner-1',
      memberProfileId: 'member-1',
      memberName: null,
      startsAt: '2030-01-01T10:00:00.000Z',
      endsAt: '2030-01-01T11:00:00.000Z',
      serviceName: 'Deep tissue',
    })
    const [booker, owner] = emails()
    expect(booker.html).toContain('5:00 AM EST')
    expect(booker.html).not.toContain('10:00 AM UTC')
    expect(owner.html).toContain('10:00 AM UTC')
  })

  it('falls back to the Space zone when the booker gave none', async () => {
    tables.space_bookings = [{ id: 'b1', rescheduled_from: null }]
    await notifyBookingConfirmed({
      bookingId: 'b1',
      spaceId: 'space-1',
      spaceSlug: 'river',
      spaceName: 'River Yoga',
      ownerProfileId: null,
      memberProfileId: 'member-1',
      memberName: null,
      startsAt: '2030-01-01T10:00:00.000Z',
      endsAt: '2030-01-01T11:00:00.000Z',
      serviceName: 'Deep tissue',
    })
    expect(emails()[0].html).toContain('10:00 AM UTC')
  })

  it("times the reminder in the booker's zone", async () => {
    tables.space_bookings = [
      {
        id: 'b1',
        space_id: 'space-1',
        member_profile_id: null,
        guest_name: 'Ana',
        guest_email: 'ana@example.test',
        guest_confirm_token: 'tok_1',
        service_type_id: 'svc-1',
        starts_at: '2099-01-01T10:00:00.000Z',
        ends_at: '2099-01-01T11:00:00.000Z',
        status: 'confirmed',
        booker_time_zone: 'America/New_York',
      },
    ]
    await runBookingReminder({ bookingId: 'b1' })
    expect(emails()[0].html).toContain('5:00 AM EST')
  })
})
