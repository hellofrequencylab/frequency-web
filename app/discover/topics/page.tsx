import type { Metadata } from 'next'
import { getChannelsWithTopics, getPublicCounts, getPublicEvents } from '@/lib/discover'
import { JsonLd } from '@/components/json-ld'
import { breadcrumbSchema, topicListSchema } from '@/lib/jsonld'
import { OG_SITE, ROOT_OG_IMAGES, SITE_NAME } from '@/lib/site'
import { FrequencyTopics } from '@/components/frequency/site/pages/discover/topics'

export const metadata: Metadata = {
  title: 'Channels',
  description:
    'Browse the Channels neighbors gather around on Frequency: Movement, Spirituality, Creative, and more. Pick one and find a Circle near you.',
  alternates: { canonical: '/discover/topics' },
  openGraph: {
    ...OG_SITE,
    images: ROOT_OG_IMAGES,
    title: `Channels · ${SITE_NAME}`,
    description: 'Browse the Channels neighbors gather around on Frequency.',
    url: '/discover/topics',
  },
  twitter: {
    card: 'summary_large_image',
    title: `Channels · ${SITE_NAME}`,
    description: 'Browse the Channels neighbors gather around on Frequency.',
  },
}

export const revalidate = 3600

export default async function DiscoverTopicsPage() {
  // Data shape: the four Pillars (Mind / Body / Spirit / Expression), each
  // grouping the Channels that sort under it, with a live circle count per
  // Channel. We group the grid under the Pillar headings instead of one flat
  // list. Only Pillars that actually have Channels render a section.
  // (Canon: Pillar > Channel > Circle, docs/NAMING.md. Variable names and the
  // `.topics` accessor are persisted data shape, kept as-is.)
  const [channelGroups, counts, events] = await Promise.all([
    getChannelsWithTopics(),
    getPublicCounts(),
    getPublicEvents(50),
  ])
  const sections = channelGroups.filter((d) => d.topics.length > 0)

  // Flat list of every Channel (for the ItemList schema, unchanged shape).
  const allTopics = sections.flatMap((d) => d.topics)
  const schema = [
    breadcrumbSchema([
      { name: 'Discover', path: '/discover' },
      { name: 'Channels', path: '/discover/topics' },
    ]),
    topicListSchema(allTopics, 'Channels on Frequency'),
  ]
  return (
    <>
      <JsonLd data={schema} />
      <FrequencyTopics sections={sections} counts={counts} events={events.length} />
    </>
  )
}
