import { describe, it, expect, vi, beforeEach } from 'vitest'

// BOOK-007: a website guest cancels or moves their own booking with the secret in their email. What is locked
// here (the booking core, the admin client, the Space read and the mail layer are mocked):
//   1. A secret names one guest booking on one Space: a member's booking, another Space, or a junk token read
//      as "that link did not work", and nothing is written.
//   2. Cancel stamps the row, mails the cancellation notice (with the booking id, so it carries a calendar
//      CANCEL), and a second press writes and mails nothing.
//   3. The Space's minimum notice refuses both actions, as it does for members.
//   4. A move acquires the new time FIRST through validateAndPlaceBooking (linked by rescheduled_from), then
//      cancels the old row, clears its secret, and hands the secret to the new booking.

type Row = Record<string, unknown> & { id: string }
const db = { bookings: [] as Row[], updates: [] as { patch: Record<string, unknown>; filters: Record<string, unknown> }[] }
let minNotice = 0

function bookingsBuilder() {
  const filters: Record<string, unknown> = {}
  let patch: Record<string, unknown> | null = null
  const api = {
    select: () => api,
    eq(col: string, val: unknown) {
      filters[col] = val
      return api
    },
    update(p: Record<string, unknown>) {
      patch = p
      return api
    },
    async maybeSingle() {
      const match = db.bookings.filter((r) => Object.entries(filters).every(([k, v]) => r[k] === v))
      if (patch) {
        db.updates.push({ patch, filters: { ...filters } })
        for (const r of match) Object.assign(r, patch)
      }
      return { data: match[0] ?? null, error: null }
    },
  }
  return api
}
function servicesBuilder() {
  const api = {
    select: () => api,
    eq: () => api,
    update: () => api,
    maybeSingle: async () => ({ data: { name: 'Deep tissue' }, error: null }),
  }
  return api
}
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (t: string) => (t === 'space_bookings' ? bookingsBuilder() : servicesBuilder()),
  }),
}))

const space = { id: 'space-1', slug: 'river', name: 'River Yoga', brandName: null, ownerProfileId: 'owner-1', domain: null }
vi.mock('@/lib/spaces/store', () => ({ getSpaceById: async (id: string) => (id === space.id ? space : null) }))

const placeSpy = vi.fn()
const afterSpy = vi.fn(async () => undefined)
vi.mock('@/lib/spaces/booking', () => ({
  validateAndPlaceBooking: (p: unknown) => placeSpy(p),
  afterBookingPlaced: (...a: unknown[]) => (afterSpy as (...x: unknown[]) => Promise<void>)(...a),
  bookerFromRow: (r: { member_profile_id: string | null; guest_name?: string; guest_email?: string }) =>
    r.member_profile_id ? { profileId: r.member_profile_id } : r.guest_name && r.guest_email ? { guestName: r.guest_name, guestEmail: r.guest_email } : null,
  getPublicSpaceBookingTimezone: async () => 'UTC',
  listPublicOpenSlots: async () => [
    { startsAt: '2030-01-02T10:00:00.000Z', slotMinutes: 60 },
    { startsAt: '2030-01-03T10:00:00.000Z', slotMinutes: 60 },
  ],
  parseAnswers: () => [],
  readSchedule: async () => ({ minNoticeMinutes: minNotice }),
  withinModifyWindow: (startsAt: string, mins: number) => new Date(startsAt).getTime() - Date.now() >= mins * 60000,
}))

const cancelNoticeSpy = vi.fn(async (_ctx: unknown, _reason: unknown) => undefined)
vi.mock('@/lib/spaces/booking-notify', () => ({ notifyBookingCancelled: cancelNoticeSpy }))
vi.mock('@/lib/sites/site-booking', () => ({
  siteBookUrl: async () => 'https://river.test/book',
  siteManageBookingUrl: async (_s: unknown, t: string) => `https://river.test/manage-booking?token=${t}`,
}))

import {
  cancelGuestBookingByToken,
  cleanManageToken,
  guestManageUrlForBooking,
  listGuestRescheduleSlots,
  readGuestManagedBooking,
  rescheduleGuestBookingByToken,
} from './booking-guest-manage'

const TOKEN = 'abcDEF123_-abcDEF123_-abcDEF123_'
function guestRow(over: Partial<Row> = {}): Row {
  return {
    id: 'b1',
    space_id: 'space-1',
    member_profile_id: null,
    guest_name: 'Ana',
    guest_email: 'ana@example.test',
    starts_at: '2030-01-01T10:00:00.000Z',
    ends_at: '2030-01-01T11:00:00.000Z',
    status: 'confirmed',
    note: null,
    answers: null,
    service_type_id: 'svc-1',
    guest_confirm_token: TOKEN,
    ...over,
  }
}

beforeEach(() => {
  db.bookings = []
  db.updates = []
  minNotice = 0
  placeSpy.mockReset()
  afterSpy.mockClear()
  cancelNoticeSpy.mockClear()
})

describe('the guest secret', () => {
  it('accepts only the shape the mint produces', () => {
    expect(cleanManageToken(` ${TOKEN} `)).toBe(TOKEN)
    expect(cleanManageToken('')).toBeNull()
    expect(cleanManageToken('has space')).toBeNull()
    expect(cleanManageToken('x'.repeat(65))).toBeNull()
    expect(cleanManageToken(42)).toBeNull()
  })

  it('reads a guest booking on its own Space only', async () => {
    db.bookings = [guestRow()]
    const view = await readGuestManagedBooking(TOKEN, 'space-1')
    expect(view).toMatchObject({ ok: true, state: 'upcoming', canModify: true, serviceName: 'Deep tissue', spaceName: 'River Yoga' })
    expect(JSON.stringify(view)).not.toContain(TOKEN)
    expect(await readGuestManagedBooking(TOKEN, 'space-2')).toEqual({ ok: false })
    expect(await readGuestManagedBooking('nope', 'space-1')).toEqual({ ok: false })
  })

  it("never opens a member's booking", async () => {
    db.bookings = [guestRow({ member_profile_id: 'member-1', guest_name: null, guest_email: null })]
    expect(await readGuestManagedBooking(TOKEN, 'space-1')).toEqual({ ok: false })
    expect('error' in (await cancelGuestBookingByToken(TOKEN, 'space-1'))).toBe(true)
    expect(db.updates).toHaveLength(0)
  })

  it('builds the manage link from the booking secret, and none without one', async () => {
    db.bookings = [guestRow(), guestRow({ id: 'b2', guest_confirm_token: null })]
    expect(await guestManageUrlForBooking(space, 'b1')).toBe(`https://river.test/manage-booking?token=${TOKEN}`)
    expect(await guestManageUrlForBooking(space, 'b2')).toBeNull()
  })
})

describe('cancel', () => {
  it('cancels, stamps the reason, and sends the notice once', async () => {
    db.bookings = [guestRow()]
    const res = await cancelGuestBookingByToken(TOKEN, 'space-1', '  Sick today ')
    expect(res).toEqual({ data: undefined })
    expect(db.bookings[0]).toMatchObject({ status: 'cancelled', cancel_reason: 'Sick today' })
    expect(typeof db.bookings[0].cancelled_at).toBe('string')
    expect(cancelNoticeSpy).toHaveBeenCalledTimes(1)
    const [ctx, reason] = cancelNoticeSpy.mock.calls[0]
    expect(reason).toBe('Sick today')
    expect(ctx).toMatchObject({ bookingId: 'b1', serviceName: 'Deep tissue', memberProfileId: null, guest: { email: 'ana@example.test' } })

    const again = await cancelGuestBookingByToken(TOKEN, 'space-1')
    expect(again).toEqual({ data: undefined })
    expect(cancelNoticeSpy).toHaveBeenCalledTimes(1)
  })

  it('refuses inside the minimum notice, like a member', async () => {
    minNotice = 60 * 24 * 365 * 10
    db.bookings = [guestRow()]
    const res = await cancelGuestBookingByToken(TOKEN, 'space-1')
    expect(res).toMatchObject({ error: expect.stringContaining('too close') })
    expect(db.bookings[0].status).toBe('confirmed')
    expect(cancelNoticeSpy).not.toHaveBeenCalled()
  })

  it('refuses a token from another Space', async () => {
    db.bookings = [guestRow()]
    expect('error' in (await cancelGuestBookingByToken(TOKEN, 'space-2'))).toBe(true)
    expect(db.bookings[0].status).toBe('confirmed')
  })
})

describe('reschedule', () => {
  it('acquires the new time first, then moves the secret to it', async () => {
    db.bookings = [guestRow()]
    placeSpy.mockImplementation(async () => {
      db.bookings.push(guestRow({ id: 'b2', starts_at: '2030-01-02T10:00:00.000Z', guest_confirm_token: null, rescheduled_from: 'b1' }))
      return { ok: true, bookingId: 'b2', booker: { guestName: 'Ana', guestEmail: 'ana@example.test' }, startsAt: '2030-01-02T10:00:00.000Z', endsAt: '2030-01-02T11:00:00.000Z', serviceName: 'Deep tissue' }
    })
    const res = await rescheduleGuestBookingByToken(TOKEN, 'space-1', '2030-01-02T10:00:00.000Z')
    expect(res).toEqual({ data: { startsAt: '2030-01-02T10:00:00.000Z' } })
    expect(placeSpy).toHaveBeenCalledWith(
      expect.objectContaining({ rescheduledFrom: 'b1', serviceTypeId: 'svc-1', booker: { guestName: 'Ana', guestEmail: 'ana@example.test' } }),
    )
    const [old, moved] = db.bookings
    expect(old).toMatchObject({ status: 'cancelled', guest_confirm_token: null })
    expect(moved).toMatchObject({ status: 'confirmed', guest_confirm_token: TOKEN })
    // The old secret was cleared before the new booking took it (the token is unique).
    const clearAt = db.updates.findIndex((u) => u.patch.guest_confirm_token === null)
    const takeAt = db.updates.findIndex((u) => u.patch.guest_confirm_token === TOKEN)
    expect(clearAt).toBeGreaterThanOrEqual(0)
    expect(takeAt).toBeGreaterThan(clearAt)
    expect(afterSpy).toHaveBeenCalledTimes(1)
  })

  it('leaves the booking alone when the new time is taken', async () => {
    db.bookings = [guestRow()]
    placeSpy.mockResolvedValue({ ok: false, error: 'That time was just taken. Pick another.' })
    const res = await rescheduleGuestBookingByToken(TOKEN, 'space-1', '2030-01-02T10:00:00.000Z')
    expect(res).toEqual({ error: 'That time was just taken. Pick another.' })
    expect(db.bookings[0]).toMatchObject({ status: 'confirmed', guest_confirm_token: TOKEN })
    expect(db.updates).toHaveLength(0)
  })

  it('refuses inside the minimum notice and never places', async () => {
    minNotice = 60 * 24 * 365 * 10
    db.bookings = [guestRow()]
    const res = await rescheduleGuestBookingByToken(TOKEN, 'space-1', '2030-01-02T10:00:00.000Z')
    expect(res).toMatchObject({ error: expect.stringContaining('too close') })
    expect(placeSpy).not.toHaveBeenCalled()
  })

  it('offers the same service times minus the current one', async () => {
    db.bookings = [guestRow({ starts_at: '2030-01-02T10:00:00.000Z' })]
    const slots = await listGuestRescheduleSlots(TOKEN, 'space-1')
    expect(slots.map((s) => s.startsAt)).toEqual(['2030-01-03T10:00:00.000Z'])
    expect(await listGuestRescheduleSlots(TOKEN, 'space-2')).toEqual([])
  })
})
