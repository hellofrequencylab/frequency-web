// SEO pillar (Labs track): "what is a third space / third place", "how to build a
// third space". Answer-first, definition then a hard pivot to the builder. Speaks
// to the Latent Leader / host who wants to make one (CONTENT-VOICE §2b), not the
// Seeker looking to join. Relational register, no health claims. Single-pillar Labs.
import type { Metadata } from 'next'
import { ArrowRight } from 'lucide-react'
import {
  PhotoHero,
  Section,
  Lead,
  Body,
  PullQuote,
  ZigZag,
  Statement,
  FaqList,
  BetaCTA,
  Button,
} from '@/components/marketing/marketing-ui'
import { JsonLd } from '@/components/json-ld'
import { articleSchema, faqSchema, breadcrumbSchema } from '@/lib/jsonld'

export const revalidate = 3600

const TITLE = 'What a third space is (and how to build one)'
const DESCRIPTION =
  'A third space is a place that is not home and not work where the same people keep showing up: a cafe, a court, a regular table. Here is what a third place is, why they got rare, and how to build one today.'

// Real-gathering photos double as the multimodal AIO signal (CONTENT-VOICE §8b)
// and the E-E-A-T proof (§8e). Fed into the Article schema for richer-result
// eligibility.
const HERO_IMAGE = '/images/site/community-dinner.jpg'
const PLACE_IMAGE = '/images/site/outdoor-group.jpg'
const BUILD_IMAGE = '/images/site/community-1.jpg'

export function generateMetadata(): Metadata {
  return {
    title: TITLE,
    description: DESCRIPTION,
    alternates: { canonical: '/what-is-a-third-space' },
    openGraph: {
      title: 'What a third space is, and how to build one · Frequency',
      description:
        'Not home, not work: the third place is where the same faces keep showing up. What it is, why they vanished, and how a host builds one now.',
      url: '/what-is-a-third-space',
      images: [{ url: HERO_IMAGE }],
    },
  }
}

// Answer-first FAQ: each answer fully resolves the question in its first sentence
// or two, in the relational register (no health claims). The builder is the reader:
// half these questions are the ones a would-be host actually types. Fed into the
// FAQPage schema below verbatim.
const FAQ = [
  {
    q: 'What is a third space?',
    a: 'A third space is a place that is not home and not work where the same people keep running into each other: a cafe, a court, a shop counter, a regular table. The sociologist Ray Oldenburg called these "third places," the anchors of community life outside the house (the first place) and the job (the second). They are where casual, repeated contact turns strangers into regulars.',
  },
  {
    q: 'What is the difference between a third place and a third space?',
    a: 'There is no real difference. "Third place" is the original term from Ray Oldenburg, and "third space" is the way most people say it now. Both mean the same thing: a neutral, welcoming spot outside home and work where a community gathers on a regular rhythm.',
  },
  {
    q: 'What are examples of third places?',
    a: 'The corner cafe, the barbershop, the neighborhood pub, the library, the gym, the church hall, the park bench, the regular run club. A third place is any spot where you can show up alone, be known by name, and stay a while without buying your way in. The key is not the building, it is that the same people keep coming back.',
  },
  {
    q: 'Why have third places disappeared?',
    a: 'They got squeezed out by cost, cars, and screens. Rents pushed out the cheap corner spots that let people linger, suburbs spread everything too far apart to walk to, and a phone started standing in for the hangout. What thinned out was not the buildings so much as the standing, low-pressure reasons to keep seeing the same faces.',
  },
  {
    q: 'How do you build a third space?',
    a: 'You do not need to own a building. Pick one standing time, a spot you can get every week, and a simple thing people gather around, then hold it until the same faces keep coming back. A third space is made by repetition, not real estate. A borrowed room on a fixed rhythm becomes a third place the moment people start treating it like one.',
  },
  {
    q: 'Do I need to own a venue to create a third space?',
    a: 'No. Most third spaces start in a space someone borrows: a park, a living room, a back corner of a cafe, a community hall. What makes it a third place is the standing rhythm and the regulars, not the deed. Start with a time and a few people, and let the room grow into it before you ever think about a lease.',
  },
]

export default function WhatIsAThirdSpacePage() {
  return (
    <>
      <JsonLd
        data={[
          articleSchema({
            title: TITLE,
            description: DESCRIPTION,
            path: '/what-is-a-third-space',
            published: '2026-07-02',
            updated: '2026-07-02',
            image: [HERO_IMAGE, PLACE_IMAGE, BUILD_IMAGE],
          }),
          faqSchema(FAQ.map((f) => ({ q: f.q, a: f.a }))),
          breadcrumbSchema([
            { name: 'What a third space is', path: '/what-is-a-third-space' },
          ]),
        ]}
      />

      <PhotoHero
        image={HERO_IMAGE}
        alt="Friends gathered around a long outdoor table in the evening, mid-conversation"
        focal="object-center"
        eyebrow="For the builder"
        title="What a third space is, and how to build one"
        subtitle="Not home, not work: the third place is where the same faces keep showing up. They got rare. You can be the person who makes a new one. Here is what they are and how to start."
      >
        <Button href="/spaces">
          Build your Space <ArrowRight className="w-5 h-5" />
        </Button>
      </PhotoHero>

      {/* Answer-first opening: the direct answer in the first two sentences. */}
      <Section tone="canvas" pad="pt-16 pb-16 sm:pt-20 sm:pb-20">
        <Lead>
          A third space is a place that is not home and not work where the same
          people keep running into each other: a cafe, a court, a regular table.
          The sociologist Ray Oldenburg named these the &quot;third places,&quot;
          the anchors of a community sitting outside the house and the job.
        </Lead>
        <Body>
          That is the definition. The more useful part, if you are the one thinking
          about making one, is what it means in practice: a third place is built
          from repeated, low-pressure run-ins with the same faces. Not a grand
          opening. A standing time, a spot you can get, and a simple reason to come
          back. This page is for the person who wants to build one.
        </Body>
      </Section>

      <PullQuote tone="surface">
        A third place is not a building.{' '}
        <span className="text-primary">It is the same people, on a rhythm.</span>
      </PullQuote>

      {/* One concept per section. Question H2 in the reader's words, answer first. */}
      <Section tone="surface">
        <h2 className="font-display uppercase text-text text-3xl sm:text-4xl mb-5">
          What counts as a third place?
        </h2>
        <Lead>
          The corner cafe, the barbershop, the library, the run club, the church
          hall, the park bench with the same dog-walkers. Any spot where you can
          show up alone and be known.
        </Lead>
        <Body>
          Oldenburg&apos;s test is simple: it is neutral ground, it is easy to get
          to, the same regulars turn up, and you can stay a while without buying
          your way in. Home is the first place, work is the second, and the third
          is everything in between where the informal life of a neighborhood
          actually happens. The building matters far less than the rhythm.
        </Body>
      </Section>

      <Section tone="canvas">
        <h2 className="font-display uppercase text-text text-3xl sm:text-4xl mb-5">
          Why did third places get so rare?
        </h2>
        <Lead>
          Cost, cars, and screens squeezed them out. Rent pushed out the cheap
          spots that let people linger, sprawl put everything too far to walk to,
          and a phone started standing in for the hangout.
        </Lead>
        <Body>
          What thinned out was not really the buildings. It was the standing,
          low-pressure reasons to keep seeing the same faces. When lingering costs
          money and every errand is a drive, the casual run-in disappears, and with
          it the easy on-ramp to knowing your neighbors. The good news for a builder
          is that the missing piece is a rhythm, and a rhythm is something you can
          make.
        </Body>
      </Section>

      {/* The pivot to the builder, made concrete with a real gathering photo. */}
      <ZigZag
        img={PLACE_IMAGE}
        alt="A small group sitting together outdoors in the late afternoon, settled into easy talk"
        eyebrow="The pivot"
        title="You do not wait for one. You make one."
        imgAspect="landscape"
        tone="surface"
        cta={{ label: 'The operator playbook', href: '/how-to-run-a-community-space' }}
      >
        <p>
          Here is the part most people miss: a third place is not found, it is held.
          Somebody picks a time, keeps a spot, and shows up enough weeks in a row
          that other people start planning around it. That somebody can be you, and
          it is a lot smaller than opening a venue.
        </p>
        <p>
          Start with one thing to gather around, a room you can get every week, and
          a handful of people you would like to see again. Hold it. The first few
          times feel thin. Then a familiar face becomes a regular, and a regular
          becomes the reason someone else shows up.
        </p>
      </ZigZag>

      <Statement tone="canvas">
        The third places did not just vanish.{' '}
        <span className="text-primary">They stopped being built.</span>
      </Statement>

      {/* Hand off to the product: Frequency as the rails a builder gets. */}
      <ZigZag
        img={BUILD_IMAGE}
        alt="A small group gathered on a sunlit lawn, mid-practice together"
        eyebrow="How Frequency helps"
        title="A front door and a format."
        imgAspect="landscape"
        reverse
        tone="surface"
        cta={{ label: 'See what a Space gives you', href: '/spaces' }}
      >
        <p>
          Frequency is the Labs toolkit for building a third space without owning
          one. You run your community as a Space: a front door in Discover so new
          people can find you, the format for Circles and Runs so a group lasts past
          week three, and a path so your regulars can step up and share the load.
        </p>
        <p>
          You bring the one thing you gather around and the room you can get. We hand
          you the rails that keep the rhythm going after the first burst of energy
          fades, so a borrowed corner turns into a place people count on.
        </p>
      </ZigZag>

      {/* Soft CTA into the product. Two honest doors: build now, or see the venue. */}
      <Section tone="canvas">
        <h2 className="font-display uppercase text-text text-3xl sm:text-4xl mb-5">
          Where to start
        </h2>
        <Body>
          If you want to build a third space, start with a Space: claim your front
          door, set a rhythm, and host your first small room. If you would rather see
          what a purpose-built third space looks like with the doors on, tour The
          Lab. Both are the same idea at different sizes.
        </Body>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Button href="/spaces">
            Build your Space <ArrowRight className="h-5 w-5" />
          </Button>
          <Button href="/the-lab" variant="secondary">
            Tour The Lab
          </Button>
        </div>
      </Section>

      {/* FAQ: answer-first pairs, mirrored into the FAQPage schema above. */}
      <Section tone="surface">
        <h2 className="font-display uppercase text-text text-3xl sm:text-4xl mb-7">
          Common questions
        </h2>
        <FaqList items={FAQ} />
      </Section>

      <BetaCTA
        heading="The third place you wish this town had starts with one you build."
        body="Frequency hands you the front door, the format, and the rhythm to gather people on repeat. Join the Beta and build your Space."
      />
    </>
  )
}
