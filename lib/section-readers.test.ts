import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'

// ── The sitemap section readers report a failed read as failed (LIVE-331) ─────────────────────
//
// app/sitemap.ts sorts a THROWN failure into transport (rethrow, keep the last good copy) and
// deterministic (log, empty that section) since LIVE-329. Measured while building that seam:
// none of its catches could fire, because every section reader resolved a supabase-js transport
// error into `[]` INSIDE itself (`const { data } = await q; return data ?? []`, or a bare
// `catch { return [] }`). The same readers feed the /discover pages, whose ISR copies cached the
// same hollow list for an hour.
//
// These tests run each REAL reader against a scripted client and prove the three outcomes the
// row asks for, per reader:
//   · a TRANSPORT failure (the REST edge's own 503, LIVE-327's fixture) is reported: the reader
//     retries through the discover ladder and then throws TransientReadError, status 503;
//   · a DETERMINISTIC failure (a real PostgREST code) still yields [] on the first answer, with
//     the reader's own log line, so no page goes down on a database answer;
//   · an EMPTY result is [] and logs nothing.
// Only the two Supabase clients are mocked, so the classifier, the ladder and the shape the
// reader throws are production's. The ladder's sleeps are real setTimeouts, run under fake
// timers here.

// The exact object supabase-js resolves when Supabase's REST edge answers 503 because PostgREST
// did not accept the connection (dpl_E8n9LESJ, 2026-09-14; the fixture lives in
// lib/discover.test.ts as REST_EDGE_503). Empty code and hint, the edge's body as the message.
const REST_EDGE_503 = {
  message: 'upstream connect error or disconnect/reset before headers. reset reason: connection timeout',
  details: '',
  hint: '',
  code: '',
}
const PERMISSION_DENIED = { code: '42501', message: 'permission denied for table partners', details: '', hint: '' }

type Answer = { data: unknown; error: unknown; status?: number }

// A scripted supabase-js stand-in: every builder method chains, and the await ends the chain by
// resolving the answer scripted for that table or RPC (default: a healthy empty read). It is
// THENABLE rather than resolving on a terminal method because the real PostgREST builder is, and
// because the readers hand `listReadFailClosed` a thunk whose every call must build a fresh one.
const script = vi.hoisted(() => {
  const state = {
    answers: {} as Record<string, Answer>,
    calls: [] as string[],
  }
  const METHODS = ['select', 'eq', 'neq', 'in', 'is', 'or', 'gt', 'gte', 'lte', 'order', 'limit', 'contains', 'ilike', 'filter', 'maybeSingle', 'single']
  function builder(source: string) {
    const api: Record<string, unknown> = {}
    for (const m of METHODS) api[m] = () => api
    api.then = (resolve: (v: Answer) => unknown, reject?: (e: unknown) => unknown) => {
      state.calls.push(source)
      const answer = state.answers[source] ?? { data: [], error: null, status: 200 }
      return Promise.resolve(answer).then(resolve, reject)
    }
    return api
  }
  const client = {
    from: (table: string) => builder(table),
    rpc: (name: string) => builder(name),
    storage: { from: () => ({ getPublicUrl: () => ({ data: { publicUrl: null } }) }) },
  }
  return { state, client }
})

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => script.client }))
vi.mock('@/lib/supabase/public', () => ({ createPublicClient: () => script.client }))
// The two listing readers resolve the seed owner beside their read (process-memoized, its own
// admin read); it is not the read under test.
vi.mock('@/lib/listing-seeder/seed-owner', () => ({ resolveSeedOwnerProfileId: async () => null }))

import { listActivePartners } from '@/lib/partners/read'
import { listPublicPractices } from '@/lib/practices'
import { listNetworkedSpaces, listNetworkedSpaceProfileTabs } from '@/lib/spaces/discovery'
import { listShopProducts, listMarketListings } from '@/lib/commerce/products'
import { listHousingListings } from '@/lib/listings/housing'
import { listListings } from '@/lib/marketplace'
import { getDensitySignal } from '@/lib/analytics/density'
import { getCityCategoryHubs } from '@/app/discover/events/_data'
import { __retryForTest } from '@/lib/discover'

/** One row per reader the sitemap chains: the module, the exported function, the table or RPC
 *  its section read hits, and how to run it. The source-shape pin locates `pin` when the read
 *  lives in a private helper (the hub reader folds `getUpcomingSafeEvents`), else `fn`. */
const READERS: { file: string; fn: string; pin?: string; source: string; run: () => Promise<unknown[]> }[] = [
  { file: 'lib/partners/read.ts', fn: 'listActivePartners', source: 'partners', run: () => listActivePartners({ limit: 500 }) },
  { file: 'lib/practices.ts', fn: 'listPublicPractices', source: 'practices_ranked', run: () => listPublicPractices('top') },
  { file: 'lib/spaces/discovery.ts', fn: 'listNetworkedSpaces', source: 'spaces', run: () => listNetworkedSpaces() },
  { file: 'lib/spaces/discovery.ts', fn: 'listNetworkedSpaceProfileTabs', source: 'spaces', run: () => listNetworkedSpaceProfileTabs() },
  { file: 'lib/commerce/products.ts', fn: 'listShopProducts', source: 'commerce_products', run: () => listShopProducts({ limit: 500 }) },
  { file: 'lib/commerce/products.ts', fn: 'listMarketListings', source: 'commerce_products', run: () => listMarketListings({ limit: 500 }) },
  { file: 'lib/listings/housing.ts', fn: 'listHousingListings', source: 'listings', run: () => listHousingListings({ limit: 500 }) },
  { file: 'lib/marketplace.ts', fn: 'listListings', source: 'market_listings', run: () => listListings({ limit: 500 }) },
  { file: 'lib/analytics/density.ts', fn: 'getDensitySignal', source: 'density_by_city', run: async () => (await getDensitySignal()).places },
  { file: 'app/discover/events/_data.ts', fn: 'getCityCategoryHubs', pin: 'getUpcomingSafeEvents', source: 'events', run: () => getCityCategoryHubs() },
]

const LADDER = __retryForTest.RETRY_DELAYS_MS.length

beforeEach(() => {
  script.state.answers = {}
  script.state.calls = []
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe.each(READERS)('$fn ($file)', ({ source, run }) => {
  it('reports a TRANSPORT failure: the ladder runs out and TransientReadError is thrown with the status', async () => {
    vi.useFakeTimers()
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    script.state.answers[source] = { data: null, error: REST_EDGE_503, status: 503 }

    const pending = expect(run()).rejects.toMatchObject({
      name: 'TransientReadError',
      status: 503,
      cause: REST_EDGE_503,
    })
    await vi.runAllTimersAsync()
    await pending

    // One try plus the whole ladder, each against a FRESH builder: the retry was a retry.
    expect(script.state.calls.filter((c) => c === source)).toHaveLength(LADDER + 1)
    expect(error.mock.calls.filter((c) => String(c[0]).includes('transient failure, retrying'))).toHaveLength(LADDER)
  })

  it('a DETERMINISTIC failure still yields [] on the first answer, with a log line naming the read', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    script.state.answers[source] = { data: null, error: PERMISSION_DENIED, status: 403 }

    expect(await run()).toEqual([])

    expect(script.state.calls.filter((c) => c === source)).toHaveLength(1)
    const failed = error.mock.calls.filter((c) => /^\[discover\] \S+ failed$/.test(String(c[0])))
    expect(failed).toHaveLength(1)
    expect(failed[0][1]).toBe(PERMISSION_DENIED)
  })

  it('an EMPTY result is [] and logs nothing', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    script.state.answers[source] = { data: [], error: null, status: 200 }

    expect(await run()).toEqual([])
    expect(error).not.toHaveBeenCalled()
  })
})

describe('a healthy read still resolves rows (the positive control for the [] assertions above)', () => {
  it('listActivePartners maps the rows it is given', async () => {
    script.state.answers.partners = {
      data: [{ id: 'p1', slug: 'meld', name: 'Meld', category: 'cafe', city: 'Encinitas', description: null }],
      error: null,
      status: 200,
    }
    const rows = await listActivePartners({ limit: 500 })
    expect(rows.map((r) => r.slug)).toEqual(['meld'])
  })
})

// ── Source-shape pin ───────────────────────────────────────────────────────────────────────────
//
// The behaviour above is what matters; this pins the SHAPE so the swallow cannot creep back into
// one reader while the others keep the tests green. Each named function must read through
// `listReadFailClosed` and must not contain the two forms that resolved a failure into []: the
// `{ data } = await` destructure (and its `.data as` twin) and a bare `catch { return [] }`.
describe('source shape: no section reader swallows a failed read into an empty list', () => {
  const SWALLOWS: [string, RegExp][] = [
    ['`{ data } = await` destructure', /\{\s*data(?::\s*\w+)?\s*\}\s*=\s*await/],
    ['`.data as` cast of an awaited builder', /\)\s*\.data\s+as\b/],
    ['bare `catch { return [] }`', /catch\s*(?:\(\w*\))?\s*\{\s*return \[\]/],
    ['`.catch(() => [])`', /\.catch\(\(\) => \[\]\)/],
  ]

  /** The named function's body, from its declaration to the next closing brace or paren that
   *  stands alone on a line at column 0 (a multi-line signature's `)` is followed by the return
   *  type, so it does not end the slice). */
  function body(src: string, fn: string): string {
    const start = src.search(new RegExp(`(?:export )?(?:async function|const) ${fn}\\b`))
    if (start < 0) throw new Error(`${fn} not found`)
    const end = src.slice(start).search(/\n[})],?\s*\n/)
    return src.slice(start, end < 0 ? undefined : start + end + 2)
  }

  it.each(READERS)('$fn in $file reads through listReadFailClosed and keeps no swallow', ({ file, fn, pin }) => {
    const src = readFileSync(file, 'utf8')
    const fnBody = body(src, pin ?? fn)
    expect(fnBody).toContain('listReadFailClosed')
    for (const [label, re] of SWALLOWS) {
      expect(fnBody, `${fn}: ${label}`).not.toMatch(re)
    }
  })

  it('the row\'s own probe: every listed file names the classifier or a typed ReadError', () => {
    const files = [...new Set(READERS.map((r) => r.file))]
    for (const f of files) {
      expect(readFileSync(f, 'utf8'), f).toMatch(/isTransientDiscoverError|isTransientDiscoverStatus|ok: false|ReadError/)
    }
  })

  it('the pin can fail: the pre-fix shape is caught', () => {
    const before = "export async function listActivePartners() {\n  const { data } = await q\n  return data ?? []\n}\n"
    expect(body(before, 'listActivePartners')).toMatch(SWALLOWS[0][1])
    const swallow = 'export const listNetworkedSpaces = cache(\n  async () => {\n    try {\n      return []\n    } catch {\n      return []\n    }\n  },\n)\n'
    expect(body(swallow, 'listNetworkedSpaces')).toMatch(SWALLOWS[2][1])
  })
})
