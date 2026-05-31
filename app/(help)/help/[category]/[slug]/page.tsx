import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getAllArticles, getArticle, helpHref } from '@/lib/help/content'
import { HelpMarkdown } from '@/components/help/help-markdown'

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

  return (
    <article className="max-w-3xl">
      <nav className="mb-4 text-sm text-subtle">
        <Link href="/help" className="hover:text-text">
          Help
        </Link>{' '}
        /{' '}
        <Link href={`/help/${cat.slug}`} className="hover:text-text">
          {cat.title}
        </Link>{' '}
        / <span className="text-muted">{article.title}</span>
      </nav>

      <h1 className="font-display text-3xl text-text">{article.title}</h1>
      {article.description && <p className="mt-2 text-lg text-muted">{article.description}</p>}

      <div className="mt-8">
        <HelpMarkdown>{article.body}</HelpMarkdown>
      </div>

      {article.updated && (
        <p className="mt-10 border-t border-border pt-4 text-xs text-subtle">
          Last updated {article.updated}
        </p>
      )}

      <nav className="mt-6 flex justify-between gap-4 text-sm">
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
    </article>
  )
}
