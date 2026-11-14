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

import { readGaIdentity, checkoutGaMetadata } from './ga-client-id'
import { requestGoogleAllowed } from './server-google-policy'
import { GET } from '@/app/api/analytics/policy/route'
import { POST } from '@/app/api/track/route'
import type { NextRequest } from 'next/server'
import { track } from './track'
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


const turn = () => new Promise(resolve => setTimeout(resolve, 0))
const signup = () => track('account.created', { source: 'oauth' }, 'actual-profile', {
  idempotencyKey: 'account.created:actual-profile', gaIdentity: { clientId: '123.456', sessionId: '1695123456' },
})
const request = (event = 'nav.page_view') => new Request('https://frequencylocal.com/api/track', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ event, props: { path: '/feed' } }),
}) as unknown as NextRequest

describe('real request policy and identity boundaries share browser/account/real-staff decisions', () => {
  it('permits a known anonymous request outside the prior-consent region and returns no identity metadata', async () => {
    state.cookies.delete(CONSENT_COOKIE)
    expect(await requestGoogleAllowed()).toBe(true)
    const response = await GET()
    expect(await response.json()).toEqual({ allowed: true })
    expect(response.headers.get('cache-control')).toBe('private, no-store, max-age=0')
    expect(response.headers.get('vary')).toBe('Cookie')
  })
  it.each(['denied', 'prior', 'optout'])('withholds identity and checkout metadata for %s browser', async kind => {
    if (kind === 'denied') state.cookies.set(CONSENT_COOKIE, 'denied')
    if (kind === 'prior') { state.cookies.delete(CONSENT_COOKIE); state.cookies.set(CONSENT_REGION_COOKIE, '1') }
    if (kind === 'optout') state.cookies.set('fq_ga_optout', '1')
    expect(await requestGoogleAllowed()).toBe(false)
    expect(await readGaIdentity()).toBeNull()
    expect(await checkoutGaMetadata()).toEqual({})
    expect(await (await GET()).json()).toEqual({ allowed: false })
    expect(state.fetch).not.toHaveBeenCalled()
  })
  it('retains the actual client/session identity only after a signed-in member passes all policy checks', async () => {
    state.user = { id: 'real-auth' }
    expect(await readGaIdentity()).toEqual({ clientId: '123.456', sessionId: '1695123456' })
    expect(await checkoutGaMetadata()).toEqual({ ga_client_id: '123.456' })
    expect(state.profileFilters.every(([field, value]) => field === 'auth_user_id' && value === 'real-auth')).toBe(true)
    expect(state.teamFilters.every(([field, value]) => field === 'profile_id' && value === 'actual-profile')).toBe(true)
  })
  it.each(['admin', 'staff', 'unknown'])('does not let %s impersonate a non-staff viewer', async role => {
    state.user = { id: 'real-auth' }
    state.cookies.set('view_as_profile', 'unrelated-member')
    state.profile = { id: 'actual-profile', web_role: role }
    expect(await readGaIdentity()).toBeNull()
    expect(await (await GET()).json()).toEqual({ allowed: false })
  })
  it.each(['team', 'team-read', 'profile-read', 'auth', 'account'])('fails closed for %s account evidence', async kind => {
    state.user = { id: 'real-auth' }
    if (kind === 'team') state.team = { profile_id: 'actual-profile' }
    if (kind === 'team-read') state.teamError = true
    if (kind === 'profile-read') state.profileError = true
    if (kind === 'auth') state.authError = { name: 'AuthRetryableFetchError' }
    if (kind === 'account') state.hasConsent.mockResolvedValue(false)
    expect(await readGaIdentity()).toBeNull()
    expect(await (await GET()).json()).toEqual({ allowed: false })
  })
  it('treats only explicit missing-session evidence with no user as known anonymous', async () => {
    state.authError = { name: 'AuthSessionMissingError' }
    expect(await requestGoogleAllowed()).toBe(true)
    state.user = { id: 'real-auth' }
    expect(await requestGoogleAllowed()).toBe(false)
  })
  it('returns private no-store denial even when reading cookie context throws', async () => {
    state.cookieError = true
    const response = await GET()
    expect(await response.json()).toEqual({ allowed: false })
    expect(response.headers.get('cache-control')).toMatch(/private, no-store/)
  })
})

describe('actual client sink requires real eligibility before writing', () => {
  it('records a permitted real member under their actual profile', async () => {
    state.user = { id: 'real-auth' }
    const response = await POST(request())
    expect(response.status).toBe(204)
    expect([...state.inserted.values()]).toMatchObject([{ actor_profile_id: 'actual-profile', event_type: 'nav.page_view' }])
  })
  it.each(['denied', 'team', 'staff', 'account', 'auth'])('does not write a client event for %s requests', async kind => {
    state.user = { id: 'real-auth' }
    if (kind === 'denied') state.cookies.set(CONSENT_COOKIE, 'denied')
    if (kind === 'team') state.team = { profile_id: 'actual-profile' }
    if (kind === 'staff') state.profile = { id: 'actual-profile', web_role: 'admin' }
    if (kind === 'account') state.hasConsent.mockResolvedValue(false)
    if (kind === 'auth') state.authError = { name: 'AuthRetryableFetchError' }
    expect((await POST(request())).status).toBe(204)
    expect(state.inserted.size).toBe(0)
    expect(state.fetch).not.toHaveBeenCalled()
  })
  it('rejects server-authoritative spoofing before any account query', async () => {
    expect((await POST(request('account.created'))).status).toBe(400)
    expect(state.profileFilters).toHaveLength(0)
    expect(state.inserted.size).toBe(0)
  })
})

describe('actual signup mirror requires request eligibility while keeping the durable account ledger', () => {
  it('mirrors an eligible signup exactly once with the genuine browser identity', async () => {
    state.user = { id: 'real-auth' }
    expect(await signup()).toBe(true)
    await turn()
    expect(await signup()).toBe(false)
    await turn()
    expect(state.fetch).toHaveBeenCalledOnce()
    const body = JSON.parse(String(state.fetch.mock.calls[0][1].body))
    expect(body.client_id).toBe('123.456')
    expect(body.events[0]).toMatchObject({ name: 'sign_up', params: { method: 'oauth', session_id: '1695123456' } })
  })
  it.each(['browser', 'staff', 'account', 'unknown'])('keeps the account fact but emits no signup pixel for %s evidence', async kind => {
    state.user = { id: 'real-auth' }
    if (kind === 'browser') state.cookies.set(CONSENT_COOKIE, 'denied')
    if (kind === 'staff') state.team = { profile_id: 'actual-profile' }
    if (kind === 'account') state.hasConsent.mockResolvedValue(false)
    if (kind === 'unknown') state.authError = { name: 'AuthRetryableFetchError' }
    expect(await signup()).toBe(true)
    await turn()
    expect(state.inserted.size).toBe(1)
    expect(state.fetch).not.toHaveBeenCalled()
  })
})
