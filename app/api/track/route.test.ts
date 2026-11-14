import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { NextRequest } from 'next/server'

// SCAN-765 (2026-10-05). /api/track resolved the profile and called track() with no consent
// check, so a member who turned off Product analytics still had every nav.page_view stored
// against their profile in engagement_events, while the sibling /api/observe honoured the same
// toggle. These tests pin the gate: no analytics consent (or no profile) answers 204 with track()
// never called; a consenting member is recorded under their profile id.

const state = vi.hoisted(() => ({
  profile: { id: 'profile-1' } as { id: string } | null,
  consent: true,
  consentCalls: [] as [string, string][],
  tracked: [] as unknown[][],
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: () =>
    Promise.resolve({
      auth: { getUser: () => Promise.resolve({ data: { user: { id: 'auth-1' } } }) },
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: state.profile }) }) }),
      }),
    }),
}))
vi.mock('@/lib/consent/consent', () => ({
  hasConsent: (profileId: string, scope: string) => {
    state.consentCalls.push([profileId, scope])
    return Promise.resolve(state.consent)
  },
}))
vi.mock('@/lib/analytics/track', () => ({
  track: (...args: unknown[]) => {
    state.tracked.push(args)
    return Promise.resolve()
  },
}))

import { POST } from './route'

const request = (body: unknown) =>
  new Request('https://frequencylocal.com/api/track', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as NextRequest

const pageView = { event: 'nav.page_view', props: { path: '/feed' } }

beforeEach(() => {
  state.profile = { id: 'profile-1' }
  state.consent = true
  state.consentCalls.length = 0
  state.tracked.length = 0
})

describe('POST /api/track is consent-gated (SCAN-765)', () => {
  it('records a consenting member under their profile id', async () => {
    const res = await POST(request(pageView))
    expect(res.status).toBe(204)
    expect(state.consentCalls).toEqual([['profile-1', 'analytics']])
    expect(state.tracked).toEqual([['nav.page_view', { path: '/feed' }, 'profile-1']])
  })

  it('answers 204 and never calls track() when analytics consent is off', async () => {
    state.consent = false
    const res = await POST(request(pageView))
    expect(res.status).toBe(204)
    expect(await res.text()).toBe('')
    expect(state.consentCalls).toEqual([['profile-1', 'analytics']])
    expect(state.tracked).toEqual([])
  })

  it('answers 204 and never calls track() when the user has no profile', async () => {
    state.profile = null
    const res = await POST(request(pageView))
    expect(res.status).toBe(204)
    expect(state.consentCalls).toEqual([])
    expect(state.tracked).toEqual([])
  })

  it('still rejects a non-client event before any lookup', async () => {
    const res = await POST(request({ event: 'circle.joined' }))
    expect(res.status).toBe(400)
    expect(state.tracked).toEqual([])
  })
})
