import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'

// ── The four commerce sections are WALKED, a page at a time (SCAN-1262) ─────────────────────────
//
// Store, market, housing and classifieds used to stop at one call's 100 rows. This file drives the
// real sitemap through the four REAL readers against a scripted supabase-js boundary that answers
// `.range()` and `.limit()` the way PostgREST does, so the reader's paged query and the sitemap's
// walk are proved together. No database is read.
//
// The pinned SCAN-203 tests in app/sitemap.test.ts use a reader stand-in that returns the same rows
// whatever it is asked; they still hold, and they now pin the walk's "the reader is not paging"
// warning. These tests are the other half: a reader that DOES page.

type Call = { op: string; args: unknown[] }
const sdk = vi.hoisted(() => {
  const state = {
    // What each source holds, newest first. `commerce_products` serves two readers, told apart by
    // the gate each one applies.
    shop: [] as Record<string, unknown>[],
    market: [] as Record<string, unknown>[],
    housing: [] as Record<string, unknown>[],
    classifieds: [] as Record<string, unknown>[],
    reads: [] as { source: string; calls: Call[] }[],
    /** Sources whose answers ignore the range, as a reader with no offset would. */
    deaf: new Set<string>(),
    /** Sources that never run out: every page is full of rows no page before it held. */
    endless: new Set<string>(),
  }
  function sourceOf(table: string, calls: Call[]): string {
    if (table === 'commerce_products') {
      return calls.some((c) => c.op === 'eq' && c.args[0] === 'owner_kind' && c.args[1] === 'platform') ? 'shop' : 'market'
    }
    if (table === 'listings') return 'housing'
    if (table === 'market_listings') return 'classifieds'
    return table
  }
  function query(table: string) {
    const calls: Call[] = []
    const api: Record<string, unknown> = {}
    for (const op of ['select', 'eq', 'neq', 'in', 'is', 'or', 'gte', 'lte', 'filter', 'contains', 'ilike', 'order', 'limit', 'range']) {
      api[op] = (...args: unknown[]) => { calls.push({ op, args }); return api }
    }
    api.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => {
      const source = sourceOf(table, calls)
      state.reads.push({ source, calls })
      const held = (state as unknown as Record<string, Record<string, unknown>[] | undefined>)[source]
      let data: Record<string, unknown>[] = Array.isArray(held) ? held : []
      const range = calls.find((c) => c.op === 'range')
      const limit = calls.find((c) => c.op === 'limit')
      if (range) {
        const [from, to] = range.args as [number, number]
        if (state.endless.has(source)) {
          data = Array.from({ length: to - from + 1 }, (_, i) => ({ id: `${source}-${from + i}`, images: [] }))
        } else if (!state.deaf.has(source)) {
          data = data.slice(from, to + 1)
        } else {
          data = data.slice(0, to - from + 1)
        }
      } else if (limit) {
        data = data.slice(0, limit.args[0] as number)
      }
      return Promise.resolve({ data, error: null, status: 200 }).then(resolve, reject)
    }
    return api
  }
  const client = {
    from: query,
    rpc: (name: string) => query(name),
    storage: { from: () => ({ getPublicUrl: (ref: string) => ({ data: { publicUrl: `https://cdn.invalid/${ref}` } }) }) },
  }
  return { state, client }
})
const help = vi.hoisted(() => ({
  articles: [] as { category: string; slug: string; updated: string; canonical?: string }[],
  categories: [] as { slug: string }[],
}))

vi.mock('@/lib/supabase/public', () => ({ createPublicClient: () => sdk.client }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => sdk.client }))
vi.mock('@/lib/listing-seeder/seed-owner', () => ({ resolveSeedOwnerProfileId: async () => null }))
vi.mock('@/lib/events/series-config', () => ({ getSeriesDisplayConfig: async () => ({ indexedOccurrences: 2 }) }))
vi.mock('@/lib/practices', () => ({ listPublicPractices: async () => [] }))
vi.mock('@/lib/spaces/discovery', () => ({ DISCOVERY_FETCH_LIMIT: 200, listNetworkedSpaces: async () => [], listNetworkedSpaceProfileTabs: async () => [] }))
vi.mock('@/lib/airwaves/shows', () => ({ listPublicShowsBySpace: async () => new Map() }))
vi.mock('@/lib/help/content', () => ({ getAllArticles: async () => help.articles, getAllCategories: async () => help.categories }))
vi.mock('@/app/discover/events/_data', () => ({ getCityCategoryHubs: async () => [] }))
vi.mock('@/app/discover/cities/_towns', () => ({ listDiscoverCities: async () => [] }))
vi.mock('@/app/discover/cities/_data', () => ({ listDensityCities: async () => [] }))

import sitemap from './sitemap'
import { SITE_URL as SITE } from '@/lib/site'
import { listShopProducts, listMarketListings } from '@/lib/commerce/products'
import { listHousingListings } from '@/lib/listings/housing'
import { listListings } from '@/lib/marketplace'

function rows(prefix: string, n: number, extra: Record<string, unknown> = {}) {
  return Array.from({ length: n }, (_, i) => ({ id: `${prefix}-${i}`, images: [], ...extra }))
}
const readsOf = (source: string) => sdk.state.reads.filter((r) => r.source === source)
const rangesOf = (source: string) => readsOf(source).map((r) => r.calls.find((c) => c.op === 'range')?.args)
const under = (entries: Awaited<ReturnType<typeof sitemap>>, path: string) => entries.filter((e) => e.url.startsWith(`${SITE}/${path}/`))

let warn: { mock: { calls: unknown[][] } }
beforeEach(() => {
  sdk.state.shop = []; sdk.state.market = []; sdk.state.housing = []; sdk.state.classifieds = []
  sdk.state.reads = []; sdk.state.deaf.clear(); sdk.state.endless.clear()
  help.articles = []; help.categories = []
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => { vi.restoreAllMocks() })

describe('app/sitemap commerce walk, through the real readers', () => {
  it('names every listing past the first 100 in all four sections', async () => {
    sdk.state.shop = rows('shop', 250)
    sdk.state.market = rows('market', 101, { product_kind: 'physical' })
    sdk.state.housing = rows('housing', 200)
    sdk.state.classifieds = rows('classified', 130)

    const entries = await sitemap()

    expect(under(entries, 'store')).toHaveLength(250)
    expect(under(entries, 'market')).toHaveLength(101)
    expect(under(entries, 'housing')).toHaveLength(200)
    expect(under(entries, 'classifieds')).toHaveLength(130)
    // The oldest row, the one that used to fall off the end, is there.
    expect(entries.map((e) => e.url)).toContain(`${SITE}/store/shop-249`)
    // No URL twice.
    const urls = entries.map((e) => e.url)
    expect(new Set(urls).size).toBe(urls.length)

    // A page at a time, and the walk ends on the first short page. 200 housing rows are two FULL
    // pages, so a third (empty) read is what proves there is no more.
    expect(rangesOf('shop')).toEqual([[0, 99], [100, 199], [200, 299]])
    expect(rangesOf('market')).toEqual([[0, 99], [100, 199]])
    expect(rangesOf('housing')).toEqual([[0, 99], [100, 199], [200, 299]])
    expect(rangesOf('classifieds')).toEqual([[0, 99], [100, 199]])
    // Nothing was cut short, so nothing is said.
    expect(warn.mock.calls.map((c) => String(c[0])).filter((l) => l.startsWith('sitemap:'))).toEqual([])
  })

  it('reads a section under one page exactly once', async () => {
    sdk.state.shop = rows('shop', 3)

    const entries = await sitemap()

    expect(under(entries, 'store')).toHaveLength(3)
    for (const source of ['shop', 'market', 'housing', 'classifieds']) expect(rangesOf(source)).toEqual([[0, 99]])
  })

  it('pages every section by created_at then id, under the same gates as the first page', async () => {
    sdk.state.shop = rows('shop', 150)
    sdk.state.market = rows('market', 150)
    sdk.state.housing = rows('housing', 150)
    sdk.state.classifieds = rows('classified', 150)

    await sitemap()

    for (const source of ['shop', 'market', 'housing', 'classifieds']) {
      const [first, second] = readsOf(source).map((r) => r.calls)
      const gates = (calls: Call[]) => calls.filter((c) => c.op !== 'range')
      // Page two is page one's query with a different range and nothing else.
      expect(gates(second)).toEqual(gates(first))
      expect(first.filter((c) => c.op === 'order').map((c) => c.args)).toEqual([
        ['created_at', { ascending: false }],
        ['id', { ascending: false }],
      ])
      expect(first.some((c) => c.op === 'eq' && c.args[0] === 'status' && c.args[1] === 'active')).toBe(true)
    }
    expect(readsOf('shop')[0].calls).toContainEqual({ op: 'eq', args: ['owner_kind', 'platform'] })
    expect(readsOf('market')[0].calls).toContainEqual({ op: 'eq', args: ['market_published', true] })
    expect(readsOf('housing')[0].calls).toContainEqual({ op: 'eq', args: ['vertical', 'housing'] })
  })

  it('names a row once when a new listing shifts it onto the next page', async () => {
    // Page two opens with the row page one ended on, as it does when one listing is published
    // between the two calls.
    const all = rows('shop', 150)
    sdk.state.shop = [...all.slice(0, 100), all[99], ...all.slice(100)]

    const entries = await sitemap()

    expect(under(entries, 'store')).toHaveLength(150)
    expect(under(entries, 'store').filter((e) => e.url === `${SITE}/store/shop-99`)).toHaveLength(1)
  })

  it('stops at its ceiling and says so, once, for that section only', async () => {
    sdk.state.endless.add('shop')

    const entries = await sitemap()

    expect(under(entries, 'store')).toHaveLength(5000)
    expect(readsOf('shop')).toHaveLength(50)
    const lines = warn.mock.calls.map((c) => String(c[0])).filter((l) => l.startsWith('sitemap:'))
    expect(lines).toHaveLength(1)
    expect(lines[0]).toContain('store products')
    expect(lines[0]).toContain('cap of 5000')
    expect(lines[0]).toContain('walkCommercePages')
  })

  it('stops, and says which reader, when a page past the first holds nothing new', async () => {
    sdk.state.classifieds = rows('classified', 100)
    sdk.state.deaf.add('classifieds')

    const entries = await sitemap()

    expect(under(entries, 'classifieds')).toHaveLength(100)
    // Two reads, not fifty.
    expect(readsOf('classifieds')).toHaveLength(2)
    const lines = warn.mock.calls.map((c) => String(c[0])).filter((l) => l.includes('classifieds'))
    expect(lines).toHaveLength(1)
    expect(lines[0]).toContain('listListings')
  })
})

describe('the four readers, asked without an offset', () => {
  it('make the same limited read as before: no range, no second order', async () => {
    sdk.state.shop = rows('shop', 150)
    sdk.state.market = rows('market', 150)
    sdk.state.housing = rows('housing', 150)
    sdk.state.classifieds = rows('classified', 150)

    expect(await listShopProducts({ limit: 500 })).toHaveLength(100)
    expect(await listMarketListings({ limit: 500 })).toHaveLength(100)
    expect(await listHousingListings({ limit: 500 })).toHaveLength(100)
    expect(await listListings({ limit: 20 })).toHaveLength(20)

    for (const read of sdk.state.reads) {
      expect(read.calls.some((c) => c.op === 'range')).toBe(false)
      expect(read.calls.filter((c) => c.op === 'order').map((c) => c.args)).toEqual([['created_at', { ascending: false }]])
    }
    expect(sdk.state.reads.map((r) => r.calls.find((c) => c.op === 'limit')?.args)).toEqual([[100], [100], [100], [20]])
  })

  it('treat a negative or fractional offset as a whole row count from zero', async () => {
    sdk.state.shop = rows('shop', 10)
    await listShopProducts({ limit: 5, offset: -3 })
    await listShopProducts({ limit: 5, offset: 2.9 })
    expect(rangesOf('shop')).toEqual([[0, 4], [2, 6]])
  })
})

describe('app/sitemap help category lastmod', () => {
  const entry = async (slug: string) => (await sitemap()).find((e) => e.url === `${SITE}/help/${slug}`)

  it('stamps a category with its newest article date', async () => {
    help.categories = [{ slug: 'spaces' }, { slug: 'events' }]
    help.articles = [
      { category: 'spaces', slug: 'a', updated: '2026-03-02' },
      { category: 'spaces', slug: 'b', updated: '2026-09-14' },
      { category: 'spaces', slug: 'c', updated: '2025-12-31' },
      { category: 'events', slug: 'd', updated: '2026-01-05' },
    ]

    expect((await entry('spaces'))?.lastModified).toEqual(new Date('2026-09-14'))
    expect((await entry('events'))?.lastModified).toEqual(new Date('2026-01-05'))
  })

  it('counts an article whose canonical is elsewhere, because the category page lists it', async () => {
    help.categories = [{ slug: 'spaces' }]
    help.articles = [
      { category: 'spaces', slug: 'a', updated: '2026-03-02' },
      { category: 'spaces', slug: 'twin', updated: '2026-10-01', canonical: '/pricing' },
    ]

    expect((await entry('spaces'))?.lastModified).toEqual(new Date('2026-10-01'))
  })

  it('emits no lastmod for a category with no usable date, and never one ahead of the clock', async () => {
    help.categories = [{ slug: 'empty' }, { slug: 'undated' }, { slug: 'future' }]
    help.articles = [
      { category: 'undated', slug: 'a', updated: '' },
      { category: 'undated', slug: 'b', updated: 'soon' },
      { category: 'future', slug: 'c', updated: '2999-01-01' },
      { category: 'future', slug: 'd', updated: '2026-02-02' },
    ]

    for (const slug of ['empty', 'undated']) {
      const e = await entry(slug)
      expect(e).toBeDefined()
      expect(e).not.toHaveProperty('lastModified')
    }
    expect((await entry('future'))?.lastModified).toEqual(new Date('2026-02-02'))
  })
})
