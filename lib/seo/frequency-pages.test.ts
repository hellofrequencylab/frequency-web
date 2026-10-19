import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { webPageSchema } from '@/lib/jsonld'
import { SITE_URL } from '@/lib/site'
import { FREQUENCY_PAGE_SEO, frequencyPageJsonLd, frequencyPageMetadata, type FrequencyPageSeo } from './frequency-pages'

// Google's view of the Frequency design's coded pages. Three things are pinned here:
//   1. the WebPage builder's shape, and that it never invents a date, rating, price or count;
//   2. every entry says what the VISIBLE page says (its h1 and lede are read from the body's source);
//   3. every entry fits a search result and the voice rules (length, no em dash, no doubled site name).
// The DAWN half (that a DAWN build's metadata is byte-identical) is pinned in frequency-pages.dawn.test.ts.

const ROOT = process.cwd()

const BODIES: Record<keyof typeof FREQUENCY_PAGE_SEO, string> = {
  home: 'components/frequency/site/pages/home/frequency-home.tsx',
  community: 'components/frequency/site/pages/people/frequency-people.tsx',
  spaces: 'components/frequency/site/pages/spaces/frequency-spaces.tsx',
  features: 'components/frequency/site/pages/features/frequency-features.tsx',
  stories: 'components/frequency/site/pages/stories/frequency-stories.tsx',
  vision: 'components/frequency/site/pages/vision/frequency-vision.tsx',
  networks: 'components/frequency/site/pages/networks/frequency-networks.tsx',
}

/** The body's source as the reader sees it: JSX tags and braces removed, whitespace collapsed. */
function visibleText(file: string): string {
  return readFileSync(join(ROOT, file), 'utf8')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/ ([.,:])/g, '$1')
}

const INVENTED = [
  'datePublished',
  'dateModified',
  'aggregateRating',
  'review',
  'offers',
  'price',
  'interactionStatistic',
  'author',
  'mainEntity',
]

describe('webPageSchema', () => {
  it('builds a WebPage that is part of the one WebSite, published by the one Organization', () => {
    const node = webPageSchema({ path: '/spaces', name: 'Spaces', headline: 'Hello.', description: 'A page.' })
    expect(node).toEqual({
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      '@id': `${SITE_URL}/spaces`,
      url: `${SITE_URL}/spaces`,
      name: 'Spaces',
      headline: 'Hello.',
      description: 'A page.',
      inLanguage: 'en-US',
      isPartOf: { '@id': `${SITE_URL}/#website` },
      publisher: { '@id': `${SITE_URL}/#organization` },
    })
  })

  it('invents nothing: no dates, ratings, reviews, prices, counts or author', () => {
    const node = webPageSchema({ path: '/', name: 'Home', description: 'A page.' }) as Record<string, unknown>
    for (const key of INVENTED) expect(node).not.toHaveProperty(key)
    expect(node).not.toHaveProperty('headline')
    expect(node).not.toHaveProperty('image')
  })

  it('absolutizes a root-relative image and names the first as the primary image', () => {
    const node = webPageSchema({ path: '/x', name: 'X', description: 'd', image: '/a.jpg' }) as Record<string, unknown>
    expect(node.image).toEqual([`${SITE_URL}/a.jpg`])
    expect(node.primaryImageOfPage).toEqual({ '@type': 'ImageObject', url: `${SITE_URL}/a.jpg` })
  })
})

describe('FREQUENCY_PAGE_SEO', () => {
  const entries = Object.entries(FREQUENCY_PAGE_SEO) as [keyof typeof FREQUENCY_PAGE_SEO, FrequencyPageSeo][]

  it.each(entries)('%s: the h1 and lede are the ones the visible page shows', (key, seo) => {
    const text = visibleText(BODIES[key])
    expect(text).toContain(seo.headline)
    expect(text).toContain(seo.lede)
  })

  it.each(entries)('%s: fits a search result and the voice rules', (_key, seo) => {
    expect(seo.description.length).toBeLessThanOrEqual(160)
    expect(seo.title.length).toBeLessThanOrEqual(70)
    for (const s of [seo.title, seo.description, seo.shareTitle, seo.headline, seo.lede]) {
      expect(s).not.toMatch(/[—–]/)
    }
    // The root template appends " · Frequency"; only the home page opts out with an absolute title.
    if (seo.path !== '/') expect(seo.title).not.toMatch(/Frequency$/)
  })

  it('every path is unique, and every description is unique', () => {
    const paths = entries.map(([, s]) => s.path)
    const descriptions = entries.map(([, s]) => s.description)
    expect(new Set(paths).size).toBe(paths.length)
    expect(new Set(descriptions).size).toBe(descriptions.length)
  })

  it('the For people and For spaces pages no longer describe the DAWN page', () => {
    expect(FREQUENCY_PAGE_SEO.community.description).not.toMatch(/Pillar|Channel/)
    expect(FREQUENCY_PAGE_SEO.spaces.description).not.toMatch(/\bRuns\b/)
  })
})

describe('frequencyPageMetadata', () => {
  it('carries canonical, the root share card and a matching X card', () => {
    const m = frequencyPageMetadata(FREQUENCY_PAGE_SEO.spaces)
    expect(m.title).toBe(FREQUENCY_PAGE_SEO.spaces.title)
    expect(m.alternates).toEqual({ canonical: '/spaces' })
    const og = m.openGraph as Record<string, unknown>
    expect(og.url).toBe('/spaces')
    expect(og.title).toBe('For spaces · Frequency')
    expect(Array.isArray(og.images) && og.images.length).toBe(1)
    expect(m.twitter).toMatchObject({ card: 'summary_large_image', title: 'For spaces · Frequency' })
  })

  it('opts the home title out of the site template', () => {
    expect(frequencyPageMetadata(FREQUENCY_PAGE_SEO.home).title).toEqual({ absolute: 'Frequency · Local groups and events near you' })
  })
})

describe('frequencyPageJsonLd', () => {
  it('emits the visible breadcrumb then the WebPage, and never an Article', () => {
    const nodes = frequencyPageJsonLd(FREQUENCY_PAGE_SEO.spaces)
    expect(nodes.map((n) => n['@type'])).toEqual(['BreadcrumbList', 'WebPage'])
    const crumbs = nodes[0].itemListElement as { name: string }[]
    expect(crumbs.map((c) => c.name)).toEqual(['For spaces'])
    expect(nodes[1].headline).toBe(FREQUENCY_PAGE_SEO.spaces.headline)
  })

  it('emits no breadcrumb on the home page', () => {
    expect(frequencyPageJsonLd(FREQUENCY_PAGE_SEO.home).map((n) => n['@type'])).toEqual(['WebPage'])
  })
})
