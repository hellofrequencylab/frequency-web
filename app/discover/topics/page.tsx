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
  title: 'Channels',
  description:
    'Browse the Channels neighbors gather around on Frequency: Movement, Spirituality, Creative, and more. Pick one and find a Circle near you.',
  alternates: { canonical: '/discover/topics' },
  openGraph: {
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
  const channelGroups = await getChannelsWithTopics()
  const sections = channelGroups.filter((d) => d.topics.length > 0)

  // Flat list of every Channel (for the ItemList schema, unchanged shape).
  const allTopics = sections.flatMap((d) => d.topics)

  return (
    <>
      <JsonLd
        data={[
          breadcrumbSchema([
            { name: 'Discover', path: '/discover' },
            { name: 'Channels', path: '/discover/topics' },
          ]),
          topicListSchema(allTopics, 'Channels on Frequency'),
        ]}
      />

      <PhotoHero
        image="/images/site/sound-healing.jpg"
        alt="A woman kneeling behind a ring of crystal singing bowls on the beach, smiling"
        focal="object-center"
        eyebrow="Explore by Channel"
        title={<>Find what you <span className="text-primary">practice</span></>}
        subtitle="A Channel is the thing neighbors already gather around: Movement, Spirituality, Creative, and four more. Pick the one you'd show up for, and on the other side of it is a Circle practicing it near you this week."
      >
        <Button href="/discover/circles">Browse Circles instead</Button>
      </PhotoHero>

      {/* ── The premise ─────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-surface px-6 py-20 sm:py-24">
        {/* A constellation of people: the network a single Channel opens onto. */}
        <CircleConstellation
          aria-hidden
          className="pointer-events-none absolute top-10 right-0 w-80 max-w-none text-primary opacity-[0.05]"
        />
        <div className="relative max-w-4xl mx-auto">
          <div className="mb-9 text-center max-w-2xl mx-auto">
            <SectionHeading
              eyebrow="The seven Channels"
              title={<>One name that finds your <span className="text-primary">people</span></>}
              kicker="Say what you practice and you skip the small talk."
            />
            <p className="mt-5 text-lg text-muted leading-relaxed">
              Frequency sorts into four Pillars, and the seven Channels live under them.
              A Channel is the thing you already do: breathwork, surfing, sound, a supper
              table. Name it, and you land in a room of people who care about the same
              thing. Pick one to see the Circles meeting around it near you.
            </p>
          </div>
          {sections.length === 0 ? (
            <p className="text-center text-muted">No Channels yet. Check back soon.</p>
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

      {/* ── Sensory beat: the Channel becomes a room ────────────── */}
      <ZigZag
        tone="canvas"
        img="/images/site/kirtan-song-circle.jpg"
        alt="A song Circle at golden hour, guitars in hand, faces lit warm in shallow focus"
        imgAspect="landscape"
        imgPosition="center"
        reverse
        eyebrow="Where it leads"
        title="A Channel is just the way in"
        kicker="On the other side is a standing time and a saved seat."
      >
        <p>
          You tune in to the one that feels warm: breathwork, surfing, sound, strength.
          The Channel is the thread, but it isn&apos;t the point. The point is who it
          connects you to.
        </p>
        <p>
          On the far side of every Channel is a Circle, a handful of neighbors who care
          about the same thing you do, close enough to walk to. The practice gets you in
          the door. The people are why you keep coming back.
        </p>
      </ZigZag>

      <div className="relative overflow-hidden">
        <OrganicBlob
          aria-hidden
          className="pointer-events-none absolute -bottom-24 -left-16 w-[30rem] max-w-none text-primary opacity-[0.04]"
        />
        <Statement tone="ink">
          Name what you practice. The rest is a <span className="text-primary">room of people</span>.
        </Statement>
      </div>

      <BetaCTA
        heading="Find your people"
        body="Frequency is opening in North County San Diego. Claim your spot and we’ll help you find the Circle practicing what you love."
      />
    </>
  )
}
