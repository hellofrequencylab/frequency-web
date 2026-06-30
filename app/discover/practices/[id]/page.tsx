import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { getPublicPractice, listPublicPractices } from '@/lib/practices'
import { SignInCta } from '@/components/discover/cards'
import { ShareButton } from '@/components/discover/share-button'
import { DetailTemplate } from '@/components/templates'
import { SITE_NAME } from '@/lib/site'
import { JsonLd } from '@/components/json-ld'
import { practiceSchema, breadcrumbSchema } from '@/lib/jsonld'

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
    openGraph: { title: ogTitle, description, url: `/discover/practices/${practice.slug ?? practice.id}`, type: 'article' },
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

  return (
    <div className="mx-auto max-w-3xl px-6 py-20 sm:py-24">
      <JsonLd
        data={[
          practiceSchema(practice),
          breadcrumbSchema([
            { name: 'Discover', path: '/discover' },
            { name: 'Practices', path: '/discover/practices' },
            { name: practice.title, path: `/discover/practices/${practice.slug ?? practice.id}` },
          ]),
        ]}
      />

      <Link
        href="/discover/practices"
        className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-muted transition-colors hover:text-text"
      >
        <ChevronLeft className="h-4 w-4" />
        Practices
      </Link>

      <DetailTemplate
        title={practice.title}
        actions={
          <ShareButton
            path={`/discover/practices/${practice.slug ?? practice.id}`}
            title={`${practice.title} · ${SITE_NAME}`}
            text={practice.summary ?? practice.description ?? `A practice on ${SITE_NAME}.`}
            label="Share"
          />
        }
        badges={
          practice.subcategory ? (
            <span className="rounded-md bg-surface-elevated px-1.5 py-0.5 text-xs font-medium text-muted">
              {practice.subcategory.name}
            </span>
          ) : undefined
        }
      >
        {(practice.summary || practice.description) && (
          <p className="mb-8 max-w-2xl text-lg leading-relaxed text-muted">
            {practice.summary ?? practice.description}
          </p>
        )}

        {practice.body && (
          <div className="mb-8 max-w-2xl whitespace-pre-line text-base leading-relaxed text-text">
            {practice.body}
          </div>
        )}

        {practice.tags.length > 0 && (
          <div className="mb-10 flex flex-wrap gap-2">
            {practice.tags.map((t) => (
              <span key={t.slug} className="rounded-full bg-surface-elevated px-2.5 py-1 text-xs text-subtle">
                {t.label}
              </span>
            ))}
          </div>
        )}

        <SignInCta
          title="Start this practice"
          body={`Join Frequency to adopt ${practice.title}, log it with people near you, and earn zaps for showing up. Free to join.`}
          action="Get started"
        />
      </DetailTemplate>
    </div>
  )
}
