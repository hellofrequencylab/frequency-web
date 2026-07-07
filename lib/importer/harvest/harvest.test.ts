import { describe, it, expect } from 'vitest'

// Harvest: the PURE plan (crawl urls, searches, oembed, og/logo parse) plus the fail-safe
// orchestration with a MOCK web provider. The invariant that matters most: a dead page / a
// throwing fetcher / a missing search provider degrades to a recorded source, NEVER a crash,
// and the paste + any working source still come through (docs §7 fail-safe).

import {
  planCrawlUrls,
  planSearchQueries,
  planOembeds,
  parsePageMedia,
  normalizeSeedUrl,
  socialUrl,
  absolutize,
} from './plan'
import { harvest } from './run'
import type { WebProvider, WebFetchResult, WebSearchResult } from '@/lib/ai/web'
import type { IntakeInputs } from '../intake'

describe('normalizeSeedUrl', () => {
  it('adds https to a bare host and strips a trailing slash', () => {
    expect(normalizeSeedUrl('acme.com')).toBe('https://acme.com')
    expect(normalizeSeedUrl('https://acme.com/')).toBe('https://acme.com')
  })
  it('rejects garbage', () => {
    expect(normalizeSeedUrl('   ')).toBeNull()
  })
})

describe('planCrawlUrls', () => {
  it('leads with the seed then probes key subpaths off the origin, capped', () => {
    const urls = planCrawlUrls('https://acme.com/home', 5)
    expect(urls[0]).toBe('https://acme.com/home')
    expect(urls).toContain('https://acme.com/about')
    expect(urls.length).toBeLessThanOrEqual(5)
  })
  it('dedupes the seed against the origin home', () => {
    const urls = planCrawlUrls('https://acme.com')
    const home = urls.filter((u) => u === 'https://acme.com')
    expect(home.length).toBe(1)
  })
})

describe('planSearchQueries', () => {
  it('anchors on the name + city hint and caps the count', () => {
    const inputs: IntakeInputs = { hints: { name: 'Acme Coffee', city: 'Austin' } }
    const q = planSearchQueries(inputs, 3)
    expect(q.length).toBeLessThanOrEqual(3)
    expect(q[0]).toContain('Acme Coffee')
    expect(q[0]).toContain('Austin')
  })
  it('falls back to the website host when there is no name', () => {
    expect(planSearchQueries({ websiteUrl: 'https://acme.com' })[0]).toContain('acme.com')
  })
  it('returns nothing to anchor on', () => {
    expect(planSearchQueries({})).toEqual([])
  })
})

describe('socialUrl / planOembeds', () => {
  it('expands bare handles to profile urls', () => {
    expect(socialUrl('instagram', '@acme')).toBe('https://www.instagram.com/acme/')
    expect(socialUrl('tiktok', 'acme')).toBe('https://www.tiktok.com/@acme')
  })
  it('plans oembed endpoints only where a public one exists', () => {
    const plans = planOembeds({ socialHandles: { instagram: 'acme', youtube: 'acme' } })
    const yt = plans.find((p) => p.platform === 'youtube')
    const ig = plans.find((p) => p.platform === 'instagram')
    expect(yt?.oembedEndpoint).toContain('youtube.com/oembed')
    expect(ig?.oembedEndpoint).toBeNull() // Instagram is auth-walled (docs §7)
  })
})

describe('parsePageMedia / absolutize', () => {
  it('parses og:image + logo + og text, resolving relative urls', () => {
    const head = `<head>
      <meta property="og:image" content="/hero.jpg">
      <meta property="og:title" content="Acme Coffee">
      <link rel="apple-touch-icon" href="https://cdn.test/logo.png">
    </head>`
    const media = parsePageMedia(head, 'https://acme.com/about')
    expect(media.ogImage).toBe('https://acme.com/hero.jpg')
    expect(media.logo).toBe('https://cdn.test/logo.png')
    expect(media.ogTitle).toBe('Acme Coffee')
  })
  it('drops non-http urls', () => {
    expect(absolutize('data:image/png;base64,xxx', 'https://acme.com')).toBeUndefined()
  })
})

// ── Fail-safe orchestration ──────────────────────────────────────────────────────

/** A provider whose every fetch throws and whose search errors — the worst case. */
const throwingProvider: WebProvider = {
  async fetchUrl(): Promise<WebFetchResult> {
    throw new Error('network down')
  },
  async searchWeb(): Promise<WebSearchResult[]> {
    throw new Error('search down')
  },
}

/** A healthy provider that returns a page with og media + one search hit. */
const goodProvider: WebProvider = {
  async fetchUrl(url): Promise<WebFetchResult> {
    if (url.includes('/about')) {
      return {
        ok: true,
        url,
        status: 200,
        title: 'About Acme',
        text: 'Acme Coffee has served the neighborhood since 2015.',
        headHtml: '<head><meta property="og:image" content="https://cdn.test/hero.jpg"></head>',
      }
    }
    return { ok: true, url, status: 200, title: 'Acme', text: 'Welcome to Acme Coffee.', headHtml: '' }
  },
  async searchWeb(): Promise<WebSearchResult[]> {
    return [{ title: 'Acme reviews', url: 'https://reviews.test/acme', snippet: '4.8 stars, great coffee.' }]
  },
}

describe('harvest — fail-safe (docs §7)', () => {
  const inputs: IntakeInputs = {
    websiteUrl: 'https://acme.com',
    pastedContent: 'Acme Coffee. Owner: Sam. Open daily.',
    socialHandles: { instagram: 'acmecoffee' },
    hints: { name: 'Acme Coffee', city: 'Austin' },
  }

  it('never throws even when EVERY fetcher and search errors, and still keeps the paste', async () => {
    const res = await harvest('intake-1', inputs, {
      web: throwingProvider,
      captureImage: async () => null,
    })
    // The paste is always preserved.
    const paste = res.sources.find((s) => s.kind === 'paste')
    expect(paste?.text).toContain('Acme Coffee')
    // Failed pages are recorded (status trail), not dropped.
    expect(res.summary.pagesFailed).toBeGreaterThan(0)
    // No media captured, no crash.
    expect(res.media.logoUrl).toBeUndefined()
  })

  it('collects pages, a search hit, a social link, and captures media on a healthy run', async () => {
    const res = await harvest('intake-2', inputs, {
      web: goodProvider,
      captureImage: async (_id, url) => ({ publicUrl: `https://site-media.test/copy-of-${encodeURIComponent(url)}`, sourceUrl: url }),
    })
    expect(res.summary.pagesFetched).toBeGreaterThan(0)
    expect(res.sources.some((s) => s.kind === 'search_result')).toBe(true)
    // The Instagram handle is recorded as a social link even though we do not scrape it.
    expect(res.sources.some((s) => s.meta?.kind === 'social_link')).toBe(true)
    // The og:image was captured into site-media.
    expect(res.media.heroUrl).toContain('site-media.test')
    expect(res.summary.imagesCaptured).toBe(1)
  })

  it('works with no website (paste-only import)', async () => {
    const res = await harvest('intake-3', { pastedContent: 'Just a paste.' }, {
      web: throwingProvider,
      captureImage: async () => null,
    })
    expect(res.sources.some((s) => s.kind === 'paste')).toBe(true)
    expect(res.summary.pagesFetched).toBe(0)
  })
})
