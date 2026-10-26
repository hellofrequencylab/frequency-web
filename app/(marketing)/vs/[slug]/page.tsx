// Comparison / "alternative to X" pages (GE11-1). One template, every "Frequency
// vs X" page generated from the lib/marketing/comparisons registry. Public
// marketing chrome, answer-first copy, real canonical, Article + FAQ + breadcrumb
// JSON-LD. Voice + naming locked (CONTENT-VOICE, NAMING): plain, honest, no em
// dashes, no health claims, the skeptic test. We never knock the other tool.
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { JsonLd } from '@/components/json-ld'
import { articleSchema, faqSchema, breadcrumbSchema } from '@/lib/jsonld'
import { OG_SITE, SITE_NAME } from '@/lib/site'
import {
  COMPARISONS,
  getComparison,
  comparisonCopy,
  comparisonPath,
} from '@/lib/marketing/comparisons'
import { FrequencyCompare } from '@/components/frequency/site/pages/funnel/frequency-compare'

export const revalidate = 3600

// The whole set is known at build time (a static registry), so pre-render every
// comparison and lock the route to it: an unknown /vs/<x> 404s rather than render
// a thin, made-up page.
export const dynamicParams = false

export function generateStaticParams() {
  return COMPARISONS.map((c) => ({ slug: c.slug }))
}

// A real gathering photo doubles as the multimodal AIO signal + E-E-A-T proof.
const HERO_IMAGE = '/images/site/community-dinner.jpg'


export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const comparison = getComparison(slug)
  if (!comparison) return { title: 'Not found' }
  const copy = comparisonCopy(comparison)
  const canonical = comparisonPath(slug)
  return {
    title: copy.metaTitle,
    description: copy.description,
    alternates: { canonical },
    openGraph: {
      ...OG_SITE,
      title: `${copy.ogTitle} · ${SITE_NAME}`,
      description: copy.description,
      url: canonical,
      type: 'article',
      images: [{ url: HERO_IMAGE }],
    },
    twitter: {
      card: 'summary_large_image',
      title: `${copy.ogTitle} · ${SITE_NAME}`,
      description: copy.description,
    },
  }
}

export default async function ComparisonPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const comparison = getComparison(slug)
  if (!comparison) notFound()
  const copy = comparisonCopy(comparison)
  const path = comparisonPath(slug)

  return (
    <>
      <JsonLd
        data={[
          articleSchema({
            title: copy.metaTitle,
            description: copy.description,
            path,
            published: comparison.published,
            updated: comparison.updated,
            image: HERO_IMAGE,
          }),
          faqSchema(copy.faq),
          breadcrumbSchema([
            { name: 'Compare', path: '/vs' },
            { name: copy.h1, path },
          ]),
        ]}
      />

      <FrequencyCompare comparison={comparison} image={HERO_IMAGE} />
    </>
  )
}
