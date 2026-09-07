import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── The sitemap's emitted URL set is the contract ────────────────────────────────────────────────
//
// LIVE-017 collapsed the podcast section's N+1 (one `podcast_shows` read per networked Space, up to
// 200 round trips on the surface crawlers hit hardest) into ONE grouped read. The whole correctness
// claim of that change is that the OUTPUT is byte-identical: a sitemap that drops or duplicates URLs
// is worse than a slow one.
//
// These tests pin that claim rather than asserting it. The load-bearing one is DIFFERENTIAL: it
// builds the podcast URL list the OLD per-Space loop would have emitted, from the same fixture, and
// requires the real sitemap to match it EXACTLY — same URLs, same order, same lastModified stamps.
// If the batched reader ever regroups, reorders, or drops a Space, that test fails.
//
// Everything the route reads is mocked, so the assertions are about the route's own composition and
// not about whatever happens to be in the database.

// The route builds every URL from SITE_URL, which is resolved at module load — so the test reads the
// same constant rather than stubbing the env after the import has already been hoisted.
import { readFileSync } from 'node:fs'
import { SITE_URL as SITE } from '@/lib/site'

// ── Fixture ──────────────────────────────────────────────────────────────────────────────────────

interface FixtureShow {
  id: string
  spaceId: string
  slug: string
  updatedAt: string
  status: string
  feedVisibility: string
  createdAt: string
}

function show(over: Partial<FixtureShow> & { id: string; spaceId: string; slug: string }): FixtureShow {
  return {
    updatedAt: '2026-02-01T00:00:00Z',
    status: 'published',
    feedVisibility: 'public',
    createdAt: '2026-01-01T00:00:00Z',
    ...over,
  }
}

// Four networked Spaces, deliberately covering every branch of the podcast section:
//   space-a — two public Shows (the multi-Show grouping)
//   space-b — one public Show (the single-Show case)
//   space-c — ZERO public Shows (must emit NO podcasts index; the empty index 404s)
//   space-d — Shows that exist but are draft / private (must be indistinguishable from space-c)
// `updatedAt` is the LIVE-197 field: the discovery reader projects `spaces.updated_at` so the Space
// section can carry a `<lastmod>`. delta deliberately has NONE, because the rule is that a row with
// no timestamp emits no lastmod rather than a synthesised one.
const SPACES = [
  { id: 'sp-a', slug: 'alpha', type: 'business', updatedAt: '2026-07-04T10:00:00Z' },
  { id: 'sp-b', slug: 'bravo', type: 'business', updatedAt: '2026-08-09T11:30:00Z' },
  { id: 'sp-c', slug: 'charlie', type: 'business', updatedAt: '2026-05-01T00:00:00Z' },
  { id: 'sp-d', slug: 'delta', type: 'nonprofit', updatedAt: null },
]

// created_at DESC is the order both the old per-Space reader and the batched reader emit in, so the
// fixture gives space-a two Shows whose newest is NOT the one that sorts first by slug — an
// accidental re-sort would be visible.
const SHOWS: FixtureShow[] = [
  show({ id: 'sh-1', spaceId: 'sp-a', slug: 'older-show', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-03-01T00:00:00Z' }),
  show({ id: 'sh-2', spaceId: 'sp-a', slug: 'newer-show', createdAt: '2026-05-01T00:00:00Z', updatedAt: '2026-06-01T00:00:00Z' }),
  show({ id: 'sh-3', spaceId: 'sp-b', slug: 'solo-show', createdAt: '2026-02-01T00:00:00Z', updatedAt: '2026-04-01T00:00:00Z' }),
  show({ id: 'sh-4', spaceId: 'sp-d', slug: 'draft-show', status: 'draft' }),
  show({ id: 'sh-5', spaceId: 'sp-d', slug: 'private-show', feedVisibility: 'private' }),
]

/** The public-feed gate, exactly as the podcast pages render it (they 404 otherwise). */
const isPublic = (s: FixtureShow) => s.status === 'published' && s.feedVisibility === 'public'

// ── Mocks: every reader app/sitemap.ts pulls from ────────────────────────────────────────────────

// The batched reader is mocked at the boundary the route sees — a Map<spaceId, Show[]> — so this
// file tests the ROUTE's grouping/emission. The reader's own SQL gate, paging and fail-safe are
// locked separately in lib/airwaves/shows-batch.test.ts.
const showsBatch = vi.fn(async (ids: string[]) => {
  const grouped = new Map<string, FixtureShow[]>()
  const wanted = new Set(ids)
  // created_at DESC, the reader's ordering.
  for (const s of [...SHOWS].sort((a, b) => b.createdAt.localeCompare(a.createdAt))) {
    if (!wanted.has(s.spaceId) || !isPublic(s)) continue
    const bucket = grouped.get(s.spaceId)
    if (bucket) bucket.push(s)
    else grouped.set(s.spaceId, [s])
  }
  return grouped
})

vi.mock('@/lib/airwaves/shows', () => ({ listPublicShowsBySpace: (ids: string[]) => showsBatch(ids) }))
// The public profile TABS (LIVE-184) come from their own reader, mocked here through a mutable
// hoisted fixture so a test can hand the route whatever tab set it wants to pin. It defaults to
// EMPTY, so every pre-existing assertion in this file sees exactly the URL set it always did.
const profileTabs = vi.hoisted(() => ({
  rows: [] as { slug: string; segment: string; updatedAt: string | null }[],
}))

vi.mock('@/lib/spaces/discovery', () => ({
  listNetworkedSpaces: async () => SPACES,
  listNetworkedSpaceProfileTabs: async () => profileTabs.rows,
  // The sitemap imports the cap so it can say WHICH reader to page when a section truncates,
  // rather than retyping 200. A factory mock must carry it: omit an export the module under
  // test imports and the import throws, which reads here as an empty sitemap rather than an
  // error.
  DISCOVERY_FETCH_LIMIT: 200,
}))

// Everything else returns empty, so the assertions below are about the podcast + Space sections and
// the static block — not about fixture noise from a dozen unrelated verticals.
vi.mock('@/lib/discover', () => ({ getTopicalChannels: async () => [], getPublicCircles: async () => [] }))
vi.mock('@/lib/events/series-seo', () => ({ listSitemapEventEntries: async () => [] }))
vi.mock('@/lib/events/series-config', () => ({ getSeriesDisplayConfig: async () => ({ indexedOccurrences: 2 }) }))
vi.mock('@/lib/journey-plans', () => ({ listPublicJourneys: async () => [] }))
vi.mock('@/lib/partners/read', () => ({ listActivePartners: async () => [] }))
// Two practices, one WITH a slug and one without, because the sitemap's job here is to prefer the
// slug and fall back to the uuid — and for a while it could only ever do the second (see the
// canonical-key test below).
vi.mock('@/lib/practices', () => ({
  listPublicPractices: async () => [
    { id: '1516f5c4-2047-4dae-b6a2-1b0daada1ea9', slug: 'box-breathing' },
    { id: '2e8b062e-62e5-4bcb-80e9-d6432bb42ae2', slug: null },
  ],
}))
// The four commerce verticals are the ONE section with a row cap and no page behind it (SCAN-203),
// so their readers are pointed at a mutable fixture: a test sets `commerce.<vertical>` to however
// many rows it needs and the sitemap reads exactly that. Every reader defaults to [] (reset in
// beforeEach), so every OTHER test in this file sees the same empty verticals it always did. The
// `limit` each reader is handed is recorded, because "the sitemap asks for exactly what the reader
// will honour" is half of the cap contract pinned below.
const commerce = vi.hoisted(() => ({
  // `isDemo` is the LIVE-187 field: a demo store product must never reach the sitemap.
  shop: [] as { id: string; images: string[]; updatedAt?: string; isDemo?: boolean }[],
  market: [] as { id: string; updatedAt?: string }[],
  housing: [] as { id: string; updatedAt?: string }[],
  classifieds: [] as { id: string; updated_at?: string }[],
  limits: {} as Record<string, unknown>,
}))

vi.mock('@/lib/commerce/products', () => ({
  listShopProducts: async (o: { limit?: number } = {}) => ((commerce.limits.shop = o.limit), commerce.shop),
  listMarketListings: async (o: { limit?: number } = {}) => ((commerce.limits.market = o.limit), commerce.market),
}))
vi.mock('@/lib/listings/housing', () => ({
  listHousingListings: async (o: { limit?: number } = {}) => ((commerce.limits.housing = o.limit), commerce.housing),
}))
vi.mock('@/lib/marketplace', () => ({
  listListings: async (o: { limit?: number } = {}) => ((commerce.limits.classifieds = o.limit), commerce.classifieds),
}))
vi.mock('@/lib/help/content', () => ({ getAllArticles: async () => [], getAllCategories: async () => [] }))
vi.mock('@/app/discover/events/_data', () => ({ getCityCategoryHubs: async () => [] }))
vi.mock('@/app/discover/places/_data', () => ({ listDiscoverCities: async () => [] }))
vi.mock('@/app/discover/cities/_data', () => ({ listDensityCities: async () => [] }))
vi.mock('@/lib/supabase/public', () => ({ createPublicClient: () => ({ rpc: async () => ({ data: [] }) }) }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => {
    const api = {
      from: () => api,
      select: () => api,
      eq: () => api,
      filter: () => api,
      limit: async () => ({ data: [] }),
    }
    return api
  },
}))

import sitemap from './sitemap'

beforeEach(() => {
  showsBatch.mockClear()
  profileTabs.rows = []
  commerce.shop = []
  commerce.market = []
  commerce.housing = []
  commerce.classifieds = []
  commerce.limits = {}
})

/** Just the podcast entries, in emission order. */
function podcastEntries(entries: Awaited<ReturnType<typeof sitemap>>) {
  return entries.filter((e) => e.url.includes('/podcasts'))
}

describe('app/sitemap podcast section', () => {
  it('issues ONE grouped read for every Space, not one per Space (the N+1 guard)', async () => {
    await sitemap()

    expect(showsBatch).toHaveBeenCalledTimes(1)
    // Every networked Space is in that single read — nothing is left for a follow-up query.
    expect(showsBatch.mock.calls[0][0]).toEqual(['sp-a', 'sp-b', 'sp-c', 'sp-d'])
  })

  it('emits EXACTLY the URL list the old per-Space loop emitted', async () => {
    const entries = await sitemap()

    // The reference implementation: the pre-LIVE-017 shape, written out longhand. One read per
    // Space, gate applied in JS, index emitted only when that Space has ≥1 public Show.
    const reference: { url: string; lastModified?: Date }[] = []
    for (const s of SPACES) {
      const shows = SHOWS.filter((sh) => sh.spaceId === s.id && isPublic(sh)).sort((a, b) =>
        b.createdAt.localeCompare(a.createdAt),
      )
      if (shows.length === 0) continue
      reference.push({ url: `${SITE}/spaces/${s.slug}/podcasts` })
      for (const sh of shows) {
        reference.push({ url: `${SITE}/spaces/${s.slug}/podcasts/${sh.slug}`, lastModified: new Date(sh.updatedAt) })
      }
    }

    const actual = podcastEntries(entries).map((e) => ({
      url: e.url,
      ...(e.lastModified ? { lastModified: new Date(e.lastModified as string | Date) } : {}),
    }))

    // Order-sensitive: a Space's index must precede its Shows, and Shows stay created_at DESC.
    expect(actual).toEqual(reference)
  })

  it('pins the podcast URLs literally, so a silent regrouping cannot pass', async () => {
    expect(podcastEntries(await sitemap()).map((e) => e.url)).toEqual([
      `${SITE}/spaces/alpha/podcasts`,
      `${SITE}/spaces/alpha/podcasts/newer-show`,
      `${SITE}/spaces/alpha/podcasts/older-show`,
      `${SITE}/spaces/bravo/podcasts`,
      `${SITE}/spaces/bravo/podcasts/solo-show`,
    ])
  })

  it('never advertises a podcasts index for a Space with no public Show', async () => {
    const urls = podcastEntries(await sitemap()).map((e) => e.url)
    // charlie has no Shows at all; delta's are draft / private. Both 404 on the index page.
    expect(urls).not.toContain(`${SITE}/spaces/charlie/podcasts`)
    expect(urls).not.toContain(`${SITE}/spaces/delta/podcasts`)
  })

  it('degrades to NO podcast URLs — and a complete sitemap otherwise — when the read fails', async () => {
    showsBatch.mockResolvedValueOnce(new Map())

    const entries = await sitemap()

    expect(podcastEntries(entries)).toEqual([])
    // The rest of the sitemap is untouched: the Space pages themselves are still advertised.
    expect(entries.map((e) => e.url)).toContain(`${SITE}/spaces/alpha`)
  })
})

describe('app/sitemap emitted URL set', () => {
  // 🔴 THE CANONICAL KEY. `listPublicPractices` reads the practices_ranked VIEW, which does not
  // expose `slug`, so every row came back with `slug: undefined` and `p.slug ?? p.id` resolved to
  // the uuid every time. The sitemap then advertised twenty `/discover/practices/<uuid>` URLs while
  // each of those pages declared its canonical as the SLUG url — twenty addresses submitted to
  // Google, every one of which disowned itself on arrival. This asserts the URL, not the plumbing,
  // so it fails whether the slug goes missing in the view, the reader, or here.
  it('advertises a practice by its SLUG, and falls back to the uuid only when there is none', async () => {
    const urls = (await sitemap()).map((e) => e.url)
    expect(urls).toContain('https://frequencylocal.com/discover/practices/box-breathing')
    expect(urls).not.toContain(
      'https://frequencylocal.com/discover/practices/1516f5c4-2047-4dae-b6a2-1b0daada1ea9',
    )
    // The fallback is deliberate and stays: a practice with no slug must still be reachable.
    expect(urls).toContain(
      'https://frequencylocal.com/discover/practices/2e8b062e-62e5-4bcb-80e9-d6432bb42ae2',
    )
  })

  it('emits no duplicate URLs', async () => {
    const urls = (await sitemap()).map((e) => e.url)
    const dupes = urls.filter((u, i) => urls.indexOf(u) !== i)
    expect(dupes).toEqual([])
  })

  it('advertises every networked Space, and the type hubs that clear the index threshold', async () => {
    const urls = (await sitemap()).map((e) => e.url)

    for (const s of SPACES) expect(urls).toContain(`${SITE}/spaces/${s.slug}`)
    // HUB_MIN_INDEX is 3: `business` has three Spaces and clears it, `nonprofit` has one and does not,
    // so we never advertise a hub the page itself noindexes.
    expect(urls).toContain(`${SITE}/discover/spaces/business`)
    expect(urls).not.toContain(`${SITE}/discover/spaces/nonprofit`)
  })

  // ── LIVE-197: the Space section carries a lastmod ─────────────────────────────────────────────
  //
  // Spaces were the largest dynamic set in the sitemap with NO `<lastmod>`, because the discovery
  // reader never projected `updated_at`. With ~20 profiles and seven tabs behind each, lastmod is
  // the one signal telling a crawler which of them changed. The claim under test is the CONSEQUENCE
  // (the emitted entry carries the date), not that the column is selected.
  it('stamps each Space profile with its updated_at, and omits lastmod when there is none', async () => {
    const bySlug = new Map((await sitemap()).map((e) => [e.url, e]))

    expect(bySlug.get(`${SITE}/spaces/alpha`)?.lastModified).toEqual(new Date('2026-07-04T10:00:00Z'))
    expect(bySlug.get(`${SITE}/spaces/bravo`)?.lastModified).toEqual(new Date('2026-08-09T11:30:00Z'))
    // A Space with no timestamp gets NO lastmod. An invented date is worse than none: Google
    // discounts a whole sitemap's lastmod once it catches one that lies.
    expect(bySlug.get(`${SITE}/spaces/delta`)?.lastModified).toBeUndefined()
  })

  // ── LIVE-184: the public profile tabs are advertised ──────────────────────────────────────────
  //
  // Seven crawlable tabs sit beside each Space profile, all indexable, all canonical to themselves,
  // and none of them was in any sitemap. The route's own job here is narrow and worth pinning: take
  // what the gated reader returns, put it under the right Space at priority 0.5, and carry the
  // profile's lastmod. The GATING (an empty tab never gets a URL) lives in the reader and is pinned
  // in lib/spaces/discovery.test.ts.
  it('advertises the profile tabs the reader returns, at priority 0.5 under the profile', async () => {
    profileTabs.rows = [
      { slug: 'alpha', segment: 'book', updatedAt: '2026-07-04T10:00:00Z' },
      { slug: 'alpha', segment: 'shop', updatedAt: '2026-07-04T10:00:00Z' },
      { slug: 'bravo', segment: 'our-story', updatedAt: null },
    ]

    const entries = await sitemap()
    const byUrl = new Map(entries.map((e) => [e.url, e]))

    expect(byUrl.get(`${SITE}/spaces/alpha/book`)?.priority).toBe(0.5)
    expect(byUrl.get(`${SITE}/spaces/alpha/shop`)?.lastModified).toEqual(new Date('2026-07-04T10:00:00Z'))
    // A custom operator page is a tab like any other.
    expect(byUrl.get(`${SITE}/spaces/bravo/our-story`)).toBeDefined()
    expect(byUrl.get(`${SITE}/spaces/bravo/our-story`)?.lastModified).toBeUndefined()
    // The profile ROOT still outranks its own facets: land a visitor on the Space, not on its shop.
    expect(byUrl.get(`${SITE}/spaces/alpha`)?.priority).toBe(0.6)
  })

  it('never advertises a tab URL the Space section has already emitted', async () => {
    // `RESERVED_PAGE_SLUGS` blocks `book` but not `podcasts`, and /spaces/<slug>/podcasts is a
    // static sibling this file already advertises for a Space with a public Show. A custom page by
    // that name must not produce a second entry for the same URL.
    profileTabs.rows = [{ slug: 'alpha', segment: 'podcasts', updatedAt: null }]

    const urls = (await sitemap()).map((e) => e.url)
    expect(urls.filter((u) => u === `${SITE}/spaces/alpha/podcasts`)).toHaveLength(1)
  })

  it('advertises NO tab a Space does not have — the reader is the only gate', async () => {
    // The default fixture is empty, which is the "no Space has a qualifying tab" case.
    const urls = (await sitemap()).map((e) => e.url)
    for (const seg of ['book', 'calendar', 'circles', 'collaborators', 'reviews', 'shop']) {
      expect(urls).not.toContain(`${SITE}/spaces/alpha/${seg}`)
    }
  })

  // ── LIVE-187: a demo product never enters the crawl ───────────────────────────────────────────
  //
  // Measured on production 2026-09-06: all four platform-owned `is_demo` store products are
  // `status='active'` and carry picsum placeholder art, so the sitemap advertised four commerce
  // URLs whose DECLARED IMAGE was stock filler standing in for product photography. A
  // sitemap-declared image is a representation claim, so the whole row goes, not just its picture.
  it('never advertises a demo store product, and still advertises a real one', async () => {
    commerce.shop = [
      { id: 'real-1', images: ['https://cdn.example/real.jpg'] },
      { id: 'demo-1', images: ['https://picsum.photos/seed/x/800'], isDemo: true },
    ]

    const urls = (await sitemap()).map((e) => e.url)

    expect(urls).toContain(`${SITE}/store/real-1`)
    // The positive control above proves this absence means "filtered", not "the section is empty".
    expect(urls).not.toContain(`${SITE}/store/demo-1`)
  })

  it('always emits the static block, absolute and on the canonical origin', async () => {
    const urls = (await sitemap()).map((e) => e.url)

    expect(urls).toContain(`${SITE}/`)
    expect(urls).toContain(`${SITE}/discover`)
    expect(urls).toContain(`${SITE}/pricing`)
    expect(urls.every((u) => u.startsWith(`${SITE}/`))).toBe(true)
    // /sign-in is noindex; advertising it would trip "Submitted URL marked noindex".
    expect(urls).not.toContain(`${SITE}/sign-in`)
  })
})

// ── The commerce row caps, and the fail-safe that says when one is being hit (SCAN-203) ─────────
//
// store / market / housing / classifieds are read with a flat `limit` and no page behind it: their
// readers clamp server-side and expose no offset, range or cursor, so a network past 100 active
// listings in a vertical silently stops advertising whatever sorts past the cap. #2289 chose to
// state the cap rather than page it, and made it LOUD with `atCap` — a console.warn naming the
// section and the reader to page.
//
// That warning WAS the whole remedy, and nothing measured it. AGENTS.md: every fail-safe needs a
// gate that notices it fired, because a fail-safe nobody can see fire is an invisible regression.
// These tests are that gate. They fire the real route, not a helper: the warning has to survive
// the wiring, not just exist in a function.
const CAP = 100

function rows(n: number) {
  return Array.from({ length: n }, (_, i) => ({ id: `row-${i}`, images: [] as string[] }))
}

describe('app/sitemap commerce row caps', () => {
  it('says WHICH vertical is at its cap and WHICH reader to page, once per section', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    commerce.shop = rows(CAP)

    const entries = await sitemap()

    // Every row it did read is still emitted — the fail-safe reports, it never drops.
    expect(entries.filter((e) => e.url.startsWith(`${SITE}/store/`))).toHaveLength(CAP)

    const lines = warn.mock.calls.map((c) => String(c[0]))
    const hit = lines.filter((l) => l.includes('store products'))
    expect(hit).toHaveLength(1)
    // The message has to carry the two things a reader of the log cannot otherwise get: how many
    // rows came back against what cap, and the name of the function that has to learn to page.
    expect(hit[0]).toContain(`cap of ${CAP}`)
    expect(hit[0]).toContain('listShopProducts')
    // The other three verticals were empty, so they must be silent — a warning that fires for
    // everything is a warning nobody reads.
    expect(lines.filter((l) => l.includes('market listings'))).toHaveLength(0)
    expect(lines.filter((l) => l.includes('classifieds'))).toHaveLength(0)
    warn.mockRestore()
  })

  it('covers the classifieds read too, which is the one whose reader does NOT clamp', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    commerce.classifieds = rows(CAP)

    await sitemap()

    const hit = warn.mock.calls.map((c) => String(c[0])).filter((l) => l.includes('classifieds'))
    expect(hit).toHaveLength(1)
    expect(hit[0]).toContain('listListings')
    warn.mockRestore()
  })

  it('stays silent one row below the cap', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    commerce.shop = rows(CAP - 1)
    commerce.market = rows(CAP - 1)
    commerce.housing = rows(CAP - 1)
    commerce.classifieds = rows(CAP - 1)

    await sitemap()

    // The positive control above proves this silence means "not at cap", not "never warns".
    expect(warn.mock.calls.map((c) => String(c[0])).filter((l) => l.includes('at its cap'))).toHaveLength(0)
    warn.mockRestore()
  })

  it('asks each reader for exactly the number that reader will honour', async () => {
    await sitemap()

    // Half one of the contract: the sitemap passes the cap it documents.
    expect(commerce.limits).toEqual({ shop: CAP, market: CAP, housing: CAP, classifieds: CAP })

    // Half two: that number IS the clamp the readers enforce. This is what makes raising the
    // shared constant fail here instead of failing silently in production — the three clamping
    // readers would keep returning 100 while `atCap` compared against the bigger number and never
    // fired again, which is the exact silence this section exists to prevent.
    const clamp = /Math\.min\(Math\.max\([\w.]+\s*\?\?\s*\d+,\s*1\),\s*(\d+)\)/g
    const clamps = [
      ...readFileSync('lib/commerce/products.ts', 'utf8').matchAll(clamp),
      ...readFileSync('lib/listings/housing.ts', 'utf8').matchAll(clamp),
    ].map((m) => Number(m[1]))

    // listShopProducts, listMarketListings, listHousingListings.
    expect(clamps.length).toBeGreaterThanOrEqual(3)
    expect(clamps.every((c) => c === CAP)).toBe(true)
  })
})
