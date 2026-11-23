// BOOK-015: the owner's once-a-month notice when the bookings meter turns a booker away.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const sent = vi.hoisted(() => [] as { payload: { to: string; subject: string; text?: string; html: string }; opts: { dedupeKey?: string } }[])
vi.mock('@/lib/email', async (orig) => ({
  ...(await orig<typeof import('@/lib/email')>()),
  enqueueEmail: async (payload: never, opts: never) => {
    sent.push({ payload, opts })
  },
}))
let space: { slug: string; name: string; brandName: string | null; ownerProfileId: string | null } | null = null
vi.mock('@/lib/spaces/store', () => ({ getSpaceById: async () => space }))
let ownerEmail: string | null = 'owner@example.com'
vi.mock('@/lib/profiles/account-email', () => ({ profileAccountEmail: async () => ownerEmail }))

import { notifyBookingCapReached } from './booking-cap-notify'

const NOV = new Date('2026-11-21T12:00:00Z')

beforeEach(() => {
  sent.length = 0
  space = { slug: 'river-yoga', name: 'River Yoga', brandName: null, ownerProfileId: 'owner-1' }
  ownerEmail = 'owner@example.com'
})

describe('notifyBookingCapReached', () => {
  it('emails the owner with the cap, the Business upgrade link and a per-month key', async () => {
    await notifyBookingCapReached('space-1', { effective: 15, plan: 'free' }, NOV)
    expect(sent).toHaveLength(1)
    const { payload, opts } = sent[0]!
    expect(payload.to).toBe('owner@example.com')
    expect(payload.text).toContain('River Yoga hit its 15 free bookings this month, so a booker was turned away.')
    expect(payload.text).toContain('Business takes unlimited bookings.')
    expect(payload.text).toContain('/spaces/river-yoga/settings/billing')
    expect(opts.dedupeKey).toBe('booking_cap:space-1:2026-11')
    expect(`${payload.subject}${payload.text}`).not.toMatch(/[–—]|full/i)
  })

  it('keys the next month separately', async () => {
    await notifyBookingCapReached('space-1', { effective: 15, plan: 'free' }, new Date('2026-12-02T00:00:00Z'))
    expect(sent[0]!.opts.dedupeKey).toBe('booking_cap:space-1:2026-12')
  })

  it('sends nothing without an owner or an address, and never throws', async () => {
    ownerEmail = null
    await notifyBookingCapReached('space-1', { effective: 15 }, NOV)
    space = null
    await notifyBookingCapReached('space-1', { effective: 15 }, NOV)
    expect(sent).toHaveLength(0)
  })
})
