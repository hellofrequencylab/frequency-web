import type { Metadata, ResolvingMetadata } from 'next'
import { helpPageMetadata } from '@/lib/help/metadata'
import { SITE_NAME } from '@/lib/site'
import { getAllCategories, helpHref } from '@/lib/help/content'
import { JsonLd } from '@/components/json-ld'
import { breadcrumbSchema } from '@/lib/jsonld'
import { FrequencyHelp } from '@/components/frequency/site/pages/help/frequency-help'

const HELP_METADATA: Metadata = {
  title: 'Help Center',
  description:
    'Guides and answers for using Frequency: finding Circles, going to gatherings, and how the Quest works.',
  alternates: { canonical: '/help' },
  // Without this block the page inherits the ROOT openGraph whole, homepage og:url and all
  // (SCAN-657). Next replaces nested metadata objects; it does not merge them.
  openGraph: {
    type: 'website',
    siteName: SITE_NAME,
    locale: 'en_US',
    title: `Help Center · ${SITE_NAME}`,
    description:
      'Guides and answers for using Frequency: finding Circles, going to gatherings, and how the Quest works.',
    url: '/help',
  },
}

export async function generateMetadata(
  _props: { params: Promise<Record<string, never>> },
  parent: ResolvingMetadata,
): Promise<Metadata> {
  return helpPageMetadata(HELP_METADATA, parent)
}

export default async function HelpHomePage() {
  const categories = await getAllCategories()
  return (
    <>
      <JsonLd data={breadcrumbSchema([{ name: 'Help', path: '/help' }])} />
      <FrequencyHelp
        topics={categories.map((c) => ({
          slug: c.slug,
          title: c.title,
          description: c.description,
          articles: c.articles.map((a) => ({
            title: a.title,
            description: a.description,
            href: helpHref(c.slug, a.slug),
          })),
        }))}
      />
    </>
  )
}
