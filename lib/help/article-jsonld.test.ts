import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { sourceWithoutComments } from '@/test/source-shape'
import { helpArticleJsonLd, helpArticleImage, HELP_FALLBACK_IMAGE } from './article-jsonld.ts'
import { loadCategoriesFromDisk, selectCategories } from './content-core.ts'
import { SITE_URL } from '../site.ts'

// ── LIVE-183 · the node the PAGE renders, not the builder it calls ───────────────────────────────
//
// `lib/jsonld.test.ts` already proves `articleSchema` CAN carry `image` and `datePublished`. It
// always could — and all 57 live Article nodes still shipped without either, because nothing passed
// them. A test of the builder cannot see that; only a test of the caller can. This file asserts the
// consequence at the boundary: for every real article on disk, the emitted node carries both.
//
// Reverting `helpArticleJsonLd` to the pre-fix call (drop `image`, drop `published`) turns the
// first two tests red on all 57 articles.

const article = {
  title: 'How to join a Circle',
  description: 'Find a local group around what you practice.',
  slug: 'join-a-circle',
  published: '2026-05-31',
  updated: '2026-06-16',
  faq: [] as { q: string; a: string }[],
}
const category = { slug: 'getting-started', title: 'Getting started' }

const articleNode = (nodes: object[]) =>
  nodes.find((n) => (n as { '@type': string })['@type'] === 'Article') as
    | Record<string, unknown>
    | undefined

describe('helpArticleJsonLd — the two fields all 57 nodes shipped without', () => {
  it('carries an image', () => {
    const node = articleNode(helpArticleJsonLd({ article, category }))
    expect(node?.image).toEqual([`${SITE_URL}${HELP_FALLBACK_IMAGE}`])
  })

  it('carries datePublished, and dateModified beside it', () => {
    const node = articleNode(helpArticleJsonLd({ article, category }))
    expect(node?.datePublished).toBe('2026-05-31')
    expect(node?.dateModified).toBe('2026-06-16')
  })

  it('prefers the operator cover over the fallback photograph', () => {
    const node = articleNode(
      helpArticleJsonLd({ article, category, coverImage: 'https://cdn.example/cover.jpg' }),
    )
    expect(node?.image).toEqual(['https://cdn.example/cover.jpg'])
  })

  it('omits datePublished rather than inventing one when the front matter has none', () => {
    const node = articleNode(helpArticleJsonLd({ article: { ...article, published: '' }, category }))
    expect(node).not.toHaveProperty('datePublished')
  })

  it('still emits the breadcrumb, and the FAQ only when the body has one', () => {
    const types = (nodes: object[]) => nodes.map((n) => (n as { '@type': string })['@type'])
    expect(types(helpArticleJsonLd({ article, category }))).toEqual(['Article', 'BreadcrumbList'])
    expect(
      types(helpArticleJsonLd({ article: { ...article, faq: [{ q: 'Q', a: 'A' }] }, category })),
    ).toEqual(['Article', 'BreadcrumbList', 'FAQPage'])
  })
})

describe('helpArticleJsonLd — against the real corpus, every article', () => {
  it('emits a complete Article node for all of them', async () => {
    const cats = selectCategories(await loadCategoriesFromDisk())
    const rows = cats.flatMap((c) => c.articles.map((a) => ({ a, c })))
    // The floor keeps this from passing vacuously if content/help stops being readable
    // (loadCategoriesFromDisk returns [] rather than throwing).
    expect(rows.length).toBeGreaterThanOrEqual(50)

    const incomplete = rows
      .map(({ a, c }) => ({
        id: `${c.slug}/${a.slug}`,
        node: articleNode(helpArticleJsonLd({ article: a, category: c })),
      }))
      .filter(
        ({ node }) =>
          !node ||
          !Array.isArray(node.image) ||
          node.image.length === 0 ||
          typeof node.datePublished !== 'string',
      )
      .map(({ id }) => id)

    expect(incomplete).toEqual([])
  })
})

describe('the schema image is a URL that resolves on its own', () => {
  it('never points at a metadata image ROUTE', () => {
    // 🔴 The trap this exists for. The per-article card next door is served at
    // `/help/<category>/<slug>/opengraph-image-12boxn` — Next appends a hash to any metadata image
    // route whose parent path contains a route group, and every help route sits under `app/(help)`.
    // ⚠️ AND THE BARE PATH IS NOT A 404 — it answers 200 with the HOME PAGE's HTML (measured on
    // production 2026-09-07, `x-matched-path: /`), which is why the same mistake elsewhere in the
    // schema survived a build, a lint and 14,000 tests. `abs('.../opengraph-image')` in structured
    // data would advertise an HTML document as an image, which is worse than the plain photograph
    // and reported by nothing. Next writes the suffixed URL into og:image itself; nothing
    // hand-written can.
    const images = articleNode(helpArticleJsonLd({ article, category }))?.image
    expect(Array.isArray(images)).toBe(true)
    for (const src of images as string[]) expect(src).not.toMatch(/opengraph-image|twitter-image/)
  })

  it('and the fallback is a real file in public/', () => {
    expect(() => readFileSync(`public${HELP_FALLBACK_IMAGE}`)).not.toThrow()
    // The same photograph the group share card reads off disk, so the two never disagree.
    const card = readFileSync('app/(help)/opengraph-image.tsx', 'utf8')
    expect(card).toContain(`public${HELP_FALLBACK_IMAGE}`)
  })

  it('helpArticleImage falls back for every empty shape a cover can take', () => {
    expect(helpArticleImage(null)).toBe(HELP_FALLBACK_IMAGE)
    expect(helpArticleImage(undefined)).toBe(HELP_FALLBACK_IMAGE)
    expect(helpArticleImage('')).toBe(HELP_FALLBACK_IMAGE)
  })
})

describe('the page renders THIS builder, not a hand-rolled copy', () => {
  // The extraction is only worth anything while the page still calls it. A future edit that inlines
  // articleSchema back into the JSX would leave every test above green and the live node unguarded,
  // which is the exact way the fields went missing in the first place.
  // Comment- and import-free (LIVE-167): the call is the needle, never the import line.
  const src = sourceWithoutComments('app/(help)/help/[category]/[slug]/page.tsx', { imports: true })

  it('imports and calls helpArticleJsonLd', () => {
    expect(src).not.toMatch(/function helpArticleJsonLd\b/)
    expect(src).toContain('helpArticleJsonLd({')
  })

  it('builds no Article or FAQ node of its own', () => {
    expect(src).not.toContain('articleSchema(')
    expect(src).not.toContain('faqSchema(')
  })
})
