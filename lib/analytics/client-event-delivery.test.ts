// @vitest-environment jsdom
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { Blob as NodeBlob } from 'node:buffer'
import { setImmediate } from 'node:timers'
import type { NextRequest } from 'next/server'

const state = vi.hoisted(() => {
  const env = ['NEXT_PUBLIC_GA_MEASUREMENT_ID', 'GA_API_SECRET', 'VERCEL_ENV'] as const
  const previous = Object.fromEntries(env.map(key => [key, process.env[key]]))
  process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID = 'G-SINGLE001'
  process.env.GA_API_SECRET = 'synthetic-test-secret'
  process.env.VERCEL_ENV = 'production'
  return {
    previous, env, cookies: new Map<string, string>(),
    user: { id: 'fixture-auth-user' } as { id: string } | null,
    profile: { id: 'fixture-member-profile', web_role: 'none' } as { id: string; web_role: string } | null,
    team: null as { profile_id: string } | null,
    ledgerError: false, inserted: new Map<string, Record<string, unknown>>(),
    beaconBodies: [] as Array<{ text(): Promise<string> }>,
    browserGoogle: vi.fn(), fetch: vi.fn(), hasConsent: vi.fn(),
  }
})

vi.mock('next/headers', () => ({ cookies: async () => ({
  get: (name: string) => state.cookies.has(name) ? { value: state.cookies.get(name) } : undefined,
}) }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({
  auth: { getUser: async () => ({ data: { user: state.user }, error: null }) },
  from(table: string) {
    if (table !== 'profiles') throw new Error('Unexpected session table: ' + table)
    const query = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: state.profile, error: null }) }
    return query
  },
}) }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from(table: string) {
  if (table === 'team_members') {
    const query = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: state.team, error: null }) }
    return query
  }
  if (table !== 'engagement_events') throw new Error('Unexpected admin table: ' + table)
  const query = {
    select: () => query, eq: () => query,
    maybeSingle: async () => ({ data: { id: 'existing-row' }, error: null }),
    upsert: (row: Record<string, unknown>, options: Record<string, unknown>) => ({ select: async () => {
      expect(options).toEqual({ onConflict: 'idempotency_key', ignoreDuplicates: true })
      if (state.ledgerError) return { data: null, error: new Error('Ledger unavailable') }
      const key = String(row.idempotency_key)
      if (state.inserted.has(key)) return { data: [], error: null }
      state.inserted.set(key, row)
      return { data: [{ id: 'new-row' }], error: null }
    } }),
  }
  return query
} }) }))
vi.mock('@/lib/consent/consent', () => ({ hasConsent: state.hasConsent }))
vi.mock('@/lib/achievements', () => ({ processGamificationEvent: vi.fn() }))
vi.mock('@/lib/automations', () => ({ runAutomationsForEvent: vi.fn() }))

// The tracker, taxonomy, collector, policy, ledger recorder and Google transport are real.
// Only external request/session/database/provider and automation boundaries use fixtures.
import { trackClient } from '@/components/analytics/track-provider'
import { POST } from '@/app/api/track/route'
import { track } from './track'

const beacon = vi.fn((_url: unknown, body: unknown) => {
  state.beaconBodies.push(body as { text(): Promise<string> })
  return true
})
const originalBeacon = Object.getOwnPropertyDescriptor(navigator, 'sendBeacon')

beforeEach(() => {
  vi.clearAllMocks()
  state.cookies.clear()
  state.cookies.set('fq_consent', 'granted')
  state.cookies.set('_ga', 'GA1.1.123.456')
  state.cookies.set('_ga_SINGLE001', 'GS2.1.s1695123456$o1$g1')
  state.user = { id: 'fixture-auth-user' }
  state.profile = { id: 'fixture-member-profile', web_role: 'none' }
  state.team = null
  state.ledgerError = false
  state.inserted.clear()
  state.beaconBodies.length = 0
  state.hasConsent.mockResolvedValue(true)
  state.fetch.mockResolvedValue(new Response(null, { status: 204 }))
  vi.stubGlobal('fetch', state.fetch)
  vi.stubGlobal('Blob', NodeBlob)
  for (const pair of document.cookie.split(';')) document.cookie = pair.split('=')[0].trim() + '=; path=/; max-age=0'
  document.cookie = 'fq_consent=granted; path=/'
  localStorage.clear()
  window.__fqAnalyticsAllowed = true
  window.__fqGoogleEnabled = true
  window.gtag = state.browserGoogle
  delete (window as unknown as Record<string, unknown>)['ga-disable-G-SINGLE001']
  Object.defineProperty(navigator, 'sendBeacon', { configurable: true, value: beacon })
  process.env.VERCEL_ENV = 'production'
})
afterAll(() => {
  vi.unstubAllGlobals()
  if (originalBeacon) Object.defineProperty(navigator, 'sendBeacon', originalBeacon)
  else delete (navigator as unknown as Record<string, unknown>).sendBeacon
  for (const key of state.env) {
    if (state.previous[key] === undefined) delete process.env[key]
    else process.env[key] = state.previous[key]
  }
})

const flush = () => new Promise<void>(resolve => setImmediate(resolve))
const post = async (body: unknown) => {
  const response = await POST(new Request('https://fixture.invalid/api/track', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  }) as unknown as NextRequest)
  await flush()
  return response
}
const deliverBeacon = async () => post(JSON.parse(await state.beaconBodies[0].text()))
const emittedNames = () => state.fetch.mock.calls.map(call => JSON.parse(String(call[1]?.body)).events[0].name as string)
const recordNames = () => [...state.inserted.values()].map(row => row.event_type)

describe('one client action, one Google event and one first-party row', () => {
  it('runs browser to collector to ledger without a second Google mirror', async () => {
    trackClient('feature.used', { feature: 'directory' })
    expect(state.browserGoogle).toHaveBeenCalledExactlyOnceWith('event', 'feature_used', { feature: 'directory' })
    expect(beacon).toHaveBeenCalledOnce()
    expect((await deliverBeacon()).status).toBe(204)
    expect(recordNames()).toEqual(['feature.used'])
    expect([...state.inserted.values()][0]).toMatchObject({ actor_profile_id: 'fixture-member-profile', context: { feature: 'directory' } })
    expect(state.fetch).not.toHaveBeenCalled()
  })
  it('records a direct collector request without creating a second provider identity', async () => {
    expect((await post({ event: 'nav.page_view', props: { path: '/feed' } })).status).toBe(204)
    expect(recordNames()).toEqual(['nav.page_view'])
    expect(state.fetch).not.toHaveBeenCalled()
  })
  it('does not accept a request payload that tries to enable the server mirror', async () => {
    await post({ event: 'feature.used', props: { feature: 'directory', mirrorGa: true }, mirrorGa: true, opts: { mirrorGa: true } })
    expect(state.inserted.size).toBe(1)
    expect(state.fetch).not.toHaveBeenCalled()
  })
  it('keeps first-party recording when the browser tag is unavailable without a server fallback', async () => {
    delete window.gtag
    trackClient('feature.used', { feature: 'directory' })
    expect((await deliverBeacon()).status).toBe(204)
    expect(recordNames()).toEqual(['feature.used'])
    expect(state.fetch).not.toHaveBeenCalled()
  })
  it('keeps first-party recording when Google is disabled for this deployment', async () => {
    window.__fqGoogleEnabled = false
    trackClient('feature.used', { feature: 'directory' })
    expect(state.browserGoogle).not.toHaveBeenCalled()
    await deliverBeacon()
    expect(recordNames()).toEqual(['feature.used'])
    expect(state.fetch).not.toHaveBeenCalled()
  })
  it.each(['account.created', 'lead.captured', 'commerce.purchase', 'event.rsvp'])('still refuses client spoofing of %s', async event => {
    expect((await post({ event, props: {}, opts: { mirrorGa: false } })).status).toBe(400)
    expect(state.inserted.size).toBe(0)
    expect(state.fetch).not.toHaveBeenCalled()
  })
  it.each(['consent', 'staff', 'anonymous'] as const)('retains the actual %s denial before storage or Google', async reason => {
    if (reason === 'consent') state.hasConsent.mockResolvedValue(false)
    if (reason === 'staff') state.team = { profile_id: 'fixture-member-profile' }
    if (reason === 'anonymous') state.user = null
    expect((await post({ event: 'feature.used', props: { feature: 'directory' } })).status).toBe(204)
    expect(state.inserted.size).toBe(0)
    expect(state.fetch).not.toHaveBeenCalled()
  })
  it('does not add a provider hit when a collector ledger write fails', async () => {
    state.ledgerError = true
    expect((await post({ event: 'feature.used', props: {} })).status).toBe(204)
    expect(state.inserted.size).toBe(0)
    expect(state.fetch).not.toHaveBeenCalled()
  })
})

describe('authoritative server callers retain their existing default mirror', () => {
  it('mirrors signup exactly once with its browser identity across durable-key retries', async () => {
    const options = { idempotencyKey: 'account.created:fixture-member-profile', gaIdentity: { clientId: '123.456', sessionId: '1695123456' } }
    expect(await track('account.created', { source: 'oauth' }, 'fixture-member-profile', options)).toBe(true)
    await flush()
    expect(emittedNames()).toEqual(['sign_up'])
    expect(await track('account.created', { source: 'oauth' }, 'fixture-member-profile', options)).toBe(false)
    await flush()
    expect(emittedNames()).toEqual(['sign_up'])
    expect(state.inserted.size).toBe(1)
  })
  it('retains the durable lead conversion default', async () => {
    expect(await track('lead.captured', { source: 'create_space' }, null, {
      idempotencyKey: 'lead.captured:fixture-lead', gaIdentity: { clientId: '123.456', sessionId: null },
    })).toBe(true)
    await flush()
    expect(recordNames()).toEqual(['lead.captured'])
    expect(emittedNames()).toEqual(['generate_lead'])
  })
  it('retains the authoritative purchase default', async () => {
    expect(await track('commerce.purchase', { ga_client_id: '123.456', transaction_id: 'fixture-transaction', value: 25, currency: 'USD' }, 'fixture-member-profile', { idempotencyKey: 'commerce.purchase:fixture-transaction' })).toBe(true)
    await flush()
    expect(recordNames()).toEqual(['commerce.purchase'])
    expect(emittedNames()).toEqual(['purchase'])
  })
  it('allows a trusted caller to request first-party-only recording explicitly', async () => {
    expect(await track('feature.used', { feature: 'directory' }, 'fixture-member-profile', { mirrorGa: false })).toBe(true)
    await flush()
    expect(recordNames()).toEqual(['feature.used'])
    expect(state.fetch).not.toHaveBeenCalled()
  })
})
