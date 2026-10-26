import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getPillars, PILLAR_SLUGS } from '@/lib/pillars'
import { searchLibraryPractices } from '@/lib/practices'
import { OG_SITE, SITE_NAME } from '@/lib/site'
import { JsonLd } from '@/components/json-ld'
import { practiceListSchema, breadcrumbSchema } from '@/lib/jsonld'
import { resolveIndexHero } from '@/lib/layout/index-hero'
import { FrequencyPillarPractices } from '@/components/frequency/site/pages/discover/practices'

export const revalidate = 3600

export function generateStaticParams() {
  return PILLAR_SLUGS.map((slug) => ({ slug }))
}

async function loadPillar(slug: string) {
  const pillars = await getPillars().catch(() => [])
  const pillar = pillars.find((p) => p.slug === slug)
  if (!pillar) return null
  const result = await searchLibraryPractices({
    pillarId: pillar.id,
    hideDemo: true,
    pageSize: 60,
    sort: 'trending',
  }).catch(() => null)
  return { pillar, pillars, rows: result?.rows ?? [] }
}

function pillarDescription(name: string, fallback: string | null): string {
  return (
    fallback ??
    `Frequency practices for ${name}: small, repeatable real-world acts you can do with people near you. Browse the ${name} library and start one today.`
  )
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const data = await loadPillar(slug)
  if (!data) return { title: 'Pillar not found' }

  const title = `${data.pillar.name} Practices`
  const full = pillarDescription(data.pillar.name, data.pillar.description)
  const description = full.length > 155 ? `${full.slice(0, 152).trimEnd()}…` : full
  const url = `/discover/practices/pillar/${slug}`
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { ...OG_SITE, title: `${title} · ${SITE_NAME}`, description, url, type: 'website' },
    twitter: { card: 'summary_large_image', title: `${title} · ${SITE_NAME}`, description },
  }
}

export default async function PillarPracticesPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const data = await loadPillar(slug)
  if (!data) notFound()

  const { pillar, pillars, rows } = data
  const title = `${pillar.name} Practices`
  // The shared hero band (LIVE-117, ADR-1261): rung 1 reads the '/discover/practices' section key,
  // so the operator's library cover heads every pillar page without one being picked per pillar.
  const hero = await resolveIndexHero(`/discover/practices/pillar/${slug}`)
  const schema = [
    practiceListSchema(rows, title),
    breadcrumbSchema([
      { name: 'Discover', path: '/discover' },
      { name: 'Practices', path: '/discover/practices' },
      { name: pillar.name, path: `/discover/practices/pillar/${slug}` },
    ]),
  ]
  return (
    <>
      <JsonLd data={schema} />
      <FrequencyPillarPractices
        pillar={pillar}
        description={pillarDescription(pillar.name, pillar.description)}
        pillars={pillars}
        rows={rows}
        image={hero.heroImage}
      />
    </>
  )
}
