import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import {
  getTopicalChannels,
  getTopicalChannelBySlug,
  getPublicCirclesByChannel,
} from '@/lib/discover'
import { CircleCard, SignInCta } from '@/components/discover/cards'
import { CircleConstellation } from '@/components/marketing/vector-art'
import { DetailTemplate } from '@/components/templates'
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
      title: `${channel.name} · ${SITE_NAME}`,
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
    <div className="relative overflow-hidden max-w-4xl mx-auto px-6 py-20 sm:py-24">
      {/* A constellation of people: the network this topic opens onto. */}
      <CircleConstellation
        aria-hidden
        className="pointer-events-none absolute top-6 right-0 w-72 max-w-none text-primary opacity-[0.05]"
      />
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

      <Link
        href="/discover/topics"
        className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-muted transition-colors hover:text-text"
      >
        <ChevronLeft className="h-4 w-4" />
        Topics
      </Link>

      <DetailTemplate
        title={channel.name}
        subtitle={
          channel.description ? (
            channel.description
          ) : (
            <>
              One doorway into a room of people. Name {channel.name.toLowerCase()} as the thing
              you practice and you land among neighbors who lit up the same way you did, the first
              conversation already halfway in.
            </>
          )
        }
      >
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
            <p className="text-lg font-semibold text-text mb-1">
              No circles in {channel.name} yet.
            </p>
            <p className="text-muted leading-relaxed max-w-md mx-auto">
              Every circle begins with one person and a standing time. Be the first to gather your
              neighbors around {channel.name.toLowerCase()}, and the next person who comes looking
              will find your room already warm.
            </p>
          </div>
        )}

        <SignInCta
          title={`Join the ${channel.name} community`}
          body={`Sign up free to tune in to ${channel.name.toLowerCase()}, find a circle living it near you, and start showing up for the people who practice what you love.`}
          action="Sign up free"
        />
      </DetailTemplate>
    </div>
  )
}
