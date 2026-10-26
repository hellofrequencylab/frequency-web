import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'

// Drive the five production readers AND the real sitemap through a scripted SDK boundary.
// No database, provider call, RLS claim or deployed cache behavior is simulated as proof.
const sdk = vi.hoisted(() => {
  type Answer = { data: unknown; error: unknown; status?: number }
  const state = { target: '', answer: { data: [], error: null } as Answer, thrown: false,
    reads: [] as string[], calls: [] as { table: string; op: string; args: unknown[] }[] }
  function query(table: string) {
    const record = (op: string, args: unknown[]) => { state.calls.push({ table, op, args }); return api }
    const api = {
      select: (...args: unknown[]) => record('select', args),
      eq: (...args: unknown[]) => record('eq', args),
      neq: (...args: unknown[]) => record('neq', args),
      is: (...args: unknown[]) => record('is', args),
      gte: (...args: unknown[]) => record('gte', args),
      filter: (...args: unknown[]) => record('filter', args),
      order: (...args: unknown[]) => record('order', args),
      limit: (...args: unknown[]) => record('limit', args),
      then: (resolve: (answer: Answer) => unknown, reject?: (error: unknown) => unknown) => {
        state.reads.push(table)
        const result = table === state.target
          ? state.thrown ? Promise.reject(new TypeError('fetch failed')) : Promise.resolve(state.answer)
          : Promise.resolve({ data: [], error: null })
        return result.then(resolve, reject)
      },
    }
    return api
  }
  return { state, client: { from: query, rpc: (table: string, args: unknown) => {
    state.calls.push({ table, op: 'rpc', args: [args] }); return query(table)
  } } }
})
vi.mock('@/lib/supabase/public', () => ({ createPublicClient: () => sdk.client }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => sdk.client }))
vi.mock('@/lib/events/series-config', () => ({ getSeriesDisplayConfig: async () => ({ indexedOccurrences: 2 }) }))
vi.mock('@/lib/practices', () => ({ listPublicPractices: async () => [], adoptPracticesForJourney: vi.fn(), retireJourneyPracticeRows: vi.fn() }))
vi.mock('@/lib/spaces/discovery', () => ({ DISCOVERY_FETCH_LIMIT: 200, listNetworkedSpaces: async () => [], listNetworkedSpaceProfileTabs: async () => [] }))
vi.mock('@/lib/commerce/products', () => ({ listShopProducts: async () => [], listMarketListings: async () => [] }))
vi.mock('@/lib/listings/housing', () => ({ listHousingListings: async () => [] }))
vi.mock('@/lib/marketplace', () => ({ listListings: async () => [] }))
vi.mock('@/lib/airwaves/shows', () => ({ listPublicShowsBySpace: async () => new Map() }))
vi.mock('@/lib/help/content', () => ({ getAllArticles: async () => [], getAllCategories: async () => [] }))
vi.mock('@/app/discover/events/_data', () => ({ getCityCategoryHubs: async () => [] }))
vi.mock('@/app/discover/cities/_towns', () => ({ listDiscoverCities: async () => [] }))
vi.mock('@/app/discover/cities/_data', () => ({ listDensityCities: async () => [] }))

import sitemap from './sitemap'
import { getTopicalChannels, getPublicCircles } from '@/lib/discover'
import { listSitemapEventEntries } from '@/lib/events/series-seo'
import { listPublicJourneys } from '@/lib/journey-plans'
import { listPublishedSpotlightHandles } from '@/lib/spotlight/data'

const cases = [
  { table: 'topical_channels', read: () => getTopicalChannels() },
  { table: 'public_circles', read: () => getPublicCircles(200) },
  { table: 'events', read: () => listSitemapEventEntries({ occurrences: 2 }) },
  { table: 'journey_plans', read: () => listPublicJourneys() },
  { table: 'profiles', read: () => listPublishedSpotlightHandles(1000) },
]
beforeEach(() => {
  vi.useFakeTimers()
  sdk.state.target = ''; sdk.state.answer = { data: [], error: null }; sdk.state.thrown = false
  sdk.state.reads = []; sdk.state.calls = []
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

describe.each(cases)('actual $table sitemap reader', ({ table, read }) => {
  it('keeps healthy empty quiet', async () => {
    sdk.state.target = table
    expect((await sitemap()).length).toBeGreaterThan(0)
    expect(sdk.state.reads).toContain(table)
    expect(console.error).not.toHaveBeenCalled()
  })
  it('keeps deterministic errors section-local even at HTTP503', async () => {
    sdk.state.target = table
    sdk.state.answer = { data: null, error: { code: '42501', message: 'permission denied' }, status: 503 }
    expect((await sitemap()).length).toBeGreaterThan(0)
    expect(sdk.state.reads.filter(t => t === table)).toHaveLength(1)
    expect(console.error).toHaveBeenCalled()
  })
  it.each(['status', 'resolved-network', 'thrown-network'])('abandons regeneration on %s failure after retries', async mode => {
    sdk.state.target = table
    sdk.state.thrown = mode === 'thrown-network'
    sdk.state.answer = { data: null, error: mode === 'status' ? { message: 'edge unavailable' } : { code: '', message: 'TypeError: fetch failed' }, status: mode === 'status' ? 503 : 0 }
    const assertion = expect(sitemap()).rejects.toThrow('regeneration abandoned')
    await vi.runAllTimersAsync()
    await assertion
    expect(sdk.state.reads.filter(t => t === table)).toHaveLength(4)
  })
  it('preserves legacy default caller fallback on resolved failure', async () => {
    sdk.state.target = table
    sdk.state.answer = { data: null, error: { message: 'permission denied', code: '42501' }, status: 403 }
    expect(await read()).toEqual([])
  })
})

it('retains the public/publish gates and deliberate limits in actual reader queries', async () => {
  await sitemap()
  const calls = (table: string, op: string) => sdk.state.calls.filter(c => c.table === table && c.op === op).map(c => c.args)
  expect(calls('topical_channels', 'eq')).toContainEqual(['is_active', true])
  expect(calls('public_circles', 'rpc')).toEqual([[{ _limit: 200 }]])
  expect(calls('events', 'eq')).toEqual(expect.arrayContaining([['status', 'published'], ['visibility', 'public'], ['is_cancelled', false]]))
  expect(calls('events', 'is')).toContainEqual(['removed_at', null])
  expect(calls('journey_plans', 'eq')).toContainEqual(['visibility', 'public'])
  expect(calls('journey_plans', 'neq')).toContainEqual(['status', 'rejected'])
  expect(calls('profiles', 'select')).toEqual([['handle']])
  expect(calls('profiles', 'eq')).toEqual([['is_active', true], ['is_system', false]])
  expect(calls('profiles', 'filter')).toEqual([['meta->spotlight->>published', 'eq', 'true']])
  expect(calls('profiles', 'limit')).toEqual([[1000]])
})

it('still emits a healthy one-off through the actual event fold and sitemap mapper', async () => {
  sdk.state.target = 'events'
  sdk.state.answer = { data: [{ id: 'event-1', slug: 'healthy-future', starts_at: '2099-01-01T12:00:00Z', ends_at: '2099-01-01T13:00:00Z', time_zone: 'UTC', is_cancelled: false, cover_image_path: null, recurrence_type: null, recurrence_until: null, parent_event_id: null }], error: null, status: 200 }
  expect((await sitemap()).some(entry => entry.url.endsWith('/events/healthy-future'))).toBe(true)
})

it('still emits published handles and ignores null or empty handles', async () => {
  sdk.state.target = 'profiles'
  sdk.state.answer = { data: [{ handle: 'published-host' }, { handle: null }, { handle: '' }], error: null, status: 200 }
  const entries = await sitemap()
  expect(entries.filter(entry => entry.url.includes('/spotlight/')).map(entry => entry.url.split('/').at(-1))).toEqual(['published-host'])
})
