import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
const state = vi.hoisted(() => {
  const keys = ['NEXT_PUBLIC_GA_MEASUREMENT_ID', 'GA_API_SECRET', 'VERCEL_ENV'] as const
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]))
  process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID = 'G-PURCHASETEST'
  process.env.GA_API_SECRET = 'fixture-secret'
  process.env.VERCEL_ENV = 'production'
  return { keys, previous, inserted: new Map<string, Record<string, unknown>>(), failed: false, consent: true, fetch: vi.fn() }
})
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: (table: string) => {
  expect(table).toBe('engagement_events')
  const query = {
    select: () => query, eq: () => query,
    maybeSingle: async () => ({ data: { id: 'existing' }, error: null }),
    upsert: (row: Record<string, unknown>, options: unknown) => ({ select: async () => {
      expect(options).toEqual({ onConflict: 'idempotency_key', ignoreDuplicates: true })
      if (state.failed) return { data: null, error: new Error('Ledger unavailable') }
      const key = String(row.idempotency_key)
      if (state.inserted.has(key)) return { data: [], error: null }
      state.inserted.set(key, row)
      return { data: [{ id: 'new' }], error: null }
    } }),
  }
  return query
} }) }))
vi.mock('@/lib/achievements', () => ({ processGamificationEvent: vi.fn() }))
vi.mock('@/lib/automations', () => ({ runAutomationsForEvent: vi.fn() }))
vi.mock('@/lib/consent/consent', () => ({ hasConsent: async () => state.consent }))
import { purchaseConversionFromSession } from './purchase'
import { track } from './track'
const session = (extra: Record<string, string> = {}) => ({
  id: 'cs_fixture_paid', payment_status: 'paid', amount_total: 2500, currency: 'usd',
  metadata: { profile_id: 'fixture-profile', ga_client_id: '123.456', ga_session_id: '1695123456', ...extra },
})
async function settle(input = session()) {
  const conversion = purchaseConversionFromSession(input)
  if (!conversion) return false
  return track(conversion.event, conversion.props, conversion.actorProfileId, { idempotencyKey: conversion.idempotencyKey })
}
const payload = () => JSON.parse(String(state.fetch.mock.calls[0]?.[1]?.body))
beforeEach(() => {
  vi.clearAllMocks(); state.inserted.clear(); state.failed = false; state.consent = true
  process.env.VERCEL_ENV = 'production'
  state.fetch.mockResolvedValue(new Response(null, { status: 204 }))
  vi.stubGlobal('fetch', state.fetch)
})
afterAll(() => {
  vi.unstubAllGlobals()
  for (const key of state.keys) {
    if (state.previous[key] === undefined) delete process.env[key]
    else process.env[key] = state.previous[key]
  }
})
describe('paid checkout through actual conversion, ledger, tracker and Google transport', () => {
  it('joins the original browser session using standard GA fields', async () => {
    expect(await settle()).toBe(true)
    await vi.waitFor(() => expect(state.fetch).toHaveBeenCalledTimes(1))
    expect(payload()).toMatchObject({ client_id: '123.456', user_id: 'fixture-profile', events: [{ name: 'purchase', params: { session_id: '1695123456', engagement_time_msec: 1, transaction_id: 'cs_fixture_paid', value: 25, currency: 'usd' } }] })
    expect(payload().events[0].params).not.toHaveProperty('ga_session_id')
    expect(payload().events[0].params).not.toHaveProperty('ga_client_id')
    expect(state.inserted.get('commerce.purchase:cs_fixture_paid')).toMatchObject({ context: { ga_session_id: '1695123456' } })
  })
  it.each(['', 'private-persona', '1695123456$other', '123', '12345678.9'])('omits invalid session %j without losing a paid fact', async invalid => {
    expect(await settle(session({ ga_session_id: invalid }))).toBe(true)
    await vi.waitFor(() => expect(state.fetch).toHaveBeenCalledTimes(1))
    expect(payload().events[0].params).not.toHaveProperty('session_id')
    expect(payload().events[0].params).not.toHaveProperty('ga_session_id')
    expect(payload().events[0].params).not.toHaveProperty('engagement_time_msec')
    expect(payload().client_id).toBe('123.456')
  })
  it.each(['', 'invalid-client'])('does not attach a session without a valid browser client (%j)', async client => {
    expect(await settle(session({ ga_client_id: client }))).toBe(true)
    await vi.waitFor(() => expect(state.fetch).toHaveBeenCalledTimes(1))
    expect(payload().events[0].params).not.toHaveProperty('session_id')
    expect(payload().events[0].params).not.toHaveProperty('ga_session_id')
  })
  it('does not mirror a duplicate settlement', async () => {
    await settle(); await settle()
    await vi.waitFor(() => expect(state.fetch).toHaveBeenCalledTimes(1))
    expect(state.inserted.size).toBe(1)
  })
  it('does not mirror when member consent is declined', async () => {
    state.consent = false
    expect(await settle()).toBe(true)
    expect(state.fetch).not.toHaveBeenCalled()
  })
  it('does not mirror a failed ledger insert', async () => {
    state.failed = true
    expect(await settle()).toBe(false)
    expect(state.fetch).not.toHaveBeenCalled()
  })
  it('does not record an unpaid settlement', async () => {
    expect(await settle({ ...session(), payment_status: 'unpaid' })).toBe(false)
    expect(state.inserted.size).toBe(0)
    expect(state.fetch).not.toHaveBeenCalled()
  })
  it('does not send preview traffic to Google', async () => {
    process.env.VERCEL_ENV = 'preview'
    expect(await settle()).toBe(true)
    expect(state.fetch).not.toHaveBeenCalled()
  })
})
