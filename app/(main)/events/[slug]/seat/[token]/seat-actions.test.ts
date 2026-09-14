import { describe, it, expect, vi, beforeEach } from 'vitest'

// PROG-GD2: the two submits behind the guest's seat link. What these pin:
//   1. RELEASE frees the seat through release_guest_seat and then runs the SAME waitlist pair a
//      member's "Can't go" runs (promoteFromWaitlist + notifyPromotedSeat), with the event id the
//      SQL returned, so the next person moves in and is told whichever identity holds their seat;
//   2. a token that addresses nothing (the SQL answers null) gets the neutral reply, and NO
//      promotion runs on top of a seat that was never freed;
//   3. a malformed token never reaches the database at all (no rpc call);
//   4. an RPC error is a write that did not happen: a plain "try again", never a success;
//   5. UPDATE clamps plus-ones to the member rule before the SQL sees them, sends answers bounded,
//      and treats a false reply as the neutral page;
//   6. the rate limiter fails closed in front of both doors.
// The cookie jar, headers, rate limiter, Supabase client, promotion and notice are all stubbed.

vi.mock('next/headers', () => ({
  headers: async () => new Map([['x-forwarded-for', '1.2.3.4']]),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
const rateLimitOk = vi.fn(async () => true)
vi.mock('@/lib/rate-limit', () => ({ rateLimitOk: (...a: unknown[]) => rateLimitOk(...(a as [])) }))

const rpc = vi.fn(async (_fn: string, _args: Record<string, unknown>) => ({
  data: null as unknown,
  error: null as { message: string } | null,
}))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ rpc }) }))

const promoteFromWaitlist = vi.fn(async (_eventId: string) => null as null | { rsvpId: string; profileId: string | null; guestEmail: string | null })
const notifyPromotedSeat = vi.fn(async () => undefined)
vi.mock('@/lib/events/capacity', () => ({
  promoteFromWaitlist: (eventId: string) => promoteFromWaitlist(eventId),
}))
vi.mock('@/lib/events/waitlist-notify', () => ({
  notifyPromotedSeat: (...a: unknown[]) => notifyPromotedSeat(...(a as [])),
}))

import { releaseGuestSeat, updateGuestSeat } from './seat-actions'
import { revalidatePath } from 'next/cache'

const TOKEN = '3f2c1b4a-9d8e-4f7a-8b6c-5d4e3f2a1b0c'
const EVENT = '11111111-1111-4111-8111-111111111111'
const NEUTRAL = 'This link is not active. If you still hold a spot, the newest email about this event has a working one.'

beforeEach(() => {
  vi.clearAllMocks()
  rateLimitOk.mockResolvedValue(true)
  rpc.mockResolvedValue({ data: null, error: null })
  promoteFromWaitlist.mockResolvedValue(null)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('releaseGuestSeat', () => {
  it('releases through release_guest_seat and runs the shared waitlist promotion on the returned event', async () => {
    rpc.mockResolvedValue({ data: EVENT, error: null })
    const seat = { rsvpId: 'r-2', profileId: null, guestEmail: 'next@example.com' }
    promoteFromWaitlist.mockResolvedValue(seat)

    const res = await releaseGuestSeat({ token: TOKEN, slug: 'tuesday-sit' })

    expect(res).toEqual({ ok: true })
    expect(rpc).toHaveBeenCalledWith('release_guest_seat', { p_token: TOKEN })
    // The member path's exact pair, in order: free the seat, promote, tell whoever moved up.
    expect(promoteFromWaitlist).toHaveBeenCalledWith(EVENT)
    expect(notifyPromotedSeat).toHaveBeenCalledWith(seat, EVENT)
    expect(revalidatePath).toHaveBeenCalledWith('/events/tuesday-sit')
  })

  it('promotes nobody when the waitlist is empty, and still reports the release', async () => {
    rpc.mockResolvedValue({ data: EVENT, error: null })
    const res = await releaseGuestSeat({ token: TOKEN, slug: 's' })
    expect(res).toEqual({ ok: true })
    expect(promoteFromWaitlist).toHaveBeenCalledWith(EVENT)
    expect(notifyPromotedSeat).not.toHaveBeenCalled()
  })

  it('answers the neutral page and promotes nobody when the token addresses no live seat', async () => {
    rpc.mockResolvedValue({ data: null, error: null })
    const res = await releaseGuestSeat({ token: TOKEN, slug: 's' })
    expect(res).toEqual({ ok: false, error: NEUTRAL })
    expect(promoteFromWaitlist).not.toHaveBeenCalled()
    expect(notifyPromotedSeat).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('never reaches the database for a malformed token, and says the same neutral words', async () => {
    const res = await releaseGuestSeat({ token: "' or 1=1", slug: 's' })
    expect(res).toEqual({ ok: false, error: NEUTRAL })
    expect(rpc).not.toHaveBeenCalled()
    expect(promoteFromWaitlist).not.toHaveBeenCalled()
  })

  it('treats an RPC error as a write that did not happen: no promotion, a plain try-again', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'connection refused' } })
    const res = await releaseGuestSeat({ token: TOKEN, slug: 's' })
    expect(res).toEqual({ ok: false, error: 'We could not save that. Please try again.' })
    expect(promoteFromWaitlist).not.toHaveBeenCalled()
  })

  it('treats a thrown RPC the same way', async () => {
    rpc.mockRejectedValue(new Error('fetch failed'))
    const res = await releaseGuestSeat({ token: TOKEN, slug: 's' })
    expect(res).toEqual({ ok: false, error: 'We could not save that. Please try again.' })
    expect(promoteFromWaitlist).not.toHaveBeenCalled()
  })

  it('keeps the release even when the promotion or the notice throws (best-effort, logged)', async () => {
    rpc.mockResolvedValue({ data: EVENT, error: null })
    promoteFromWaitlist.mockRejectedValue(new Error('boom'))
    const res = await releaseGuestSeat({ token: TOKEN, slug: 's' })
    expect(res).toEqual({ ok: true })
    expect(console.error).toHaveBeenCalled()
  })

  it('fails closed on the rate limiter before touching the database', async () => {
    rateLimitOk.mockResolvedValue(false)
    const res = await releaseGuestSeat({ token: TOKEN, slug: 's' })
    expect(res.ok).toBe(false)
    expect(rpc).not.toHaveBeenCalled()
  })
})

describe('updateGuestSeat', () => {
  it('sends clamped plus-ones and bounded answers to update_guest_seat', async () => {
    rpc.mockResolvedValue({ data: true, error: null })
    const res = await updateGuestSeat({
      token: TOKEN,
      slug: 'tuesday-sit',
      plusOnes: 9.7,
      answers: { 'q-1': 'x'.repeat(2500), 'q-2': 'veg', 'q-3': 42 as unknown as string },
    })
    expect(res).toEqual({ ok: true })
    const [fn, args] = rpc.mock.calls[0]
    expect(fn).toBe('update_guest_seat')
    expect(args.p_token).toBe(TOKEN)
    // The member rule: [0, 5], truncated.
    expect(args.p_plus_ones).toBe(5)
    const answers = args.p_answers as Record<string, string>
    expect(answers['q-1']).toHaveLength(2000)
    expect(answers['q-2']).toBe('veg')
    // A non-string answer is dropped rather than coerced.
    expect(answers).not.toHaveProperty('q-3')
    expect(revalidatePath).toHaveBeenCalledWith('/events/tuesday-sit')
  })

  it('omits plus-ones from the call when the page did not offer them (waitlist / pending seat)', async () => {
    rpc.mockResolvedValue({ data: true, error: null })
    await updateGuestSeat({ token: TOKEN, slug: 's', plusOnes: null, answers: { 'q-1': 'a' } })
    const [, args] = rpc.mock.calls[0]
    expect(args).not.toHaveProperty('p_plus_ones')
    expect(args).toHaveProperty('p_answers')
  })

  it('reads a false reply as the neutral page', async () => {
    rpc.mockResolvedValue({ data: false, error: null })
    const res = await updateGuestSeat({ token: TOKEN, slug: 's', plusOnes: 1 })
    expect(res).toEqual({ ok: false, error: NEUTRAL })
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('never reaches the database for a malformed token', async () => {
    const res = await updateGuestSeat({ token: 'nope', slug: 's', plusOnes: 1 })
    expect(res).toEqual({ ok: false, error: NEUTRAL })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('treats an RPC error as a write that did not happen', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'down' } })
    const res = await updateGuestSeat({ token: TOKEN, slug: 's', plusOnes: 1 })
    expect(res).toEqual({ ok: false, error: 'We could not save that. Please try again.' })
  })

  it('fails closed on the rate limiter', async () => {
    rateLimitOk.mockResolvedValue(false)
    const res = await updateGuestSeat({ token: TOKEN, slug: 's', plusOnes: 1 })
    expect(res.ok).toBe(false)
    expect(rpc).not.toHaveBeenCalled()
  })
})
