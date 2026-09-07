import { articleSchema, breadcrumbSchema, faqSchema } from '@/lib/jsonld'
import { helpHref } from './content-core.ts'
import type { HelpArticle, HelpCategory } from './content-core.ts'

// ── The structured data one help article emits, as a pure function (LIVE-183) ────────────────────
//
// This lived inline in `app/(help)/help/[category]/[slug]/page.tsx`, which meant the only way to
// check it was to read the JSX. That is the shape-not-truth trap AGENTS.md names: `lib/jsonld.ts`
// had accepted `image` and `published` all along and nothing was PASSING them, so every unit test
// of `articleSchema` passed while all 57 live nodes shipped without either field. The builder is a
// plain function here so a test can assert the node the page actually renders.
//
// The page keeps ownership of the two inputs it has to resolve for itself (the article and the
// operator's cover); everything downstream of those is decided here.

/** The cover the help centre falls back to when no operator image is set.
 *
 *  A REAL FILE, served verbatim out of `public/`, and the exact background
 *  `app/(help)/opengraph-image.tsx` reads off disk — so the schema image and the share card are the
 *  same picture. */
export const HELP_FALLBACK_IMAGE = '/images/hero.jpg'

/**
 * 🔴 WHY THIS DOES NOT POINT AT THE PER-ARTICLE OG CARD, even though one now exists next door.
 *
 * A metadata image route whose parent path contains a ROUTE GROUP gets a six-character hash
 * appended to its URL — `getMetadataRouteSuffix` in next/dist/lib/metadata/get-metadata-route.js,
 * which hashes the parent path and suffixes the filename whenever any segment is a `(group)` or a
 * `@parallel` route. Every help route sits under `app/(help)`, so the card is served at
 * `/help/<category>/<slug>/opengraph-image-12boxn`, never at the bare path. (Verified against Next
 * 16.3.3's own hash: the same function returns `12g5h9` for `/(help)`, which is the suffix the help
 * group's own card carries in the build trace.)
 *
 * Next writes that suffixed URL into `og:image` itself, so the SHARE CARD is correct without anyone
 * knowing the hash. A hand-written schema URL is not so lucky: `abs('/help/…/opengraph-image')`
 * would be a 404 in structured data, which is worse than the plain photograph below. The hash is a
 * build detail nobody should hardcode, so the schema points at a static file that cannot move.
 *
 * ⚠️ The same trap is already live elsewhere: `eventSchema` and `spaceSchema` build
 * `abs('/events/<slug>/opengraph-image')` and `abs('/spaces/<slug>/opengraph-image')`, and both of
 * those cards also sit under a route group (`app/(main)`, suffix `lyffkg`). Not touched here — it is
 * a different set of pages and wants its own verification.
 */
export function helpArticleImage(coverImage?: string | null): string {
  return coverImage || HELP_FALLBACK_IMAGE
}

export type HelpArticleJsonLdInput = {
  article: Pick<HelpArticle, 'title' | 'description' | 'slug' | 'published' | 'updated' | 'faq'>
  category: Pick<HelpCategory, 'slug' | 'title'>
  /** The operator's /help Settings image, when one is set (PROG-P5, ADR-1136). */
  coverImage?: string | null
}

/** Every JSON-LD node one help article renders, in the order the page emits them. */
export function helpArticleJsonLd({
  article,
  category,
  coverImage,
}: HelpArticleJsonLdInput): object[] {
  const path = helpHref(category.slug, article.slug)
  return [
    // Article. `image` and `datePublished` are the two fields all 57 nodes shipped without: Google
    // lists image as REQUIRED for the Article rich result and datePublished as recommended, so not
    // one of them was eligible. `published` is the front-matter date backfilled per article; an
    // article without one omits the field rather than inventing a date.
    articleSchema({
      title: article.title,
      description: article.description,
      path,
      published: article.published || null,
      updated: article.updated,
      image: helpArticleImage(coverImage),
    }),
    breadcrumbSchema([
      { name: 'Help', path: '/help' },
      { name: category.title, path: `/help/${category.slug}` },
      { name: article.title, path },
    ]),
    // FAQPage when the article carries a "Questions people ask" section. `article.faq` is DERIVED
    // from the rendered body (lib/help/content-core.ts), so this node cannot disagree with what the
    // page shows. Articles without an FAQ contribute nothing.
    ...(article.faq.length > 0 ? [faqSchema(article.faq)] : []),
  ]
}
