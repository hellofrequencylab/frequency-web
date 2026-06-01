import type { Metadata } from 'next'
import { getTopicalChannels, getPublicCircles } from '@/lib/discover'
import { ChannelCard } from '@/components/discover/cards'
import { JsonLd } from '@/components/json-ld'
import { breadcrumbSchema, topicListSchema } from '@/lib/jsonld'
import { SITE_NAME } from '@/lib/site'

export const metadata: Metadata = {
  title: 'Topics',
  description:
    'Explore the topics neighbors gather around on Frequency — Movement, Spirituality, Creative practice, and more.',
  alternates: { canonical: '/discover/topics' },
  openGraph: {
    title: `Topics — ${SITE_NAME}`,
    description: 'Explore the topics neighbors gather around on Frequency.',
    url: '/discover/topics',
  },
}

export const revalidate = 3600

export default async function DiscoverTopicsPage() {
  const [channels, circles] = await Promise.all([
    getTopicalChannels(),
    getPublicCircles(200),
  ])

  const countByChannel = new Map<string, number>()
  for (const c of circles) {
    if (c.channel_slug) {
      countByChannel.set(c.channel_slug, (countByChannel.get(c.channel_slug) ?? 0) + 1)
    }
  }

  return (
    <>
      <JsonLd
        data={[
          breadcrumbSchema([
            { name: 'Discover', path: '/discover' },
            { name: 'Topics', path: '/discover/topics' },
          ]),
          topicListSchema(channels, 'Topics on Frequency'),
        ]}
      />

      <section className="bg-marketing-canvas px-6 py-16 border-b border-border/60">
        <div className="max-w-5xl mx-auto text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-primary-strong mb-3">
            Explore by topic
          </p>
          <h1 className="text-3xl sm:text-5xl font-bold text-text mb-4">Topics</h1>
          <p className="text-muted leading-relaxed max-w-2xl mx-auto">
            The shared interests neighbors gather around. Pick one and find a circle practicing it
            near you.
          </p>
        </div>
      </section>

      <section className="bg-surface px-6 py-16">
        <div className="max-w-6xl mx-auto">
          {channels.length === 0 ? (
            <p className="text-center text-muted">No topics yet — check back soon.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {channels.map((ch) => (
                <ChannelCard key={ch.id} channel={ch} circleCount={countByChannel.get(ch.slug) ?? 0} />
              ))}
            </div>
          )}
        </div>
      </section>
    </>
  )
}
