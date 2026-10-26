import type { Metadata } from 'next'
import { SITE_NAME } from '@/lib/site'
import { notFound } from 'next/navigation'
import { getAllArticles, getArticle, helpHref } from '@/lib/help/content'
import { resolveDetailHero } from '@/lib/layout/detail-hero'
import { JsonLd } from '@/components/json-ld'
import { helpArticleJsonLd } from '@/lib/help/article-jsonld'
import { OG_SITE } from '@/lib/site'
import { FrequencyHelpArticle } from '@/components/frequency/site/pages/help/frequency-help-pages'

type Params = { params: Promise<{ category: string; slug: string }> }

export async function generateStaticParams() {
  const articles = await getAllArticles()
  return articles.map((a) => ({ category: a.category, slug: a.slug }))
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { category, slug } = await params
  const found = await getArticle(category, slug)
  if (!found) return {}
  const { article } = found
  // A twin of a marketing guide names the guide in its `canonical:` key (SCAN-673), so the guide is
  // the one URL that ranks for the query; every other article stays self-canonical.
  const canonical = article.canonical || helpHref(category, slug)
  return {
    title: `${article.title} · Help`,
    description: article.description,
    alternates: { canonical },
    // The IMAGE is not set here on purpose. `opengraph-image.tsx` / `twitter-image.tsx` sit beside
    // this file, and Next merges the file-convention card into `openGraph.images` /
    // `twitter.images` itself — at the hash-suffixed URL only Next knows (see the note in
    // lib/help/article-jsonld.ts). Setting `images` by hand here would OVERRIDE that card with a
    // guess: resolve-metadata skips the static file whenever the source object already owns the key.
    openGraph: {
      ...OG_SITE,
      title: article.title,
      description: article.description,
      // og:url follows the canonical so a share of a twin credits the guide, not the twin.
      url: canonical,
      type: 'article',
      siteName: SITE_NAME,
      locale: 'en_US',
      // The dates the page already prints and the Article node already carries, as the OG article
      // properties crawlers read for freshness (SCAN-667). `published` is '' for a file without the
      // key, so each is guarded.
      ...(article.published ? { publishedTime: article.published } : {}),
      ...(article.updated ? { modifiedTime: article.updated } : {}),
    },
    twitter: {
      card: 'summary_large_image',
      title: article.title,
      description: article.description,
    },
  }
}

export default async function HelpArticlePage({ params }: Params) {
  const { category, slug } = await params
  const found = await getArticle(category, slug)
  if (!found) notFound()
  const { article, category: cat } = found

  const idx = cat.articles.findIndex((a) => a.slug === article.slug)
  const prev = idx > 0 ? cat.articles[idx - 1] : null
  const next = idx < cat.articles.length - 1 ? cat.articles[idx + 1] : null

  // The standard entity cover (PROG-P5, ADR-1136): the operator's /help Settings image, or
  // nothing. Help articles carry no cover of their own.
  const hero = await resolveDetailHero(helpHref(cat.slug, article.slug))
  return (
    <>
      <JsonLd data={helpArticleJsonLd({ article, category: cat, coverImage: hero.coverImage })} />
      <FrequencyHelpArticle
        slug={article.slug}
        title={article.title}
        description={article.description}
        body={article.body}
        updated={article.updated}
        category={{ slug: cat.slug, title: cat.title }}
        prev={prev ? { title: prev.title, href: helpHref(cat.slug, prev.slug) } : null}
        next={next ? { title: next.title, href: helpHref(cat.slug, next.slug) } : null}
      />
    </>
  )
}
