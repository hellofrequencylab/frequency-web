import { describe, it, expect } from 'vitest'
import {
  collect,
  floorViolation,
  MIN_ARTICLES,
  MIN_FEATURE_KEYS,
  type Corpus,
} from './help-coverage.mts'
import type { HelpArticle } from '../lib/help/content.ts'
import type { FeatureKey } from '../lib/help/feature-keys.ts'

// `check:help` had two holes, and they compounded. Coverage failures were advisory because
// package.json never passed --strict, and the whole gate was vacuous on an empty corpus because
// lib/help/content.ts returns `[]` (not a throw) when content/help cannot be read. These tests pin
// the live corpus against both floors and prove the floor logic fires on a synthetic empty one.

const article = (over: Partial<HelpArticle> = {}): HelpArticle => ({
  category: 'getting-started',
  slug: 'a',
  title: 'A',
  description: '',
  order: 1,
  updated: '2026-08-11',
  audience: 'member',
  featureKeys: [],
  status: 'published',
  body: '',
  faq: [],
  ...over,
})

const key = (over: Partial<FeatureKey> = {}): FeatureKey => ({
  key: 'k',
  label: 'K',
  area: 'community',
  routes: ['/k'],
  core: true,
  ...over,
})

describe('the live corpus is real', () => {
  it('clears both floors', async () => {
    // Measured 2026-08-11: 55 articles, 46 feature keys. If this fails, content/help or the
    // registry stopped being readable — not that the help center lost half its content.
    const c = await collect()
    expect(c.articles.length).toBeGreaterThanOrEqual(MIN_ARTICLES)
    expect(c.featureKeys.length).toBeGreaterThanOrEqual(MIN_FEATURE_KEYS)
    expect(floorViolation(c)).toBeNull()
  })

  it('has no orphan key, which fails in every mode', async () => {
    const c = await collect()
    expect([...c.orphans.keys()]).toEqual([])
  })

  it('passes --strict: every CORE feature is documented', async () => {
    // The reason wiring --strict into package.json changed no outcome on 2026-08-11. It is a
    // ratchet, not a fix: this test is what fails when the next core feature ships without an
    // article, before CI ever runs.
    const c = await collect()
    expect(c.coreMissing.map((f) => f.key)).toEqual([])
    expect(c.coreCovered.length).toBe(c.core.length)
  })

  it('the undocumented keys that remain are all secondary', async () => {
    // `core: false` IS the allowlist — one boolean per registry row, rather than a second list
    // that can drift away from it. Assert the two stay in sync.
    const c = await collect()
    const missing = c.featureKeys.filter((f) => c.statusOf(f.key) === 'missing')
    expect(missing.length).toBeGreaterThan(0) // if this ever hits 0, the backlog is done
    expect(missing.every((f) => !f.core)).toBe(true)
  })
})

describe('the floor fires on a corpus that is not', () => {
  const empty: Corpus = { articles: [], featureKeys: [] }

  it('an empty content tree is a FAILURE, not 100% coverage', async () => {
    const c = await collect(empty)
    // Every verdict below the floor is vacuously clean on this corpus — which is the whole point.
    expect(c.orphans.size).toBe(0)
    expect(c.coreMissing).toEqual([])
    expect(floorViolation(c)).toMatch(/read only 0 help article/)
  })

  it('an empty registry fails even with a full content tree', async () => {
    // 0 core keys missing out of 0 core keys is 100% core coverage, and --strict is happy with it.
    const c = await collect({
      articles: Array.from({ length: MIN_ARTICLES + 5 }, (_, i) => article({ slug: `a${i}` })),
      featureKeys: [],
    })
    expect(c.coreMissing).toEqual([])
    expect(c.allCovered).toBe(0)
    expect(floorViolation(c)).toMatch(/loaded only 0 feature key/)
  })

  it('says the silence means nothing, rather than reporting health', () => {
    expect(floorViolation(empty)).toMatch(/means nothing/)
  })

  it('a corpus at the floors passes it', () => {
    expect(
      floorViolation({
        articles: Array.from({ length: MIN_ARTICLES }, () => article()),
        featureKeys: Array.from({ length: MIN_FEATURE_KEYS }, (_, i) => key({ key: `k${i}` })),
      }),
    ).toBeNull()
  })
})

describe('the scoring underneath the floor still works', () => {
  const featureKeys = [
    key({ key: 'circles', core: true }),
    key({ key: 'nexuses', core: false }),
    key({ key: 'search', core: true }),
  ]

  it('separates published, draft-only, and undocumented', async () => {
    const c = await collect({
      featureKeys,
      articles: [
        article({ slug: 'pub', featureKeys: ['circles'] }),
        article({ slug: 'wip', status: 'draft', featureKeys: ['nexuses'] }),
      ],
    })
    expect(c.statusOf('circles')).toBe('covered')
    expect(c.statusOf('nexuses')).toBe('draft') // a draft does not count as covered
    expect(c.statusOf('search')).toBe('missing')
    expect(c.coreMissing.map((f) => f.key)).toEqual(['search'])
  })

  it('an article key with no registry row is an orphan, named with its article', async () => {
    const c = await collect({
      featureKeys,
      articles: [article({ category: 'safety', slug: 'reporting', featureKeys: ['ghost'] })],
    })
    expect([...c.orphans.entries()]).toEqual([['ghost', ['safety/reporting']]])
  })

  it('scores a seeded registry against ITSELF, not the real one', async () => {
    // The seam swaps FEATURE_KEYS; if `collect` still consulted the module-level FEATURE_KEY_SET,
    // 'circles' would resolve through the real registry and this orphan would go unreported.
    const c = await collect({
      featureKeys: [key({ key: 'only-this-one' })],
      articles: [article({ featureKeys: ['circles'] })],
    })
    expect([...c.orphans.keys()]).toEqual(['circles'])
  })
})
