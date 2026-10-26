import type { Metadata, ResolvingMetadata } from 'next'
import { helpPageMetadata } from '@/lib/help/metadata'
import { SITE_NAME } from '@/lib/site'
import { notFound } from 'next/navigation'
import { getAllCategories, helpHref } from '@/lib/help/content'
import { JsonLd } from '@/components/json-ld'
import { breadcrumbSchema } from '@/lib/jsonld'
import { FrequencyHelpCategory } from '@/components/frequency/site/pages/help/frequency-help-pages'

type Params = { params: Promise<{ category: string }> }

export async function generateStaticParams() {
  const categories = await getAllCategories()
  return categories.map((c) => ({ category: c.slug }))
}

export async function generateMetadata({ params }: Params, parent: ResolvingMetadata): Promise<Metadata> {
  const { category } = await params
  const cat = (await getAllCategories()).find((c) => c.slug === category)
  if (!cat) return {}
  return helpPageMetadata({
    title: `${cat.title} · Help`,
    description: cat.description,
    alternates: { canonical: `/help/${cat.slug}` },
    openGraph: {
      type: 'website',
      siteName: SITE_NAME,
      locale: 'en_US',
      title: `${cat.title} · Help · ${SITE_NAME}`,
      description: cat.description,
      url: `/help/${cat.slug}`,
    },
  }, parent)
}

export default async function HelpCategoryPage({ params }: Params) {
  const { category } = await params
  const cat = (await getAllCategories()).find((c) => c.slug === category)
  if (!cat) notFound()

  const crumbsLd = (
    <JsonLd
      data={breadcrumbSchema([
        { name: 'Help', path: '/help' },
        { name: cat.title, path: `/help/${cat.slug}` },
      ])}
    />
  )
  return (
    <>
      {crumbsLd}
      <FrequencyHelpCategory
        slug={cat.slug}
        title={cat.title}
        description={cat.description}
        articles={cat.articles.map((a) => ({ title: a.title, description: a.description, href: helpHref(cat.slug, a.slug) }))}
      />
    </>
  )
}
