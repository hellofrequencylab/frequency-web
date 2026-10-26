import type { Metadata } from 'next'
import { notFound, permanentRedirect } from 'next/navigation'
import { getPublicPractice, listPublicPractices } from '@/lib/practices'
import { resolveDetailHero } from '@/lib/layout/detail-hero'
import { OG_SITE, SITE_NAME } from '@/lib/site'
import { JsonLd } from '@/components/json-ld'
import { practiceSchema, breadcrumbSchema } from '@/lib/jsonld'
import { FrequencyPractice } from '@/components/frequency/site/pages/discover/practices'

export const revalidate = 3600

export async function generateStaticParams() {
  const practices = await listPublicPractices('top').catch(() => [])
  return practices.map((p) => ({ id: p.slug ?? p.id }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const practice = await getPublicPractice(id)
  if (!practice) return { title: 'Practice not found' }

  const full = practice.summary ?? practice.description ?? `${practice.title}: a Frequency practice.`
  const description = full.length > 155 ? `${full.slice(0, 152).trimEnd()}…` : full
  const ogTitle = `${practice.title} · ${SITE_NAME}`
  return {
    title: practice.title,
    description,
    alternates: { canonical: `/discover/practices/${practice.slug ?? practice.id}` },
    openGraph: { ...OG_SITE, title: ogTitle, description, url: `/discover/practices/${practice.slug ?? practice.id}`, type: 'article' },
    twitter: { card: 'summary_large_image', title: ogTitle, description },
  }
}

export default async function PublicPracticePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const practice = await getPublicPractice(id)
  if (!practice) notFound()

  // The uuid form 308s to the slug, as the circle twin does (LIVE-182, SCAN-811): both resolve,
  // but a page reachable at two addresses splits its own crawl signal, and the uuid is the form
  // members share from /practices/<id>. Guarded on a non-null slug that differs from the segment,
  // so it cannot loop and a practice with no slug still resolves by uuid.
  if (practice.slug && id !== practice.slug) permanentRedirect(`/discover/practices/${practice.slug}`)

  // The standard entity cover (PROG-P5, ADR-1117). The public twin of /practices/<id>: the SAME
  // ladder and the SAME `header_image`, so a practice whose photo already showed in-app now shows
  // it here too. The section's tail differs on purpose — a signed-out visitor cannot fill an empty
  // cover slot, so a practice with no photo gets no band rather than a grey placeholder.
  const hero = await resolveDetailHero(`/discover/practices/${practice.slug ?? practice.id}`, {
    entityImage: practice.header_image,
  })
  const schema = [
    practiceSchema(practice),
    breadcrumbSchema([
      { name: 'Discover', path: '/discover' },
      { name: 'Practices', path: '/discover/practices' },
      { name: practice.title, path: `/discover/practices/${practice.slug ?? practice.id}` },
    ]),
  ]
  return (
    <>
      <JsonLd data={schema} />
      <FrequencyPractice practice={practice} image={hero.coverImage} />
    </>
  )
}
