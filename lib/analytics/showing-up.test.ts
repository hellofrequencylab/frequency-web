import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))

import { countShowingUp, type AttendedSeat } from './showing-up'

const since = new Date('2026-11-24T00:00:00Z')
const until = new Date('2026-12-01T00:00:00Z')
const seat = (o: Partial<AttendedSeat>): AttendedSeat => ({
  profileId: null,
  guestEmail: null,
  attendedAt: '2026-11-28T18:00:00Z',
  attendedBy: 'host-1',
  ...o,
})

describe('countShowingUp', () => {
  it('counts each Member once, however many gatherings they were marked at', () => {
    const r = countShowingUp(
      [seat({ profileId: 'a' }), seat({ profileId: 'a', attendedAt: '2026-11-25T10:00:00Z' }), seat({ profileId: 'b' })],
      since,
      until,
    )
    expect(r).toEqual({ members: 2, guests: 0 })
  })

  it('counts only a host mark, never a self check-in or an unmarked seat', () => {
    const r = countShowingUp(
      [seat({ profileId: 'a', attendedBy: 'a' }), seat({ profileId: 'b', attendedBy: null }), seat({ profileId: 'c' })],
      since,
      until,
    )
    expect(r.members).toBe(1)
  })

  it('keeps to the 7-day window', () => {
    const r = countShowingUp(
      [seat({ profileId: 'old', attendedAt: '2026-11-23T23:59:59Z' }), seat({ profileId: 'edge', attendedAt: '2026-12-01T00:00:00Z' })],
      since,
      until,
    )
    expect(r.members).toBe(0)
  })

  it('counts guests apart, one per email', () => {
    const r = countShowingUp(
      [seat({ guestEmail: 'Sam@Example.com' }), seat({ guestEmail: 'sam@example.com ' }), seat({ guestEmail: 'jo@example.com' })],
      since,
      until,
    )
    expect(r).toEqual({ members: 0, guests: 2 })
  })
})
