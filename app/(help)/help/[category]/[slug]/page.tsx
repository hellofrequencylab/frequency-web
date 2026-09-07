import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getAllArticles, getArticle, helpHref } from '@/lib/help/content'
import { HelpMarkdown } from '@/components/help/help-markdown'
import { DetailTemplate } from '@/components/templates'
import { resolveDetailHero } from '@/lib/layout/detail-hero'
import { JsonLd } from '@/components/json-ld'
import { articleSchema, breadcrumbSchema, faqSchema } from '@/lib/jsonld'

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
  return {
    title: `${article.title} | Help`,
    description: article.description,
    alternates: { canonical: helpHref(category, slug) },
    // Per-article share cards (the help route group's opengraph-image supplies the image).
    openGraph: {
      title: article.title,
      description: article.description,
      url: helpHref(category, slug),
      type: 'article',
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
    <JsonLd
      data={[
        // Article. `image` and `datePublished` are the LIVE-183 half: Google lists image as
        // REQUIRED for the Article rich result and datePublished as recommended, and all 57 nodes
        // shipped with neither, so not one of them was eligible.
        //
        // The IMAGE resolves the same way the page's own cover band does: the operator's /help
        // Settings image when one is set (`hero.coverImage`, resolved above), else the photograph
        // the help centre's share card is built from. Both are real files a crawler can fetch --
        // `/images/hero.jpg` is served verbatim out of `public/` and is the exact background
        // `app/(help)/opengraph-image.tsx` reads off disk, so the schema image and the share card
        // are the same picture. It deliberately does NOT point at `/opengraph-image`: that is a
        // Next metadata ROUTE, and a schema image has to be a URL that resolves on its own.
        //
        // ⚠️ There is deliberately NO per-article card in this pass. Adding
        // `help/[category]/[slug]/opengraph-image.tsx` spends `check:og-trace` fan-out headroom,
        // which read 18 rasterising + 64 incidental of 100 on the last production build, so it is
        // its own change with its own budget reading. Until then all 57 articles share one card --
        // which is what their `og:image` already does, so this makes the schema agree with the page
        // rather than claiming something richer than the page has.
        articleSchema({
          title: article.title,
          description: article.description,
          path: helpHref(cat.slug, article.slug),
          published: article.published || null,
          updated: article.updated,
          image: typeof hero.coverImage === 'string' ? hero.coverImage : '/images/hero.jpg',
        }),
        breadcrumbSchema([
          { name: 'Help', path: '/help' },
          { name: cat.title, path: `/help/${cat.slug}` },
          { name: article.title, path: helpHref(cat.slug, article.slug) },
        ]),
        // FAQPage when the article carries a "Questions people ask" section. `article.faq` is
        // DERIVED from the rendered body (lib/help/content-core.ts), so this node cannot disagree
        // with what the page shows. Articles without an FAQ contribute nothing.
        ...(article.faq.length > 0 ? [faqSchema(article.faq)] : []),
      ]}
    />
    <DetailTemplate
      {...hero}
      title={article.title}
      subtitle={
        <>
          <Link href={`/help/${cat.slug}`} className="hover:text-text">
            {cat.title}
          </Link>
          {article.updated && <> · Updated {article.updated}</>}
        </>
      }
    >
      <div className="max-w-3xl">
        {article.description && <p className="text-body-lg text-muted">{article.description}</p>}

        <div className="mt-8">
          <HelpMarkdown>{article.body}</HelpMarkdown>
        </div>

        {article.updated && (
          <p className="mt-10 border-t border-border pt-4 text-meta text-subtle">
            Last updated {article.updated}
          </p>
        )}

        <nav className="mt-6 flex justify-between gap-4 text-body-sm">
          {prev ? (
            <Link href={helpHref(cat.slug, prev.slug)} className="text-primary-strong hover:underline">
              &larr; {prev.title}
            </Link>
          ) : (
            <span />
          )}
          {next ? (
            <Link
              href={helpHref(cat.slug, next.slug)}
              className="text-right text-primary-strong hover:underline"
            >
              {next.title} &rarr;
            </Link>
          ) : (
            <span />
          )}
        </nav>
      </div>
    </DetailTemplate>
    </>
  )
}
