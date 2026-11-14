import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'

const state = vi.hoisted(() => ({
  audience: vi.fn(), consent: vi.fn(), track: vi.fn(),
  user: { id: 'verified-auth' } as { id: string } | null,
  profile: { id: 'verified-profile' } as { id: string } | null,
  authCalls: vi.fn(),
}))
vi.mock('@/lib/analytics/audience', () => ({ currentAnalyticsAudience: state.audience }))
vi.mock('@/lib/consent/consent', () => ({ hasConsent: state.consent }))
vi.mock('@/lib/analytics/track', () => ({ track: state.track }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => { state.authCalls(); return { data: { user: state.user } } } },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: state.profile }) }) }) }),
  }),
}))
import { POST } from './route'

const request = (props: Record<string, unknown> = {}, cookie = '', event = 'feature.used') => new Request('https://frequencylocal.com/api/track', {
  method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ event, props }),
}) as unknown as NextRequest

beforeEach(() => {
  vi.clearAllMocks()
  state.user = { id: 'verified-auth' }
  state.profile = { id: 'verified-profile' }
  state.audience.mockResolvedValue({ allowed: true, staff: false })
  state.consent.mockResolvedValue(true)
  state.track.mockResolvedValue(true)
})

describe('public tracking collector audience boundary', () => {
  it('drops declined browser analytics without letting a client consent flag override it', async () => {
    const response = await POST(request({ feature: 'builder', consent: true }, 'fq_consent=denied'))
    expect(response.status).toBe(204)
    expect(await response.text()).toBe('')
    expect(state.track).not.toHaveBeenCalled()
  })
  it('requires an explicit browser grant in a prior-consent region', async () => {
    expect((await POST(request({}, 'fq_ask=1'))).status).toBe(204)
    expect(state.track).not.toHaveBeenCalled()
  })
  it('excludes trusted staff and refused account audiences regardless of client flags', async () => {
    for (const audience of [{ allowed: false, staff: true }, { allowed: false, staff: false }, { allowed: true, staff: true }]) {
      state.audience.mockResolvedValue(audience)
      expect((await POST(request({ staff: false, consent: true }, 'fq_consent=granted'))).status).toBe(204)
    }
    expect(state.track).not.toHaveBeenCalled()
  })
  it('fails closed if trusted audience resolution is unavailable', async () => {
    state.audience.mockRejectedValue(new Error('lookup unavailable'))
    expect((await POST(request())).status).toBe(204)
    expect(state.track).not.toHaveBeenCalled()
  })
  it('records eligible first-party activity without requiring a GA cookie or configured tag', async () => {
    expect((await POST(request({ feature: 'builder' }, 'fq_ask=1; fq_consent=granted'))).status).toBe(204)
    expect(state.track).toHaveBeenCalledWith('feature.used', { feature: 'builder' }, 'verified-profile')
  })
  it('removes forged GA identity and authority props, while deriving the actor from the verified session', async () => {
    await POST(request({ feature: 'builder', ga_client_id: 'forged.1', ga_session_id: 'forged-session', GA_CLIENT_ID: 'forged.2', client_id: 'forged.3', session_id: 'forged-session', user_id: 'another-person', actorProfileId: 'another-profile', profileId: 'another-profile', idempotencyKey: 'purchase:forged', consent: true, isStaff: false }))
    expect(state.track).toHaveBeenCalledWith('feature.used', { feature: 'builder' }, 'verified-profile')
  })
  it('still rejects authoritative key events before any account lookup', async () => {
    for (const event of ['lead.captured', 'account.created', 'commerce.purchase']) expect((await POST(request({}, '', event))).status).toBe(400)
    expect(state.authCalls).not.toHaveBeenCalled()
    expect(state.track).not.toHaveBeenCalled()
  })
  it('keeps anonymous and account-consent-denied responses empty and non-identifying', async () => {
    state.user = null
    expect((await POST(request())).status).toBe(204)
    state.user = { id: 'verified-auth' }
    state.consent.mockResolvedValue(false)
    expect((await POST(request())).status).toBe(204)
    expect(state.track).not.toHaveBeenCalled()
  })
})
