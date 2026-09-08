import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getAllCategories, helpHref } from '@/lib/help/content'
import { IndexTemplate } from '@/components/templates'
import { resolveIndexHero } from '@/lib/layout/index-hero'
import { JsonLd } from '@/components/json-ld'
import { breadcrumbSchema } from '@/lib/jsonld'

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

  // The shared hero band (LIVE-117, ADR-1261). A category page is a DYNAMIC route, so rung 1 reads
  // `page_settings` on '/help' — the section key the map hands it — and the Help image an operator
  // set on the section root stands behind every category.
  const hero = await resolveIndexHero(`/help/${cat.slug}`)

  return (
    <IndexTemplate
      {...hero}
      title={cat.title}
      description={cat.description}
      back={{ href: '/help', label: 'Help center' }}
    >
      <JsonLd
        data={breadcrumbSchema([
          { name: 'Help', path: '/help' },
          { name: cat.title, path: `/help/${cat.slug}` },
        ])}
      />
      <ul className="divide-y divide-border rounded-card border border-border bg-surface-elevated">
        {cat.articles.map((a) => (
          <li key={a.slug}>
            <Link href={helpHref(cat.slug, a.slug)} className="block px-5 py-4 hover:bg-surface">
              <span className="block font-medium text-text">{a.title}</span>
              {a.description && (
                <span className="mt-0.5 block text-body-sm text-muted">{a.description}</span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </IndexTemplate>
  )
}
