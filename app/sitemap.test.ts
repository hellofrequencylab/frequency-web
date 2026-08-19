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
const SPACES = [
  { id: 'sp-a', slug: 'alpha', type: 'business' },
  { id: 'sp-b', slug: 'bravo', type: 'business' },
  { id: 'sp-c', slug: 'charlie', type: 'business' },
  { id: 'sp-d', slug: 'delta', type: 'nonprofit' },
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
vi.mock('@/lib/spaces/discovery', () => ({ listNetworkedSpaces: async () => SPACES }))

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
vi.mock('@/lib/commerce/products', () => ({ listShopProducts: async () => [], listMarketListings: async () => [] }))
vi.mock('@/lib/listings/housing', () => ({ listHousingListings: async () => [] }))
vi.mock('@/lib/marketplace', () => ({ listListings: async () => [] }))
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
