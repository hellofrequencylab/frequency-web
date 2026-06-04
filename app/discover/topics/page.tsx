import type { Metadata } from 'next'
import { getChannelsWithTopics } from '@/lib/discover'
import { ChannelCard } from '@/components/discover/cards'
import { Statement, BetaCTA, PhotoHero, SectionHeading, Button } from '@/components/marketing/marketing-ui'
import { JsonLd } from '@/components/json-ld'
import { breadcrumbSchema, topicListSchema } from '@/lib/jsonld'
import { SITE_NAME } from '@/lib/site'

export const metadata: Metadata = {
  title: 'Topics',
  description:
    'Explore the topics neighbors gather around on Frequency: Movement, Spirituality, Creative practice, and more.',
  alternates: { canonical: '/discover/topics' },
  openGraph: {
    title: `Topics · ${SITE_NAME}`,
    description: 'Explore the topics neighbors gather around on Frequency.',
    url: '/discover/topics',
  },
}

export const revalidate = 3600

export default async function DiscoverTopicsPage() {
  // Channels = the four Domains (Mind / Body / Spirit / Expression), each with
  // its Interests/Topics and a live circle count per topic. We group the grid
  // under the Channel headings instead of one flat list. Only Channels that
  // actually have topics render a section.
  const channelGroups = await getChannelsWithTopics()
  const sections = channelGroups.filter((d) => d.topics.length > 0)

  // Flat list of every topic (for the ItemList schema, unchanged shape).
  const allTopics = sections.flatMap((d) => d.topics)

  return (
    <>
      <JsonLd
        data={[
          breadcrumbSchema([
            { name: 'Discover', path: '/discover' },
            { name: 'Topics', path: '/discover/topics' },
          ]),
          topicListSchema(allTopics, 'Topics on Frequency'),
        ]}
      />

      <PhotoHero
        image="/images/site/36d99363-e483-40a0-b173-7e7ee6c1b379.jpg"
        alt="A neighbor spinning a hula hoop on the beach beneath a palm tree in bright daylight"
        eyebrow="Explore by topic"
        title="Find what you practice"
        subtitle="A topic is the shared interest neighbors gather around: movement, spirituality, creative practice. Pick one and find a circle living it near you."
      >
        <Button href="/discover/circles">Browse circles instead</Button>
      </PhotoHero>

      <section className="bg-surface px-6 py-20 sm:py-24">
        <div className="max-w-6xl mx-auto">
          <div className="mb-12 text-center">
            <SectionHeading eyebrow="The interests" title="Topics" />
            <p className="mt-4 text-lg text-muted leading-relaxed max-w-2xl mx-auto">
              Frequency is organized into four Channels. Interests live inside them: every
              Interest is a doorway to people practicing it nearby. Choose one to see the
              circles gathering around it.
            </p>
          </div>
          {sections.length === 0 ? (
            <p className="text-center text-muted">No topics yet. Check back soon.</p>
          ) : (
            <div className="space-y-16">
              {sections.map((channel) => (
                <div key={channel.id}>
                  <div className="mb-6">
                    <h3 className="font-display uppercase text-text text-2xl sm:text-3xl">
                      {channel.name}
                    </h3>
                    {channel.description && (
                      <p className="mt-2 text-base text-muted leading-relaxed max-w-2xl">
                        {channel.description}
                      </p>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                    {channel.topics.map((ch) => (
                      <div key={ch.id} className="transition-shadow hover:shadow-pop rounded-2xl">
                        <ChannelCard channel={ch} circleCount={ch.circleCount} />
                      </div>
                    ))}
                  </div>
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
