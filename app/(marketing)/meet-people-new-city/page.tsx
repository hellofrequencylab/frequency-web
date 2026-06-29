// SEO pillar: how to meet people in a new city, "moved and don't know anyone,"
// making friends in a new town. The new-city connection cluster (CONTENT-VOICE
// §7a.5). Pain-first, answer-first, relational register only.
import type { Metadata } from 'next'
import { ArrowRight } from 'lucide-react'
import {
  PhotoHero,
  Section,
  Lead,
  Body,
  Steps,
  ZigZag,
  Statement,
  PullQuote,
  FaqList,
  BetaCTA,
  Button,
} from '@/components/marketing/marketing-ui'
import { JsonLd } from '@/components/json-ld'
import { articleSchema, faqSchema, breadcrumbSchema } from '@/lib/jsonld'

export const revalidate = 3600

const TITLE = 'How to meet people in a new city'
const DESCRIPTION =
  'You moved and you do not know anyone. Here is the fastest honest way to meet people in a new city: pick one recurring thing, become a regular fast, and let the repeats do the work.'

// Real-gathering photos double as the multimodal AIO signal (CONTENT-VOICE §8b)
// and the E-E-A-T proof (§8e). Fed into the Article schema below so answer engines
// see the page as illustrated, dated content.
const HERO_IMAGE = '/images/site/group-of-friends.jpg'
const REGULAR_IMAGE = '/images/site/outdoor-group.jpg'
const TABLE_IMAGE = '/images/site/community-dinner.jpg'

export function generateMetadata(): Metadata {
  return {
    title: TITLE,
    description: DESCRIPTION,
    alternates: { canonical: '/meet-people-new-city' },
    openGraph: {
      title: 'How to meet people in a new city · Frequency',
      description:
        'You moved and you know no one. The fastest honest way to meet people in a new city: pick one recurring thing and become a regular fast.',
      url: '/meet-people-new-city',
      images: [{ url: HERO_IMAGE }],
    },
  }
}

// Answer-first FAQ: relational register only, no health claims. Each answer fully
// resolves the question in its first sentence or two. Fed into the FAQPage schema
// below verbatim.
const FAQ = [
  {
    q: 'How do I meet people in a new city?',
    a: 'Pick one recurring thing and become a regular at it fast. Do not try to meet the whole city. Find one small group that meets on a schedule and show up to it twice before you decide anything, because friendship runs on repeats and a new city gives you none by default.',
  },
  {
    q: 'Why is it so hard to make friends in a new town?',
    a: 'Because you arrive with zero of the repeated contact that friendship is built on. Back home you had years of small overlaps: the same gym, the same neighbors, the same faces. A new city wipes all of that to zero on day one. It is not that the people are unfriendly; you just have not been in the same room as anyone twice yet.',
  },
  {
    q: 'How long does it take to feel at home in a new city?',
    a: 'Longer than the move and sooner than you fear, usually a few months of regular contact rather than years. The clock starts when you become a regular somewhere, not when the lease starts. People who join one recurring group early feel settled far faster than people who wait to get around to it.',
  },
  {
    q: 'What is the best way to meet people if I work from home?',
    a: 'Build the contact your commute and office used to provide. With no workplace handing you faces, a standing weekly group is not a nice-to-have, it is the main way you will meet anyone at all. Put one recurring thing in your week and protect it like a meeting.',
  },
  {
    q: 'I am an introvert and new in town. Where do I start?',
    a: 'Start with one small group built around something you already like, and give yourself permission to just attend, not perform. You do not need to work the room. You need to be in the same small room twice. Quiet regulars become known too.',
  },
  {
    q: 'Is it normal to feel lonely after moving somewhere new?',
    a: 'Completely. Moving somewhere new and knowing no one is one of the loneliest stretches of adult life, even when the move was a good decision. The feeling is not a sign you chose wrong; it is a sign you have not built your repeats yet. It closes faster than it feels like it will once you do.',
  },
]

export default function MeetPeopleNewCityPage() {
  return (
    <>
      <JsonLd
        data={[
          articleSchema({
            title: TITLE,
            description: DESCRIPTION,
            path: '/meet-people-new-city',
            published: '2026-06-29',
            updated: '2026-06-29',
            image: [HERO_IMAGE, REGULAR_IMAGE, TABLE_IMAGE],
          }),
          faqSchema(FAQ.map((f) => ({ q: f.q, a: f.a }))),
          breadcrumbSchema([
            { name: 'Meet people in a new city', path: '/meet-people-new-city' },
          ]),
        ]}
      />

      <PhotoHero
        image={HERO_IMAGE}
        alt="A group of friends laughing together outdoors"
        focal="object-center"
        eyebrow="New in town"
        title="How to meet people in a new city"
        subtitle="The boxes are unpacked, the job is fine, and on a Friday night you realize you do not have a single person to call. A new city is also the easiest place to start fresh. Here is how."
      >
        <Button href="/discover">
          See what&apos;s happening near you <ArrowRight className="w-5 h-5" />
        </Button>
      </PhotoHero>

      {/* Answer-first opening: the direct answer in the first two sentences. */}
      <Section tone="canvas" pad="pt-16 pb-16 sm:pt-20 sm:pb-20">
        <Lead>
          To meet people in a new city, pick one recurring thing and become a
          regular at it fast. Do not try to meet the whole city. Win one small room.
        </Lead>
        <Body>
          Nobody here has a fixed idea of you yet, which is the quiet upside of
          starting over. The first weeks are simply about putting yourself in the
          same room more than once. Find one small group that meets on a schedule,
          show up, and show up again before you decide whether it is for you.
        </Body>
      </Section>

      <PullQuote tone="surface">
        A new city does not hand you repeats.{' '}
        <span className="text-primary">You have to build them on purpose.</span>
      </PullQuote>

      {/* One concept per section. Question H2 in the reader's words, answer first. */}
      <Section tone="surface">
        <h2 className="font-display uppercase text-text text-3xl sm:text-4xl mb-5">
          Why is it so hard to make friends in a new town?
        </h2>
        <Lead>
          Because you arrive with zero of the repeated contact that friendship runs
          on. A move wipes years of small overlaps to zero on day one.
        </Lead>
        <Body>
          Back home you had the same gym, the same neighbors, the same faces at the
          same places, and friendships formed off all that accidental repetition. It
          is not that the people in your new city are colder. You just have not been
          in the same room as anyone here twice yet. That gap closes faster than it
          feels like it will, but only if you build the repeats yourself.
        </Body>
      </Section>

      {/* Illustrated supporting beat: the mechanism, with a real gathering photo. */}
      <ZigZag
        img={REGULAR_IMAGE}
        alt="A group of people gathered together outside on a sunny day"
        eyebrow="What actually works"
        title="Become a regular, not a tourist."
        imgAspect="landscape"
        tone="canvas"
      >
        <p>
          The instinct in a new place is to say yes to everything and meet as many
          people as possible. The thing that actually works is smaller and more
          boring: one standing time, returned to until the faces are familiar.
        </p>
        <p>
          A weekly group beats a one-time event every time, because friendship needs
          repeats and a one-off gives you none. Lead with the activity, not with
          making friends. It is far easier to walk in for a thing to do, and the
          friends come as a side effect.
        </p>
      </ZigZag>

      {/* Answer-first how-to, then the concrete steps. */}
      <Section tone="surface">
        <h2 className="font-display uppercase text-text text-3xl sm:text-4xl mb-5">
          What do I do my first month?
        </h2>
        <Lead>
          Find one recurring group near your new place and commit to its next two
          meetings, before you have decided anything about it. Three plain steps:
        </Lead>
        <div className="mt-8">
          <Steps
            steps={[
              {
                title: 'Choose recurring over one-off',
                body: 'A weekly thing near you beats a big one-time mixer. You are buying repeats, and only a standing schedule sells them.',
              },
              {
                title: 'Show up twice before you judge it',
                body: 'The first time anywhere new is awkward for everyone. The second time is when faces start to feel familiar. Most people quit after one and conclude the city is cold.',
              },
              {
                title: 'Let the activity carry you in',
                body: 'Go for the walk, the class, the table, not to make friends. Walking in for a thing to do is easy. The friends arrive quietly behind it.',
              },
            ]}
          />
        </div>
      </Section>

      <Statement tone="canvas">
        You do not have to rebuild a whole social life this month.{' '}
        <span className="text-primary">You have to show up twice to one thing.</span>
      </Statement>

      {/* One concept per section: the work-from-home / no-built-in-crowd reader. */}
      <Section tone="surface">
        <h2 className="font-display uppercase text-text text-3xl sm:text-4xl mb-5">
          What if I work from home and have no built-in crowd?
        </h2>
        <Lead>
          Then a standing weekly group is not a nice-to-have, it is the main way you
          will meet anyone at all. Build the contact your commute used to hand you.
        </Lead>
        <Body>
          When there is no office and no shared hallway, nobody is handing you faces
          on repeat, so you have to put one recurring thing in your week and protect
          it like a meeting. It does not have to be big. One small group, same time
          each week, is enough to turn a city full of strangers into a few people who
          know your name. This is the same engine that makes friendship work at any
          age, just run in a place where you are starting from scratch.
        </Body>
        <div className="mt-8">
          <Button href="/friendship-as-an-adult" variant="secondary">
            Read: how to make friends as an adult
          </Button>
        </div>
      </Section>

      {/* Illustrated beat that hands off to the product: a Circle as the standing room. */}
      <ZigZag
        img={TABLE_IMAGE}
        alt="A backyard dinner at night, friends gathered around a long table under string lights"
        eyebrow="Where this lands"
        title="A standing table with the same faces."
        imgAspect="landscape"
        reverse
        tone="surface"
        cta={{ label: 'See how the community works', href: '/the-community' }}
      >
        <p>
          A Circle is a small local group on a standing schedule, which is exactly
          the recurring repeat a new city does not give you for free. The same
          handful of people keep ending up in the same room, on purpose.
        </p>
        <p>
          You pick what the Circle is about, find a few people near your new place,
          and come back. We hand you the format, the rhythm, and a room that meets
          again next week, so a place you just live in slowly starts to feel like
          home.
        </p>
      </ZigZag>

      {/* Soft CTA into the product. Two honest doors. */}
      <Section tone="canvas">
        <h2 className="font-display uppercase text-text text-3xl sm:text-4xl mb-5">
          Where to start
        </h2>
        <Body>
          Look at the Circles and events already meeting near your new place, pick
          one that meets again, and go twice. If the loneliness of the move is the
          part that is loudest right now, it helps to know it is normal and that it
          passes once you build your repeats.
        </Body>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Button href="/discover">
            Find a Circle near you <ArrowRight className="h-5 w-5" />
          </Button>
          <Button href="/loneliness" variant="secondary">
            Lonely but not alone
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
        heading="A new city is just a set of repeats you have not built yet."
        body="Frequency hands you a room near your new place that meets on a rhythm, so the same faces keep showing up. Join the Beta and find your people."
      />
    </>
  )
}
