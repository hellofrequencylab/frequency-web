import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => {
  const env = ['NEXT_PUBLIC_GA_MEASUREMENT_ID', 'GA_API_SECRET', 'VERCEL_ENV'] as const
  const previous = Object.fromEntries(env.map(key => [key, process.env[key]]))
  process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID = 'G-LEADTEST'
  process.env.GA_API_SECRET = 'synthetic-test-secret'
  process.env.VERCEL_ENV = 'production'
  return {
    previous, env, cookies: new Map<string, string>(), cookieError: false,
    user: null as { id: string } | null, authError: null as { name: string } | null,
    profile: { id: 'actual-profile', web_role: 'none' } as { id: string; web_role: string } | null,
    profileError: false, team: null as { profile_id: string } | null, teamError: false,
    ledgerError: false, inserted: new Map<string, Record<string, unknown>>(),
    profileFilters: [] as Array<[string, unknown]>, teamFilters: [] as Array<[string, unknown]>,
    hasConsent: vi.fn(), fetch: vi.fn(),
  }
})

vi.mock('next/headers', () => ({ cookies: async () => {
  if (state.cookieError) throw new Error('No request cookie context')
  return { get: (name: string) => state.cookies.has(name) ? { value: state.cookies.get(name) } : undefined }
} }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({
  auth: { getUser: async () => ({ data: { user: state.user }, error: state.authError }) },
  from(table: string) {
    if (table !== 'profiles') throw new Error(`Unexpected session table ${table}`)
    const query = {
      select: () => query,
      eq: (field: string, value: unknown) => { state.profileFilters.push([field, value]); return query },
      maybeSingle: async () => ({ data: state.profile, error: state.profileError ? new Error('Profile unavailable') : null }),
    }
    return query
  },
}) }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from(table: string) {
  if (table === 'engagement_events') {
    const query = {
      select: () => query, eq: () => query,
      maybeSingle: async () => ({ data: { id: 'existing-ledger-row' }, error: null }),
      upsert: (input: Record<string, unknown>, options: Record<string, unknown>) => ({ select: async () => {
        expect(options).toEqual({ onConflict: 'idempotency_key', ignoreDuplicates: true })
        if (state.ledgerError) return { data: null, error: new Error('Ledger unavailable') }
        const key = String(input.idempotency_key)
        if (state.inserted.has(key)) return { data: [], error: null }
        state.inserted.set(key, input)
        return { data: [{ id: 'new-ledger-row' }], error: null }
      } }),
    }
    return query
  }
  if (table !== 'team_members') throw new Error(`Unexpected admin table ${table}`)
  const query = {
    select: () => query,
    eq: (field: string, value: unknown) => { state.teamFilters.push([field, value]); return query },
    maybeSingle: async () => ({ data: state.team, error: state.teamError ? new Error('Team lookup unavailable') : null }),
  }
  return query
} }) }))
vi.mock('@/lib/consent/consent', () => ({ hasConsent: state.hasConsent }))
vi.mock('@/lib/achievements', () => ({ processGamificationEvent: vi.fn() }))
vi.mock('@/lib/automations', () => ({ runAutomationsForEvent: vi.fn() }))

import { recordVerifiedLeadCapture } from './leads'
import { track } from './track'
import { isClientEvent, isTrackedEvent } from './events'
import { CONSENT_COOKIE, CONSENT_REGION_COOKIE } from '@/lib/consent/cookie-consent'

beforeEach(() => {
  vi.clearAllMocks()
  state.cookies.clear()
  state.cookies.set('_ga', 'GA1.1.123.456')
  state.cookies.set('_ga_LEADTEST', 'GS2.1.s1695123456$o1$g1')
  state.cookies.set(CONSENT_COOKIE, 'granted')
  state.cookieError = false
  state.user = null
  state.authError = null
  state.profile = { id: 'actual-profile', web_role: 'none' }
  state.profileError = false
  state.team = null
  state.teamError = false
  state.ledgerError = false
  state.inserted.clear()
  state.profileFilters.length = 0
  state.teamFilters.length = 0
  state.hasConsent.mockResolvedValue(true)
  state.fetch.mockResolvedValue(new Response(null, { status: 204 }))
  vi.stubGlobal('fetch', state.fetch)
  process.env.VERCEL_ENV = 'production'
})
afterAll(() => {
  vi.unstubAllGlobals()
  for (const key of state.env) {
    if (state.previous[key] === undefined) delete process.env[key]
    else process.env[key] = state.previous[key]
  }
})

const emittedBody = () => JSON.parse(String(state.fetch.mock.calls[0]?.[1]?.body))
const capture = () => recordVerifiedLeadCapture('durable-lead-id', 'create_space')
const expectFirstParty = () => expect(state.inserted.get('lead.captured:durable-lead-id')).toMatchObject({
  event_type: 'lead.captured', actor_profile_id: null, context: { source: 'create_space' },
})

describe('durable lead through the actual registry, recorder and Google transport', () => {
  it('registers the durable conversion as server-only', () => {
    expect(isTrackedEvent('lead.captured')).toBe(true)
    expect(isClientEvent('lead.captured')).toBe(false)
  })
  it('records once and emits generate_lead with the real browser identity and closed source only', async () => {
    await capture()
    expectFirstParty()
    expect(state.fetch).toHaveBeenCalledTimes(1)
    expect(emittedBody()).toEqual({
      client_id: '123.456', non_personalized_ads: true,
      events: [{ name: 'generate_lead', params: { lead_source: 'create_space', session_id: '1695123456', engagement_time_msec: 1 } }],
    })
    await capture()
    expect(state.inserted.size).toBe(1)
    expect(state.fetch).toHaveBeenCalledTimes(1)
  })
  it('counts a persisted fact without a consenting browser but sends no Google event', async () => {
    state.cookies.delete('_ga')
    await capture()
    expectFirstParty()
    expect(state.fetch).not.toHaveBeenCalled()
  })
  it('keeps explicit-null background capture out of Google even if request cookies exist', async () => {
    await recordVerifiedLeadCapture('durable-lead-id', 'event_ticket', { gaIdentity: null })
    expect(state.inserted.size).toBe(1)
    expect(state.fetch).not.toHaveBeenCalled()
  })
  it('does not count an unpersisted or failed ledger insert as a Google conversion', async () => {
    state.ledgerError = true
    await expect(capture()).resolves.toBeUndefined()
    expect(state.inserted.size).toBe(0)
    expect(state.fetch).not.toHaveBeenCalled()
  })
  it.each(['', 'other.key', 'lead.captured:'])('refuses a conversion without its durable key (%s)', async key => {
    expect(await track('lead.captured', { source: 'create_space' }, null, {
      idempotencyKey: key, gaIdentity: { clientId: '123.456', sessionId: null },
    })).toBe(false)
    expect(state.inserted.size).toBe(0)
    expect(state.fetch).not.toHaveBeenCalled()
  })
  it('never invents an identity or forwards contact, durable IDs or private parameters', async () => {
    await track('lead.captured', { source: 'create_space', email: 'private@example.com', mind: 'private-reflection', lead_id: 'durable-lead-id' }, null, {
      idempotencyKey: 'lead.captured:durable-lead-id', gaIdentity: { clientId: '123.456', sessionId: null },
    })
    expect(emittedBody().events).toEqual([{ name: 'generate_lead', params: { lead_source: 'create_space' } }])
    expect(JSON.stringify(emittedBody())).not.toMatch(/private|durable-lead-id/)
  })
  it.each(['not-a-real-source', 'private@example.com'])('does not mirror an unknown source (%s)', async source => {
    await track('lead.captured', { source }, null, { idempotencyKey: 'lead.captured:durable-lead-id', gaIdentity: { clientId: '123.456', sessionId: null } })
    expect(state.inserted.size).toBe(1)
    expect(state.fetch).not.toHaveBeenCalled()
  })
  it.each([{ clientId: 'private@example.com', sessionId: null }, { clientId: '123.456', sessionId: 'private' }])('rejects malformed browser identity (%j)', async gaIdentity => {
    await track('lead.captured', { source: 'create_space' }, null, { idempotencyKey: 'lead.captured:durable-lead-id', gaIdentity })
    expect(state.inserted.size).toBe(1)
    expect(state.fetch).not.toHaveBeenCalled()
  })
  it('does not send preview/dev traffic', async () => {
    process.env.VERCEL_ENV = 'preview'
    await capture()
    expectFirstParty()
    expect(state.fetch).not.toHaveBeenCalled()
  })
})

describe('fresh browser, account and actual staff policy on the lead-only mirror', () => {
  it('honors a fresh decline even when an old GA cookie remains', async () => {
    state.cookies.set(CONSENT_COOKIE, 'denied')
    await capture()
    expectFirstParty()
    expect(state.fetch).not.toHaveBeenCalled()
  })
  it('requires an opt-in in prior-consent regions and retains the canonical outside-region policy', async () => {
    state.cookies.delete(CONSENT_COOKIE)
    state.cookies.set(CONSENT_REGION_COOKIE, '1')
    await capture()
    expectFirstParty()
    expect(state.fetch).not.toHaveBeenCalled()
    state.cookies.delete(CONSENT_REGION_COOKIE)
    await recordVerifiedLeadCapture('outside-region-lead', 'create_space')
    expect(state.fetch).toHaveBeenCalledTimes(1)
  })
  it('fails closed when request cookies or verified auth cannot be read', async () => {
    state.authError = { name: 'AuthRetryableFetchError' }
    await capture()
    expectFirstParty()
    expect(state.fetch).not.toHaveBeenCalled()
    state.authError = null
    state.cookieError = true
    await recordVerifiedLeadCapture('no-request', 'create_space', { gaIdentity: { clientId: '123.456', sessionId: null } })
    expect(state.fetch).not.toHaveBeenCalled()
  })
  it('allows a known anonymous session-missing response under browser policy', async () => {
    state.authError = { name: 'AuthSessionMissingError' }
    await capture()
    expect(state.fetch).toHaveBeenCalledTimes(1)
  })
  it('uses the verified account profile for consent, never a caller-supplied actor or view-as role', async () => {
    state.user = { id: 'verified-auth-user' }
    await track('lead.captured', { source: 'create_space' }, 'forged-profile', { idempotencyKey: 'lead.captured:durable-lead-id', gaIdentity: { clientId: '123.456', sessionId: null } })
    expect(state.profileFilters).toEqual([['auth_user_id', 'verified-auth-user']])
    expect(state.teamFilters).toEqual([['profile_id', 'actual-profile']])
    expect(state.hasConsent).toHaveBeenCalledWith('actual-profile', 'analytics')
    expect(emittedBody()).not.toHaveProperty('user_id')
  })
  it('honors account opt-out while retaining the durable fact', async () => {
    state.user = { id: 'verified-auth-user' }
    state.hasConsent.mockResolvedValue(false)
    await capture()
    expectFirstParty()
    expect(state.fetch).not.toHaveBeenCalled()
  })
  it.each(['admin', 'janitor'])('excludes actual platform staff (%s), including role preview cookies', async role => {
    state.user = { id: 'verified-auth-user' }
    state.profile!.web_role = role
    state.cookies.set('freq-view-as', 'member')
    await capture()
    expectFirstParty()
    expect(state.fetch).not.toHaveBeenCalled()
  })
  it('excludes team staff even without the platform staff role', async () => {
    state.user = { id: 'verified-auth-user' }
    state.team = { profile_id: 'actual-profile' }
    await capture()
    expectFirstParty()
    expect(state.fetch).not.toHaveBeenCalled()
  })
  it.each(['profile-error', 'profile-missing', 'team-error', 'invalid-role'])('fails closed on unavailable account/staff evidence (%s)', async failure => {
    state.user = { id: 'verified-auth-user' }
    if (failure === 'profile-error') state.profileError = true
    if (failure === 'profile-missing') state.profile = null
    if (failure === 'team-error') state.teamError = true
    if (failure === 'invalid-role') state.profile!.web_role = 'unknown'
    await capture()
    expectFirstParty()
    expect(state.fetch).not.toHaveBeenCalled()
  })
})
