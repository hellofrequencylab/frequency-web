import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import {
  getTopicalChannels,
  getTopicalChannelBySlug,
  getPublicCirclesByChannel,
} from '@/lib/discover'
import { resolveDetailHero } from '@/lib/layout/detail-hero'
import { OG_SITE, ROOT_OG_IMAGES, SITE_NAME } from '@/lib/site'
import { JsonLd } from '@/components/json-ld'
import { circleListSchema, breadcrumbSchema } from '@/lib/jsonld'
import { FrequencyTopic } from '@/components/frequency/site/pages/discover/topics'

export const revalidate = 3600

// Pre-render the seeded topical channels at build time; others render on demand.
// Falls back to [] when Supabase credentials are absent (CI / preview without env vars).
export async function generateStaticParams() {
  try {
    const channels = await getTopicalChannels()
    return channels.map((c) => ({ slug: c.slug }))
  } catch {
    return []
  }
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
      ...OG_SITE,
      images: ROOT_OG_IMAGES,
      title: `${channel.name} · ${SITE_NAME}`,
      description,
      url: `/discover/topics/${channel.slug}`,
    },
    twitter: {
      card: 'summary_large_image',
      title: `${channel.name} · ${SITE_NAME}`,
      description,
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

  // The standard entity cover (PROG-P5, ADR-1117). The Topic's own `cover_image` is rung 1; the
  // section's `none` tail means a Topic with no artwork renders exactly as it did before.
  const [circles, hero] = await Promise.all([
    getPublicCirclesByChannel(channel.slug),
    resolveDetailHero(`/discover/topics/${channel.slug}`, { entityImage: channel.cover_image }),
  ])
  const schema = [
    breadcrumbSchema([
      { name: 'Discover', path: '/discover' },
      { name: 'Channels', path: '/discover/topics' },
      { name: channel.name, path: `/discover/topics/${channel.slug}` },
    ]),
    circleListSchema(circles, `${channel.name} circles`),
  ]
  return (
    <>
      <JsonLd data={schema} />
      <FrequencyTopic channel={channel} circles={circles} image={hero.coverImage} />
    </>
  )
}
