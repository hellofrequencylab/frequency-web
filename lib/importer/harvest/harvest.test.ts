import { describe, it, expect } from 'vitest'

// Harvest: the PURE plan (crawl urls, searches, oembed, og/logo parse) plus the fail-safe
// orchestration with a MOCK web provider. The invariant that matters most: a dead page / a
// throwing fetcher / a missing search provider degrades to a recorded source, NEVER a crash,
// and the paste + any working source still come through (docs §7 fail-safe).

import {
  HARVEST_BUDGET,
  planCrawlUrls,
  planCrawlFromDiscovery,
  rankDiscoveredUrls,
  isLikelyChromeImage,
  pickGalleryImages,
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

describe('rankDiscoveredUrls', () => {
  const seed = 'https://bright.test'

  it('puts the high-value topical pages first, shallow before deep', () => {
    const ranked = rankDiscoveredUrls(
      [
        'https://bright.test/blog',
        'https://bright.test/journal/2026/08/a-post',
        'https://bright.test/work-with-me',
        'https://bright.test/the-practice/about-us',
        'https://bright.test/about',
      ],
      seed,
    )
    expect(ranked[0]).toBe('https://bright.test/about')
    expect(ranked).toContain('https://bright.test/work-with-me')
    // A one-segment topical page beats the same topic buried two levels deep.
    expect(ranked.indexOf('https://bright.test/about')).toBeLessThan(
      ranked.indexOf('https://bright.test/the-practice/about-us'),
    )
    // A non-topical page still ranks below every topical one.
    expect(ranked.indexOf('https://bright.test/blog')).toBeGreaterThan(ranked.indexOf('https://bright.test/work-with-me'))
  })

  it('finds the pages a fixed subpath list would MISS', () => {
    const ranked = rankDiscoveredUrls(
      ['https://bright.test/sessions', 'https://bright.test/offerings', 'https://bright.test/the-practice'],
      seed,
    )
    expect(ranked).toContain('https://bright.test/sessions')
    expect(ranked).toContain('https://bright.test/offerings')
  })

  it('drops noise: archives, dated permalinks, plumbing, legal, feeds, and non-html files', () => {
    const ranked = rankDiscoveredUrls(
      [
        'https://bright.test/tag/yoga',
        'https://bright.test/category/news',
        'https://bright.test/author/sam',
        'https://bright.test/cart',
        'https://bright.test/checkout',
        'https://bright.test/my-account',
        'https://bright.test/login',
        'https://bright.test/privacy',
        'https://bright.test/terms',
        'https://bright.test/search',
        'https://bright.test/feed',
        'https://bright.test/2026/08/summer-news',
        'https://bright.test/brochure.pdf',
        'https://bright.test/photo.jpg',
        'https://bright.test/sitemap.xml',
        'https://bright.test/about',
      ],
      seed,
    )
    expect(ranked).toEqual(['https://bright.test/about'])
  })

  it('keeps an html-serving extension and a legit page whose name embeds a noise word', () => {
    const ranked = rankDiscoveredUrls(
      ['https://bright.test/about.html', 'https://bright.test/search-for-calm'],
      seed,
    )
    expect(ranked).toContain('https://bright.test/about.html')
    expect(ranked).toContain('https://bright.test/search-for-calm')
  })

  it('drops cross-origin and non-http links and de-duplicates ignoring case and trailing slash', () => {
    const ranked = rankDiscoveredUrls(
      [
        'https://bright.test/About/',
        'https://bright.test/about',
        'https://facebook.com/bright',
        'mailto:hi@bright.test',
        'javascript:void(0)',
      ],
      seed,
    )
    expect(ranked).toEqual(['https://bright.test/About'])
  })

  it('resolves a relative href against the seed', () => {
    expect(rankDiscoveredUrls(['services', '/menu'], 'https://bright.test/home')).toEqual([
      'https://bright.test/services',
      'https://bright.test/menu',
    ])
  })

  it('caps the result and returns nothing for an unparseable seed', () => {
    const links = Array.from({ length: 30 }, (_, i) => `https://bright.test/about-${i}`)
    expect(rankDiscoveredUrls(links, seed, 4)).toHaveLength(4)
    expect(rankDiscoveredUrls(links, 'nonsense')).toEqual([])
  })
})

describe('planCrawlFromDiscovery', () => {
  const seed = 'https://bright.test'

  it('leads with the seed, then the discovered nav, then the KEY_SUBPATHS fallback tail', () => {
    const urls = planCrawlFromDiscovery(seed, [
      'https://bright.test/work-with-me',
      'https://bright.test/sessions',
    ])
    expect(urls[0]).toBe(seed)
    expect(urls[1]).toBe('https://bright.test/work-with-me')
    expect(urls[2]).toBe('https://bright.test/sessions')
    // The guessed subpaths still trail behind, for a nav that missed something.
    expect(urls).toContain('https://bright.test/about')
    expect(urls.indexOf('https://bright.test/about')).toBeGreaterThan(2)
  })

  it('falls back to the KEY_SUBPATHS plan when nothing was discovered', () => {
    expect(planCrawlFromDiscovery(seed, [])).toEqual(planCrawlUrls(seed))
  })

  it('never exceeds the page budget and never repeats a url', () => {
    const links = Array.from({ length: 40 }, (_, i) => `https://bright.test/services-${i}`)
    const urls = planCrawlFromDiscovery(seed, links)
    expect(urls.length).toBe(HARVEST_BUDGET.maxPages)
    expect(new Set(urls).size).toBe(urls.length)
    // A full nav crowds the guesses out entirely.
    expect(urls).not.toContain('https://bright.test/about-us')
  })

  it('dedupes a discovered link against the seed itself', () => {
    const urls = planCrawlFromDiscovery(seed, ['https://bright.test/', 'https://bright.test/about'])
    expect(urls.filter((u) => u === seed)).toHaveLength(1)
  })

  it('returns nothing for an unparseable seed', () => {
    expect(planCrawlFromDiscovery('nonsense', ['https://bright.test/about'])).toEqual([])
  })
})

describe('isLikelyChromeImage / pickGalleryImages', () => {
  it('rejects logos, icons, pixels, svgs, and url-declared tiny images', () => {
    for (const url of [
      'https://bright.test/img/logo.png',
      'https://bright.test/favicon-32x32.png',
      'https://bright.test/assets/icon-arrow.png',
      'https://bright.test/ui/sprite.png',
      'https://bright.test/px/tracking.gif',
      'https://bright.test/img/spacer.gif',
      'https://bright.test/people/avatar-sam.jpg',
      'https://bright.test/awards/badge.png',
      'https://bright.test/mark.svg',
      'https://bright.test/photos/room.jpg?w=48',
      'https://bright.test/thumbs/64x64/room.jpg',
      'not a url',
    ]) {
      expect(isLikelyChromeImage(url)).toBe(true)
    }
  })

  it('accepts real photographs, including large sized variants', () => {
    for (const url of [
      'https://bright.test/photos/studio.jpg',
      'https://cdn.bright.test/uploads/room-1200x800.jpg',
      'https://bright.test/images/team-photo.webp?w=1600',
    ]) {
      expect(isLikelyChromeImage(url)).toBe(false)
    }
  })

  it('picks up to the gallery budget in document order, skipping chrome and excluded urls', () => {
    const picked = pickGalleryImages(
      [
        'https://bright.test/img/logo.png',
        'https://bright.test/hero.jpg',
        'https://bright.test/photos/one.jpg',
        'https://bright.test/photos/one.jpg',
        'https://bright.test/photos/two.jpg',
        'https://bright.test/photos/three.jpg',
      ],
      { exclude: ['https://bright.test/hero.jpg', undefined] },
    )
    expect(picked).toEqual(['https://bright.test/photos/one.jpg', 'https://bright.test/photos/two.jpg'])
  })

  it('handles an empty list', () => {
    expect(pickGalleryImages([])).toEqual([])
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

/** A provider whose SEED page exposes a real nav (paths a fixed subpath list would never guess)
 *  plus a mix of photos and chrome images; every other page is a plain readable page. */
const navProvider: WebProvider = {
  async fetchUrl(url): Promise<WebFetchResult> {
    if (url === 'https://acme.com') {
      return {
        ok: true,
        url,
        status: 200,
        title: 'Acme',
        text: 'Welcome to Acme Coffee.',
        headHtml:
          '<head><meta property="og:image" content="https://cdn.test/hero.jpg"><link rel="icon" href="https://cdn.test/logo.png"></head>',
        links: [
          'https://acme.com/work-with-me',
          'https://acme.com/the-practice',
          'https://acme.com/sessions',
          'https://acme.com/tag/news',
          'https://acme.com/2026/08/a-post',
          'https://instagram.com/acme',
        ],
        images: [
          'https://cdn.test/logo.png',
          'https://cdn.test/icon-menu.png',
          'https://cdn.test/photos/room.jpg',
          'https://cdn.test/photos/bar.jpg',
          'https://cdn.test/photos/patio.jpg',
        ],
      }
    }
    return { ok: true, url, status: 200, title: url, text: `Readable copy for ${url}.` }
  },
  async searchWeb(): Promise<WebSearchResult[]> {
    return []
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

  it('crawls the pages the seed nav points at, not just the guessed subpaths', async () => {
    const fetched: string[] = []
    const res = await harvest('intake-nav', inputs, {
      web: {
        fetchUrl: async (url) => {
          fetched.push(url)
          return navProvider.fetchUrl(url)
        },
        searchWeb: navProvider.searchWeb,
      },
      captureImage: async () => null,
    })
    expect(fetched[0]).toBe('https://acme.com') // the seed is read FIRST, so its nav can be ranked
    expect(fetched).toContain('https://acme.com/work-with-me')
    expect(fetched).toContain('https://acme.com/sessions')
    // Noise the nav also carried is never fetched.
    expect(fetched.some((u) => u.includes('/tag/') || u.includes('/2026/'))).toBe(false)
    expect(fetched.some((u) => u.includes('instagram'))).toBe(false)
    // The guessed subpaths still fill the remaining budget, and the cap holds.
    expect(fetched).toContain('https://acme.com/about')
    expect(fetched.length).toBeLessThanOrEqual(HARVEST_BUDGET.maxPages)
    expect(res.summary.pagesFetched).toBe(fetched.length)
  })

  it('captures a gallery from the seed page images, skipping chrome, within the image budget', async () => {
    const res = await harvest('intake-gallery', inputs, {
      web: navProvider,
      captureImage: async (_id, url, role) => ({ publicUrl: `https://site-media.test/${role}/${encodeURIComponent(url)}`, sourceUrl: url }),
    })
    expect(res.media.logoUrl).toContain('logo')
    expect(res.media.heroUrl).toContain('hero')
    expect(res.media.gallery).toHaveLength(2)
    expect(res.media.gallery?.[0]).toContain(encodeURIComponent('https://cdn.test/photos/room.jpg'))
    // The logo and the ui icon never take a gallery slot.
    expect(res.media.gallery?.some((u) => u.includes('icon-menu') || u.includes('logo.png'))).toBe(false)
    expect(res.summary.imagesCaptured).toBe(HARVEST_BUDGET.maxImages)
    // Every captured image keeps its ORIGINAL source url for the rights trail (docs §7).
    const galleryImageSources = res.sources.filter((s) => s.kind === 'image' && s.meta?.role === 'gallery')
    expect(galleryImageSources).toHaveLength(2)
    expect(galleryImageSources[0].url).toBe('https://cdn.test/photos/room.jpg')
    expect(galleryImageSources[0].mediaPath).toContain('site-media.test')
  })

  it('degrades to the KEY_SUBPATHS plan when the seed fetch fails, and captures nothing', async () => {
    const fetched: string[] = []
    const res = await harvest('intake-deadseed', inputs, {
      web: {
        fetchUrl: async (url) => {
          fetched.push(url)
          if (url === 'https://acme.com') return { ok: false, url, status: 500, error: 'http 500' }
          return { ok: true, url, status: 200, title: url, text: `Copy for ${url}.` }
        },
        searchWeb: async () => [],
      },
      captureImage: async () => null,
    })
    expect(fetched).toEqual(planCrawlUrls('https://acme.com'))
    expect(res.summary.pagesFailed).toBe(1)
    expect(res.summary.pagesFetched).toBeGreaterThan(0)
    expect(res.media.gallery).toBeUndefined()
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
