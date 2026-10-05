import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { NextRequest } from 'next/server'

// SCAN-765. /api/track resolved the member's profile and called track() with no consent check, so a
// member who turned off Product analytics still had every nav.page_view stored against their
// profile in engagement_events, while the sibling sink /api/observe honoured the same toggle. These
// tests pin the gate: no consent → 204 and track() is never called; consent → track() runs with the
// profile id; and anonymous or profile-less callers are dropped before consent is even asked.

const H = vi.hoisted(() => ({
  user: { id: 'auth-1' } as { id: string } | null,
  profile: { id: 'profile-1' } as { id: string } | null,
  consent: true,
  track: vi.fn(async () => {}),
  hasConsent: vi.fn(async () => H.consent),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: () =>
    Promise.resolve({
      auth: { getUser: () => Promise.resolve({ data: { user: H.user } }) },
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: H.profile }) }) }),
      }),
    }),
}))
vi.mock('@/lib/consent/consent', () => ({ hasConsent: (...a: unknown[]) => H.hasConsent(...(a as [])) }))
vi.mock('@/lib/analytics/track', () => ({ track: (...a: unknown[]) => H.track(...(a as [])) }))

import { POST } from './route'

const request = (body: unknown) =>
  new Request('https://frequencylocal.com/api/track', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as NextRequest

beforeEach(() => {
  H.user = { id: 'auth-1' }
  H.profile = { id: 'profile-1' }
  H.consent = true
  H.track.mockClear()
  H.hasConsent.mockClear()
})

describe('/api/track honours the Product analytics toggle (SCAN-765)', () => {
  it('drops the event with a 204 and never calls track() when analytics consent is off', async () => {
    H.consent = false
    const res = await POST(request({ event: 'nav.page_view', props: { path: '/feed' } }))
    expect(res.status).toBe(204)
    expect(H.hasConsent).toHaveBeenCalledWith('profile-1', 'analytics')
    expect(H.track).not.toHaveBeenCalled()
  })

  it('records the event against the profile when consent is on', async () => {
    const res = await POST(request({ event: 'nav.page_view', props: { path: '/feed' } }))
    expect(res.status).toBe(204)
    expect(H.track).toHaveBeenCalledWith('nav.page_view', { path: '/feed' }, 'profile-1')
  })

  it('drops an anonymous post before asking about consent', async () => {
    H.user = null
    const res = await POST(request({ event: 'nav.page_view', props: {} }))
    expect(res.status).toBe(204)
    expect(H.hasConsent).not.toHaveBeenCalled()
    expect(H.track).not.toHaveBeenCalled()
  })

  it('drops a signed-in user with no profile row rather than writing a null actor', async () => {
    H.profile = null
    const res = await POST(request({ event: 'nav.page_view', props: {} }))
    expect(res.status).toBe(204)
    expect(H.track).not.toHaveBeenCalled()
  })

  it('still rejects an event the client may not emit', async () => {
    const res = await POST(request({ event: 'account.created', props: {} }))
    expect(res.status).toBe(400)
    expect(H.track).not.toHaveBeenCalled()
  })
})
