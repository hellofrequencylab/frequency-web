import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getPillars, PILLAR_SLUGS } from '@/lib/pillars'
import { searchLibraryPractices } from '@/lib/practices'
import { PracticeCard, PillarChips } from '../../practice-card'
import { SITE_NAME } from '@/lib/site'
import { JsonLd } from '@/components/json-ld'
import { practiceListSchema, breadcrumbSchema } from '@/lib/jsonld'

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
    openGraph: { title: `${title} · ${SITE_NAME}`, description, url, type: 'website' },
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

  return (
    <div className="mx-auto max-w-5xl px-6 py-20 sm:py-24">
      <JsonLd
        data={[
          practiceListSchema(rows, title),
          breadcrumbSchema([
            { name: 'Discover', path: '/discover' },
            { name: 'Practices', path: '/discover/practices' },
            { name: pillar.name, path: `/discover/practices/pillar/${slug}` },
          ]),
        ]}
      />

      <header className="mb-8 max-w-2xl">
        <h1 className="text-3xl font-bold tracking-tight text-text">{title}</h1>
        <p className="mt-3 text-lg text-muted">
          {pillarDescription(pillar.name, pillar.description)}
        </p>
      </header>

      <PillarChips pillars={pillars} active={slug} />

      {rows.length === 0 ? (
        <p className="text-muted">
          No {pillar.name} practices yet.{' '}
          <Link className="underline hover:text-text" href="/discover/practices">
            Browse the full library
          </Link>
          .
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((p) => (
            <PracticeCard key={p.id} p={p} />
          ))}
        </ul>
      )}
    </div>
  )
}
