import { describe, it, expect, vi, beforeEach } from 'vitest'

// Meta-scan L5-14 (2026-09-05): the public /rsvp/<token> capture always replied `{ ok: true }`,
// even when the event_guests write did not land, so the guest read "You're on the list" while the
// host had no guest and no seat existed. The reply now branches on exactly ONE thing: whether the
// guest-list row was written (`guestId`). Pinned here:
//   1. a valid token whose guest write fails -> the form's error shape, plain message;
//   2. the orchestrator throwing -> the same;
//   3. a valid token whose guest write lands -> ok (the other legs never change the reply);
//   4. a bad token -> still the generic ok and NO capture (token validity is never revealed);
//   5. the UX validations (name, email) and the rate limit keep their own messages.

vi.mock('next/headers', () => ({
  headers: async () => new Map([['x-forwarded-for', '1.2.3.4']]),
}))
vi.mock('@/lib/rate-limit', () => ({ rateLimitOk: vi.fn(async () => true) }))

const invite = vi.hoisted(() => ({
  value: { inviterProfileId: 'inviter-1', eventId: 'event-1' } as { inviterProfileId: string; eventId: string } | null,
}))
vi.mock('@/lib/qr/event-invite', () => ({
  verifyEventInviteToken: () => invite.value,
}))

const captureEventGuest = vi.fn(async (_input: Record<string, unknown>) => ({
  ok: true,
  guestId: 'g1' as string | null,
  networkContactId: 'n1' as string | null,
  contactId: 'c1' as string | null,
}))
vi.mock('@/lib/events/guests', () => ({
  captureEventGuest: (input: Record<string, unknown>) => captureEventGuest(input),
}))

import { rateLimitOk } from '@/lib/rate-limit'
import { submitEventGuest } from './actions'

const good = { token: 'signed', displayName: 'Sam', email: 'sam@example.com', rsvpStatus: 'going' }

beforeEach(() => {
  vi.clearAllMocks()
  invite.value = { inviterProfileId: 'inviter-1', eventId: 'event-1' }
  captureEventGuest.mockResolvedValue({ ok: true, guestId: 'g1', networkContactId: 'n1', contactId: 'c1' })
  vi.mocked(rateLimitOk).mockResolvedValue(true)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('submitEventGuest, the write result (L5-14)', () => {
  it('returns the error shape when the guest-list write did not land', async () => {
    captureEventGuest.mockResolvedValue({ ok: false, guestId: null, networkContactId: 'n1', contactId: null })
    const res = await submitEventGuest(good)
    expect(res).toEqual({ ok: false, error: 'We could not save your spot. Please try again.' })
    expect(captureEventGuest).toHaveBeenCalledTimes(1)
  })

  it('returns the error shape when the orchestrator throws', async () => {
    captureEventGuest.mockRejectedValue(new Error('db down'))
    const res = await submitEventGuest(good)
    expect(res).toEqual({ ok: false, error: 'We could not save your spot. Please try again.' })
    expect(console.error).toHaveBeenCalled()
  })

  it('returns ok when the guest row landed, even if the best-effort legs did not', async () => {
    captureEventGuest.mockResolvedValue({ ok: false, guestId: 'g1', networkContactId: null, contactId: null })
    const res = await submitEventGuest(good)
    expect(res).toEqual({ ok: true })
    expect(captureEventGuest).toHaveBeenCalledWith(
      expect.objectContaining({ inviterProfileId: 'inviter-1', eventId: 'event-1', email: 'sam@example.com', rsvpStatus: 'going' }),
    )
  })

  it('a bad token still gets the generic ok and never reaches the orchestrator', async () => {
    invite.value = null
    const res = await submitEventGuest(good)
    expect(res).toEqual({ ok: true })
    expect(captureEventGuest).not.toHaveBeenCalled()
  })

  it('keeps the UX validations and the rate limit as their own replies', async () => {
    expect(await submitEventGuest({ ...good, displayName: ' ' })).toEqual({ ok: false, error: 'Please add your name.' })
    expect(await submitEventGuest({ ...good, email: 'nope' })).toEqual({ ok: false, error: 'Please enter a valid email address.' })
    vi.mocked(rateLimitOk).mockResolvedValue(false)
    const limited = await submitEventGuest(good)
    expect(limited.ok).toBe(false)
    if (!limited.ok) expect(limited.error).toMatch(/too many requests/i)
    expect(captureEventGuest).not.toHaveBeenCalled()
  })

  it('the member-facing error line carries no em dash', async () => {
    captureEventGuest.mockResolvedValue({ ok: false, guestId: null, networkContactId: null, contactId: null })
    const res = await submitEventGuest(good)
    if (!res.ok) expect(res.error).not.toMatch(/[—–]/)
  })
})
