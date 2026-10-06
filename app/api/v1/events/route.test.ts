import { beforeEach, describe, expect, it, vi } from 'vitest'
import { checkInResponse, eventResponse, eventsResponse, rsvpResponse } from '@/lib/contract'

// /api/v1/events (LIVE-716): the public list, RSVP through the web's setRsvpStatus, and check-in.

let authOk = true
const getPublicEvents = vi.fn()
const getPublicEventBySlug = vi.fn()
const setRsvpStatus = vi.fn()
const checkInEvent = vi.fn()
const stored = { status: 'waitlist', approval_status: null }

vi.mock('@/lib/contract/caller', () => ({
  authorizeCaller: async () =>
    authOk ? { ok: true, via: 'bearer', caller: { id: 'p-1' }, profile: {} } : { ok: false, code: 'unauthorized', message: 'Sign in again.' },
  asCaller: (_auth: unknown, fn: () => unknown) => fn(),
}))
vi.mock('@/lib/rate-limit', () => ({ clientIp: () => '203.0.113.9', rateLimitOk: async () => true }))
vi.mock('@/lib/discover', () => ({ getPublicEvents, getPublicEventBySlug }))
vi.mock('@/app/(main)/events/actions', () => ({ setRsvpStatus, checkInEvent }))
vi.mock('@/lib/supabase/server', () => {
  const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: stored }) }
  return { createClient: async () => ({ from: () => q }) }
})

const ID = '4b3f1c2e-8d7a-4c1b-9e2f-1a2b3c4d5e6f'
const event = {
  id: ID,
  slug: 'sit',
  title: 'Sit',
  description: null,
  starts_at: '2026-10-07T17:00:00Z',
  ends_at: null,
  city: 'Austin',
  circle_id: null,
  circle_name: null,
  price_cents: null,
}
const ctx = () => ({ params: Promise.resolve({ id: ID }) })

beforeEach(() => {
  authOk = true
  getPublicEvents.mockReset().mockResolvedValue([event])
  getPublicEventBySlug.mockReset().mockResolvedValue(event)
  setRsvpStatus.mockReset().mockResolvedValue({ data: undefined })
  checkInEvent.mockReset().mockResolvedValue({ ok: false, reason: 'window_closed' })
})

describe('/api/v1/events', () => {
  it('lists upcoming events, and one by slug', async () => {
    const { GET } = await import('./route')
    const list = await (await GET(new Request('https://x/api/v1/events'))).json()
    expect(eventsResponse.safeParse(list).success).toBe(true)
    const one = await (await GET(new Request('https://x/api/v1/events?slug=sit'))).json()
    expect(eventResponse.safeParse(one).success).toBe(true)
    expect(getPublicEventBySlug).toHaveBeenCalledWith('sit')
  })

  it('RSVPs and answers with the stored row, so a full event says waitlist', async () => {
    const { POST, DELETE } = await import('./[id]/rsvp/route')
    const json = await (await POST(new Request('https://x/api', { method: 'POST', body: JSON.stringify({ status: 'going' }) }), ctx())).json()
    expect(rsvpResponse.safeParse(json).success).toBe(true)
    expect(json.data).toEqual({ status: 'waitlist', approvalStatus: null })
    expect(setRsvpStatus).toHaveBeenCalledWith(ID, 'going')
    await DELETE(new Request('https://x/api', { method: 'DELETE' }), ctx())
    expect(setRsvpStatus).toHaveBeenLastCalledWith(ID, 'not_going')
  })

  it('is forbidden when the gate refused the RSVP', async () => {
    setRsvpStatus.mockResolvedValue(undefined)
    const { POST } = await import('./[id]/rsvp/route')
    const res = await POST(new Request('https://x/api', { method: 'POST', body: JSON.stringify({ status: 'going' }) }), ctx())
    expect(res.status).toBe(403)
  })

  it('checks in, and a closed window is ok:false with the reason', async () => {
    const { POST } = await import('./[id]/check-in/route')
    const json = await (await POST(new Request('https://x/api', { method: 'POST' }), ctx())).json()
    expect(checkInResponse.safeParse(json).success).toBe(true)
    expect(json.data).toEqual({ ok: false, alreadyCheckedIn: false, zapsAwarded: 0, reason: 'window_closed' })
  })

  it('is a 401 signed out', async () => {
    authOk = false
    const { POST } = await import('./[id]/rsvp/route')
    expect((await POST(new Request('https://x/api', { method: 'POST', body: '{}' }), ctx())).status).toBe(401)
    expect(setRsvpStatus).not.toHaveBeenCalled()
  })
})
