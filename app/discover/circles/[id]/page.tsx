import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronRight, Users, MapPin } from 'lucide-react'
import { getPublicCircleById } from '@/lib/discover'
import { SignInCta } from '@/components/discover/cards'
import { SITE_NAME } from '@/lib/site'
import { JsonLd } from '@/components/json-ld'
import { breadcrumbSchema } from '@/lib/jsonld'

export const revalidate = 3600

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const circle = await getPublicCircleById(id)
  if (!circle) return { title: 'Circle not found' }

  const where = circle.city ? ` in ${circle.city}` : ''
  const description =
    circle.about ??
    `${circle.name} is a Frequency circle${where}. Join to meet your neighbors and show up in person.`
  return {
    title: circle.name,
    description,
    alternates: { canonical: `/discover/circles/${circle.id}` },
    openGraph: {
      title: `${circle.name} · ${SITE_NAME}`,
      description,
      url: `/discover/circles/${circle.id}`,
    },
  }
}

export default async function CirclePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const circle = await getPublicCircleById(id)
  if (!circle) notFound()

  return (
    <div className="max-w-3xl mx-auto px-6 py-20 sm:py-24">
      <JsonLd
        data={breadcrumbSchema([
          { name: 'Discover', path: '/discover' },
          { name: 'Circles', path: '/discover' },
          { name: circle.name, path: `/discover/circles/${circle.id}` },
        ])}
      />

      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-xs text-subtle mb-8">
        <Link href="/discover" className="hover:text-text transition-colors">Discover</Link>
        <ChevronRight className="w-3.5 h-3.5" />
        <span className="text-muted">Circles</span>
        <ChevronRight className="w-3.5 h-3.5" />
        <span className="text-text font-medium truncate">{circle.name}</span>
      </nav>

      {/* Header */}
      <header className="mb-8">
        <p className="text-sm font-bold uppercase tracking-[0.25em] text-primary-strong mb-4">
          Find your people
        </p>
        <div className="flex items-start justify-between gap-3 mb-3">
          <h1 className="font-display uppercase text-text text-4xl sm:text-5xl">{circle.name}</h1>
          {circle.status === 'forming' && (
            <span className="shrink-0 mt-2 text-xs px-2 py-1 rounded-md font-medium bg-warning-bg text-warning capitalize">
              forming
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-4 text-sm text-muted">
          <span className="inline-flex items-center gap-1.5">
            <Users className="w-4 h-4" />
            {circle.member_count} {circle.member_count === 1 ? 'member' : 'members'}
          </span>
          {circle.city && (
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="w-4 h-4" />
              {circle.city}
            </span>
          )}
          {circle.channel_name && circle.channel_slug && (
            <Link
              href={`/discover/topics/${circle.channel_slug}`}
              className="inline-flex items-center gap-1 text-primary-strong hover:underline"
            >
              {circle.channel_name}
            </Link>
          )}
        </div>
      </header>

      {/* About */}
      {circle.about && (
        <section className="mb-10">
          <p className="text-lg text-muted leading-relaxed whitespace-pre-line">{circle.about}</p>
        </section>
      )}

      <SignInCta
        title="Sign in to join this circle"
        body="Frequency circles are small on purpose: up to 50 neighbors. Sign up free to request to join and see what's happening."
        action="Sign in to join"
      />
    </div>
  )
}
