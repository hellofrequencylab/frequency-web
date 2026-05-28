import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronRight } from 'lucide-react'
import {
  getTopicalChannels,
  getTopicalChannelBySlug,
  getPublicCirclesByChannel,
} from '@/lib/discover'
import { CircleCard, SignInCta } from '@/components/discover/cards'
import { SITE_NAME } from '@/lib/site'
import { JsonLd } from '@/components/json-ld'
import { circleListSchema, breadcrumbSchema } from '@/lib/jsonld'

export const revalidate = 3600

// Pre-render the seeded topical channels at build time; others render on demand.
export async function generateStaticParams() {
  const channels = await getTopicalChannels()
  return channels.map((c) => ({ slug: c.slug }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const channel = await getTopicalChannelBySlug(slug)
  if (!channel) return { title: 'Topic not found' }

  const description =
    channel.description ??
    `Explore ${channel.name} circles and community across Frequency.`
  return {
    title: channel.name,
    description,
    alternates: { canonical: `/discover/topics/${channel.slug}` },
    openGraph: {
      title: `${channel.name} — ${SITE_NAME}`,
      description,
      url: `/discover/topics/${channel.slug}`,
    },
  }
}

export default async function TopicPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const channel = await getTopicalChannelBySlug(slug)
  if (!channel) notFound()

  const circles = await getPublicCirclesByChannel(channel.slug)

  return (
    <div className="max-w-6xl mx-auto px-6 py-12">
      <JsonLd
        data={[
          breadcrumbSchema([
            { name: 'Discover', path: '/discover' },
            { name: 'Topics', path: '/discover' },
            { name: channel.name, path: `/discover/topics/${channel.slug}` },
          ]),
          circleListSchema(circles, `${channel.name} circles`),
        ]}
      />

      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-xs text-subtle mb-8">
        <Link href="/discover" className="hover:text-text transition-colors">Discover</Link>
        <ChevronRight className="w-3.5 h-3.5" />
        <span className="text-muted">Topics</span>
        <ChevronRight className="w-3.5 h-3.5" />
        <span className="text-text font-medium">{channel.name}</span>
      </nav>

      {/* Header */}
      <header className="mb-12 max-w-2xl">
        <h1 className="text-3xl sm:text-4xl font-bold text-text mb-3">{channel.name}</h1>
        {channel.description && (
          <p className="text-lg text-muted leading-relaxed">{channel.description}</p>
        )}
      </header>

      {/* Circles in this topic */}
      {circles.length > 0 ? (
        <>
          <h2 className="text-lg font-semibold text-text mb-5">
            {circles.length} {circles.length === 1 ? 'circle' : 'circles'} in {channel.name}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 mb-16">
            {circles.map((c) => (
              <CircleCard key={c.id} circle={c} />
            ))}
          </div>
        </>
      ) : (
        <div className="rounded-2xl border border-border bg-marketing-canvas p-10 text-center mb-16">
          <p className="text-muted">
            No circles in {channel.name} yet. Be the first to start one.
          </p>
        </div>
      )}

      <SignInCta
        title={`Join the ${channel.name} community`}
        body="Sign up free to tune in to this topic, join a circle, and show up for events near you."
        action="Sign up free"
      />
    </div>
  )
}
