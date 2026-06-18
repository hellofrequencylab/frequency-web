import type { Metadata } from 'next'
import { getChannelsWithTopics } from '@/lib/discover'
import { ChannelCard } from '@/components/discover/cards'
import {
  ZigZag,
  Statement,
  BetaCTA,
  PhotoHero,
  SectionHeading,
  Button,
} from '@/components/marketing/marketing-ui'
import { CircleConstellation, OrganicBlob } from '@/components/marketing/vector-art'
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
  twitter: {
    card: 'summary_large_image',
    title: `Topics · ${SITE_NAME}`,
    description: 'Explore the topics neighbors gather around on Frequency.',
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
        focal="object-center"
        eyebrow="Explore by topic"
        title={<>Find what you <span className="text-primary">practice</span></>}
        subtitle="The thing you already love is a doorway. A topic is the shared interest neighbors gather around: movement, spirituality, creative practice. Pick the one calling you, and on the other side of it is a circle living it near you this week."
      >
        <Button href="/discover/circles">Browse circles instead</Button>
      </PhotoHero>

      {/* ── The premise ─────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-surface px-6 py-20 sm:py-24">
        {/* A constellation of people: the network a single topic opens onto. */}
        <CircleConstellation
          aria-hidden
          className="pointer-events-none absolute top-10 right-0 w-80 max-w-none text-primary opacity-[0.05]"
        />
        <div className="relative max-w-4xl mx-auto">
          <div className="mb-9 text-center max-w-2xl mx-auto">
            <SectionHeading
              eyebrow="The Channels"
              title={<>Two words that find your <span className="text-primary">people</span></>}
              kicker="The first conversation starts halfway in."
            />
            <p className="mt-5 text-lg text-muted leading-relaxed">
              Frequency is organized into four Pillars, and Channels live inside them.
              Every Channel is a doorway: name the thing you already practice and you skip
              the small talk entirely, landing in a room of people who lit up the same way
              you did when they found it. Choose one to see the circles gathering around it
              near you.
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

      {/* ── Sensory beat — the topic becomes a room ─────────────── */}
      <ZigZag
        tone="canvas"
        img="/images/site/971634cd-1d52-4b3a-a0ab-5713d395d58a.jpg"
        alt="A Frequency circle gathered together outdoors at golden hour, arms open mid-practice"
        imgAspect="landscape"
        imgPosition="center"
        reverse
        eyebrow="Where it leads"
        title="A topic is just the doorway in"
        kicker="What's on the other side is a standing time and a saved seat."
      >
        <p>
          You don&apos;t arrive sure of anything. You walk toward the one that feels warm:
          breathwork, surfing, sound, strength. The Channel is the thread, but it&apos;s not
          the point. The point is who it connects you to.
        </p>
        <p>
          On the far side of every topic is a circle, a handful of neighbors who care about
          the same thing you do, close enough to walk to. The practice gets you in the door.
          The people are why you keep coming back.
        </p>
      </ZigZag>

      <div className="relative overflow-hidden">
        <OrganicBlob
          aria-hidden
          className="pointer-events-none absolute -bottom-24 -left-16 w-[30rem] max-w-none text-primary opacity-[0.04]"
        />
        <Statement tone="ink">
          Two words are all you need to <span className="text-primary">belong</span>.
        </Statement>
      </div>

      <BetaCTA
        heading="Find your people"
        body="Frequency is opening in North County San Diego. Claim your spot and we’ll help you find the circle practicing what you love."
      />
    </>
  )
}
