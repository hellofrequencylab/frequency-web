import type { Metadata } from 'next'
import { getTopicalChannels, getPublicCircles } from '@/lib/discover'
import { ChannelCard } from '@/components/discover/cards'
import { Statement, BetaCTA, PhotoHero, SectionHeading, Button } from '@/components/marketing/marketing-ui'
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

      <PhotoHero
        image="/images/site/36d99363-e483-40a0-b173-7e7ee6c1b379.jpg"
        alt="A neighbor spinning a hula hoop on the beach beneath a palm tree in bright daylight"
        eyebrow="Explore by topic"
        title="Find what you practice"
        subtitle="A topic is the shared interest neighbors gather around — movement, spirituality, creative practice. Pick one and find a circle living it near you."
      >
        <Button href="/discover/circles">Browse circles instead</Button>
      </PhotoHero>

      <section className="bg-surface px-6 py-20 sm:py-24">
        <div className="max-w-6xl mx-auto">
          <div className="mb-12 text-center">
            <SectionHeading eyebrow="The interests" title="Topics" />
            <p className="mt-4 text-lg text-muted leading-relaxed max-w-2xl mx-auto">
              Every topic is a doorway to people practicing it nearby. Choose one to see the
              circles gathering around it.
            </p>
          </div>
          {channels.length === 0 ? (
            <p className="text-center text-muted">No topics yet — check back soon.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {channels.map((ch) => (
                <div key={ch.id} className="transition-shadow hover:shadow-pop rounded-2xl">
                  <ChannelCard channel={ch} circleCount={countByChannel.get(ch.slug) ?? 0} />
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <Statement tone="ink">
        Two words are all you need to <span className="text-primary">belong</span>.
      </Statement>

      <BetaCTA
        heading="Find your people"
        body="Frequency is opening in North County San Diego. Claim your spot and we’ll help you find the circle practicing what you love."
      />
    </>
  )
}
