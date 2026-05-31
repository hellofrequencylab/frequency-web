import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getAllCategories, helpHref } from '@/lib/help/content'

type Params = { params: Promise<{ category: string }> }

export async function generateStaticParams() {
  const categories = await getAllCategories()
  return categories.map((c) => ({ category: c.slug }))
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { category } = await params
  const cat = (await getAllCategories()).find((c) => c.slug === category)
  if (!cat) return {}
  return {
    title: `${cat.title} | Help`,
    description: cat.description,
    alternates: { canonical: `/help/${cat.slug}` },
  }
}

export default async function HelpCategoryPage({ params }: Params) {
  const { category } = await params
  const cat = (await getAllCategories()).find((c) => c.slug === category)
  if (!cat) notFound()

  return (
    <div>
      <nav className="mb-4 text-sm text-subtle">
        <Link href="/help" className="hover:text-text">
          Help
        </Link>{' '}
        / <span className="text-muted">{cat.title}</span>
      </nav>

      <h1 className="font-display text-3xl text-text">{cat.title}</h1>
      {cat.description && <p className="mt-2 text-muted">{cat.description}</p>}

      <ul className="mt-8 divide-y divide-border rounded-xl border border-border bg-surface-elevated">
        {cat.articles.map((a) => (
          <li key={a.slug}>
            <Link href={helpHref(cat.slug, a.slug)} className="block px-5 py-4 hover:bg-surface">
              <span className="block font-medium text-text">{a.title}</span>
              {a.description && (
                <span className="mt-0.5 block text-sm text-muted">{a.description}</span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
