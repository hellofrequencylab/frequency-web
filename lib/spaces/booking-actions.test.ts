import { beforeEach, describe, expect, it, vi } from 'vitest'

// THE ANONYMOUS BOOKING DOOR (LIVE-835, SCAN-834/858). Holds still, in the order the action runs:
// a honeypot answers like a success and writes nothing, a Space that is private or missing fails
// closed, the per-IP limit sits above the write, and only then does the core get the booking.

const m = vi.hoisted(() => ({
  space: { id: 'space-1' } as { id: string } | null,
  limitOk: true,
  ip: '203.0.113.9, 10.0.0.1' as string | null,
  createGuest: vi.fn(async (_input: unknown) => ({ ok: true as const })),
  confirmGuest: vi.fn(),
  listPublic: vi.fn(async () => [] as unknown[]),
  rateLimit: vi.fn(),
  visible: vi.fn(),
}))

vi.mock('next/headers', () => ({
  headers: async () => ({ get: (k: string) => (k === 'x-forwarded-for' ? m.ip : null) }),
}))
vi.mock('@/lib/spaces/store', () => ({
  getVisibleSpaceBySlug: (...a: unknown[]) => {
    m.visible(...a)
    return Promise.resolve(m.space)
  },
}))
vi.mock('@/lib/rate-limit', () => ({
  rateLimitOk: (...a: unknown[]) => {
    m.rateLimit(...a)
    return Promise.resolve(m.limitOk)
  },
}))
vi.mock('@/lib/spaces/booking', () => ({
  setSpaceAvailability: vi.fn(),
  setSpaceServiceTypes: vi.fn(),
  setSpaceSchedule: vi.fn(),
  listOpenSlots: vi.fn(),
  createBooking: vi.fn(),
  rescheduleBooking: vi.fn(),
  cancelBooking: vi.fn(),
  startServiceDeposit: vi.fn(),
  listPublicOpenSlots: m.listPublic,
  createGuestBooking: m.createGuest,
  confirmGuestBooking: m.confirmGuest,
  getPublicSpaceBookingTimezone: async () => 'America/Los_Angeles',
}))

import {
  confirmGuestBookingFormAction,
  createGuestBookingAction,
  listGuestOpenSlotsAction,
} from './booking-actions'

const input = {
  slug: 'blue-door',
  startsAtISO: '2026-11-02T18:00:00.000Z',
  name: 'Ada',
  email: 'ada@example.test',
}

beforeEach(() => {
  m.space = { id: 'space-1' }
  m.limitOk = true
  m.ip = '203.0.113.9, 10.0.0.1'
  vi.clearAllMocks()
})

describe('createGuestBookingAction', () => {
  it('answers a honeypot hit like a success and touches nothing', async () => {
    const res = await createGuestBookingAction({ ...input, company: 'Acme Bots' })
    expect(res).not.toHaveProperty('error')
    expect(m.visible).not.toHaveBeenCalled()
    expect(m.rateLimit).not.toHaveBeenCalled()
    expect(m.createGuest).not.toHaveBeenCalled()
  })

  it('resolves the Space from the slug as an anonymous viewer and fails closed when it is not visible', async () => {
    m.space = null
    const res = await createGuestBookingAction(input)
    expect(res).toHaveProperty('error')
    expect(m.visible).toHaveBeenCalledWith('blue-door', null)
    expect(m.createGuest).not.toHaveBeenCalled()
  })

  it('refuses before the write once the per-IP limit is hit, keyed on the first forwarded address', async () => {
    m.limitOk = false
    const res = await createGuestBookingAction(input)
    expect(res).toHaveProperty('error')
    expect(m.rateLimit).toHaveBeenCalledWith('booking_guest', '203.0.113.9', 6, '10 m')
    expect(m.createGuest).not.toHaveBeenCalled()
  })

  it('hands the core the server-resolved Space id, never one the caller sent, and defaults opt-in to false', async () => {
    const res = await createGuestBookingAction({ ...input, optIn: undefined })
    expect(res).not.toHaveProperty('error')
    expect(m.createGuest).toHaveBeenCalledWith({
      spaceId: 'space-1',
      startsAtISO: input.startsAtISO,
      name: 'Ada',
      email: 'ada@example.test',
      note: null,
      serviceTypeId: null,
      answers: null,
      optIn: false,
    })
  })

  it('records consent only for an explicit true', async () => {
    await createGuestBookingAction({ ...input, optIn: true })
    expect(m.createGuest.mock.calls[0][0]).toMatchObject({ optIn: true })
  })
})

describe('listGuestOpenSlotsAction', () => {
  it('returns no slots for a blank slug or a hidden Space', async () => {
    expect(await listGuestOpenSlotsAction('  ', null)).toEqual([])
    m.space = null
    expect(await listGuestOpenSlotsAction('blue-door', null)).toEqual([])
    expect(m.listPublic).not.toHaveBeenCalled()
  })

  it('lists the public slots for a visible Space', async () => {
    await listGuestOpenSlotsAction('blue-door', 'svc-1')
    expect(m.listPublic).toHaveBeenCalledWith('space-1', 'svc-1')
  })
})

describe('confirmGuestBookingFormAction', () => {
  const form = (token: string, spaceId = '') => {
    const f = new FormData()
    f.set('token', token)
    f.set('spaceId', spaceId)
    return f
  }

  it('passes a failed outcome through with no time written', async () => {
    m.confirmGuest.mockResolvedValue({ ok: false, reason: 'expired' })
    const res = await confirmGuestBookingFormAction({ outcome: null, when: null } as never, form('tok'))
    expect(res).toEqual({ outcome: { ok: false, reason: 'expired' }, when: null })
    expect(m.confirmGuest).toHaveBeenCalledWith('tok', undefined)
  })

  it('writes the time in the Space timezone on success', async () => {
    m.confirmGuest.mockResolvedValue({ ok: true, spaceId: 'space-1', startsAt: '2026-11-02T18:00:00.000Z' })
    const res = await confirmGuestBookingFormAction({ outcome: null, when: null } as never, form('tok', 'space-1'))
    expect(m.confirmGuest).toHaveBeenCalledWith('tok', 'space-1')
    expect(res?.when).toBe('Monday, November 2 at 10:00 AM PST')
  })
})
