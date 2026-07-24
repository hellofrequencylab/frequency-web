// SEO pillar (Leader track, CONTENT-VOICE §7b.2): how to start a Circle, how to
// start a community group, how to run a recurring meetup that does not fizzle.
// The activation engine — empower the natural connector, hand them the format.
// Answer-first, relational register, no health claims.
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
import { articleSchema, howToSchema, faqSchema, breadcrumbSchema } from '@/lib/jsonld'
import { SITE_URL } from '@/lib/site'

export const revalidate = 3600

const PATH = '/how-to-start-a-circle'
const TITLE = 'How to start a Circle (a group that lasts)'
const DESCRIPTION =
  'How to start a Circle: pick one thing, set a standing time, invite a few people, and run the same simple format until the same faces come back.'

// Real-gathering photos double as the multimodal AIO signal (CONTENT-VOICE §8b)
// and the E-E-A-T proof (§8e). Fed into the HowTo schema below so answer engines
// see the page as illustrated content.
const HERO_IMAGE = '/images/site/community-1.jpg'
const ROOM_IMAGE = '/images/site/mens-group.jpg'
const TABLE_IMAGE = '/images/site/community-dinner.jpg'

export function generateMetadata(): Metadata {
  return {
    title: TITLE,
    description: DESCRIPTION,
    alternates: { canonical: PATH },
    openGraph: {
      title: 'How to start a Circle · Frequency',
      description:
        'You do not have to build a community. Start one small Circle: one thing, a standing time, a few people, the same simple format every week.',
      url: PATH,
      images: [{ url: HERO_IMAGE }],
    },
  }
}

// The ordered "how to" the HowTo schema is built from. Kept in one place so the
// on-page Steps and the structured data never drift apart.
const HOW_TO_STEPS = [
  {
    name: 'Pick one thing, not a community',
    text: 'Choose a single, simple thing the group does together: a walk, a dinner, a book, a morning swim. One activity people can show up for without explaining themselves. You are not founding an organization, you are starting one repeating room.',
  },
  {
    name: 'Set a standing time and keep it',
    text: 'Pick a day and time and repeat it without asking. The same Tuesday, every week or every other week. A standing slot beats a perfect one because friendship runs on repeats, and a moving target gives you none.',
  },
  {
    name: 'Invite a few people, not everyone',
    text: 'Personally ask five or six people you would actually like to see again. A small room that fills is warmer than a big one that echoes. Tell them exactly when, where, and what you will do, so saying yes is easy.',
  },
  {
    name: 'Run the same simple format',
    text: 'Open the same way, do the thing, close the same way. A light, repeatable shape lets people relax into it instead of wondering what is happening. The format carries the night so you do not have to perform host.',
  },
  {
    name: 'Show up again, especially when it is small',
    text: 'The second and third meetings are where a Circle either becomes real or quietly dies. Some nights two people come. Hold the time anyway. Consistency, not charisma, is what turns strangers into regulars.',
  },
]

// Answer-first FAQ: relational register only, no health claims. Each answer fully
// resolves the question in its first sentence or two. Fed into the FAQPage schema
// below verbatim.
const FAQ = [
  {
    q: 'How do I start a Circle?',
    a: 'Pick one simple thing to do together, set a standing time, and personally invite five or six people to the first one. Do not try to build a whole community. Start one small repeating room around a single activity, run the same easy format, and come back next time. The group is built from the repeats, not from the launch.',
  },
  {
    q: 'How many people do I need to start a group?',
    a: 'Three or four who actually show up beats a list of twenty who might. A small room that fills feels warm; a big one that half-empties feels like a failure even when it is not. Start tiny on purpose and let it grow from people who came twice.',
  },
  {
    q: 'How often should a Circle meet?',
    a: 'Weekly or every other week, on the same day, is the sweet spot. Often enough that faces stay familiar between meetings, rare enough that you can keep the commitment for months. The exact cadence matters far less than keeping it the same.',
  },
  {
    q: 'What do you actually do at a Circle meeting?',
    a: 'One simple thing, the same way each time. A walk, a shared meal, a practice, a conversation with a light opening and closing. A repeatable shape lets people relax instead of guessing what happens next, and it means you do not have to reinvent the night every time.',
  },
  {
    q: 'Why do most community groups fizzle out?',
    a: 'Because they lean on one person’s energy instead of a structure anyone can keep. Groups die from inconsistency and burnout, not from a lack of charisma. A fixed time and a simple format that does not depend on the founder being on are what keep a group alive after the novelty wears off.',
  },
  {
    q: 'Do I have to be an extrovert to host a Circle?',
    a: 'No. Hosting is mostly logistics and consistency, not performance. If you can pick a time, send a few invites, and keep showing up, you can hold a Circle. Quiet, reliable hosts often build the steadiest groups, because the room feels safe rather than run.',
  },
  {
    q: 'What does it cost to start a Circle?',
    a: 'Nothing. Starting a Circle and gathering a few people is free, and it stays free. Frequency is a Community Collective built to support every community effort, so you never pay to host and we never take a cut of your own bookings. If your Circle grows into something you sell tickets or services through, there is one honest price and you see exactly what the network earned you.',
  },
]

export default function HowToStartACirclePage() {
  return (
    <>
      <JsonLd
        data={[
          articleSchema({
            title: TITLE,
            description: DESCRIPTION,
            path: PATH,
            published: '2026-06-24',
            updated: '2026-07-24',
            image: [HERO_IMAGE, ROOM_IMAGE, TABLE_IMAGE],
          }),
          howToSchema({
            name: 'How to start a Circle',
            description: DESCRIPTION,
            image: [HERO_IMAGE, ROOM_IMAGE, TABLE_IMAGE],
            steps: HOW_TO_STEPS.map((s) => ({
              name: s.name,
              text: s.text,
              url: `${SITE_URL}${PATH}`,
            })),
          }),
          faqSchema(FAQ.map((f) => ({ q: f.q, a: f.a }))),
          breadcrumbSchema([
            { name: 'How to start a Circle', path: PATH },
          ]),
        ]}
      />

      <PhotoHero
        image={HERO_IMAGE}
        alt="A small group of friends gathered closely together, talking and laughing"
        focal="object-center"
        eyebrow="For the natural connector"
        title="How to start a Circle"
        subtitle="You keep wishing this town had more going on. You can be the reason it does. Starting a Circle is smaller than it sounds: one thing, a standing time, a few people. Here is how."
      >
        <Button href="/the-community">
          See how Circles work <ArrowRight className="w-5 h-5" />
        </Button>
      </PhotoHero>

      {/* Answer-first opening: the direct answer in the first two sentences. */}
      <Section tone="canvas" pad="pt-16 pb-16 sm:pt-20 sm:pb-20">
        <Lead>
          To start a Circle, pick one simple thing to do together, set a standing
          time, and invite a few people to the first one. You are not building a
          community. You are starting one small room that meets again.
        </Lead>
        <Body>
          The instinct is to plan something big and worry about whether anyone will
          come. The thing that actually works is much smaller: one activity, the
          same time each week, and a handful of people you would like to see again.
          Get those repeating and the group builds itself from the people who keep
          showing up.
        </Body>
      </Section>

      <PullQuote tone="surface">
        You do not have to build a community.{' '}
        <span className="text-primary">Host one Circle. We hand you the format.</span>
      </PullQuote>

      {/* One concept per section. Question H2 in the reader's words, answer first. */}
      <Section tone="surface">
        <h2 className="font-display uppercase text-text text-3xl sm:text-4xl mb-5">
          How many people do I need to start a group?
        </h2>
        <Lead>
          Three or four who actually show up beats a list of twenty who might. Start
          smaller than feels impressive.
        </Lead>
        <Body>
          A small room that fills feels warm and easy to be in. A big one that
          half-empties feels like a flop even when six good people came. So invite a
          handful you genuinely want to see again, tell them exactly when and where,
          and let the group grow from the people who came back, not from the size of
          the first invite list.
        </Body>
      </Section>

      {/* Illustrated supporting beat: the mechanism, with a real gathering photo. */}
      <ZigZag
        img={ROOM_IMAGE}
        alt="A small group of men sitting in a circle outdoors, talking"
        eyebrow="What actually works"
        title="Consistency, not charisma."
        imgAspect="landscape"
        tone="canvas"
      >
        <p>
          The myth is that good groups need a magnetic host carrying every night.
          The truth is quieter: groups live or die on whether the time stays the
          same and the format is simple enough to repeat without you performing.
        </p>
        <p>
          Pick a day, keep it, and run the same light shape each time. That is what
          lets people relax into a room instead of wondering what is happening. A
          steady, ordinary rhythm turns strangers into regulars faster than any
          amount of energy.
        </p>
      </ZigZag>

      {/* Answer-first how-to, then the concrete steps (mirrored into HowTo schema). */}
      <Section tone="surface">
        <h2 className="font-display uppercase text-text text-3xl sm:text-4xl mb-5">
          What are the steps to start a Circle?
        </h2>
        <Lead>
          Pick one thing, set a standing time, invite a few people, run the same
          simple format, and keep showing up. Five plain steps:
        </Lead>
        <div className="mt-8">
          <Steps steps={HOW_TO_STEPS.map((s) => ({ title: s.name, body: s.text }))} />
        </div>
      </Section>

      <Statement tone="canvas">
        You do not have to get it perfect.{' '}
        <span className="text-primary">You have to hold the same time twice.</span>
      </Statement>

      {/* One concept per section: why groups fizzle, the failure mode named plainly. */}
      <Section tone="surface">
        <h2 className="font-display uppercase text-text text-3xl sm:text-4xl mb-5">
          Why do most community groups fizzle out?
        </h2>
        <Lead>
          Because they lean on one person’s energy instead of a structure anyone can
          keep. Groups die from inconsistency and burnout, not from a quiet host.
        </Lead>
        <Body>
          When the whole thing rides on the founder being on every week, it ends the
          first time they are tired, traveling, or having a hard month. A fixed time
          and a simple, repeatable format take the weight off any single person, so
          the Circle survives an off night. Build the rails first and the room can
          outlast your worst week.
        </Body>
        <div className="mt-8">
          <Button href="/the-quest" variant="secondary">
            See the path we hand new hosts
          </Button>
        </div>
      </Section>

      {/* Illustrated beat that hands off to the product: a Circle as the format we give. */}
      <ZigZag
        img={TABLE_IMAGE}
        alt="Friends gathered around a long table at night under string lights"
        eyebrow="Where this lands"
        title="We hand you the rails."
        imgAspect="landscape"
        reverse
        tone="surface"
        cta={{ label: 'See how the community works', href: '/the-community' }}
      >
        <p>
          A Circle on Frequency is exactly this small repeating room, with the parts
          that usually trip people up already built. You get the format, the rhythm,
          and the simple opening and closing, so you can host without inventing the
          night from scratch.
        </p>
        <p>
          You bring the one thing you want to gather around and the few people you
          want in the room. We hand you the structure that keeps it going after the
          first burst of energy fades, so it becomes a standing part of people’s
          week.
        </p>
      </ZigZag>

      {/* One concept per section: the cost question, answered plainly. Weaves the
          Community Collective positioning + the /pricing spoke where intent is real. */}
      <Section tone="canvas">
        <h2 className="font-display uppercase text-text text-3xl sm:text-4xl mb-5">
          What does it cost to start a Circle?
        </h2>
        <Lead>
          Nothing. Starting a Circle and gathering a few people is free, and it
          stays free.
        </Lead>
        <Body>
          Frequency is a Community Collective, built to support every community
          effort and help everyone in it succeed. So you never pay to host, and we
          never take a cut of your own bookings. If your Circle later grows into
          something you sell tickets or services through, there is one honest{' '}
          <a className="text-primary-strong font-semibold hover:underline" href="/pricing">
            price
          </a>
          , and you see exactly what the network earned you.
        </Body>
      </Section>

      {/* Soft CTA into the product. Two honest doors. */}
      <Section tone="canvas">
        <h2 className="font-display uppercase text-text text-3xl sm:text-4xl mb-5">
          Where to start
        </h2>
        <Body>
          Look at the Circles already meeting near you to see the shape of it, then
          pick one thing, one time, and a few people, and hold your first one. If
          you would rather find your people before you host, start there instead.
          Both doors lead to the same room. For the longer builder&rsquo;s guide,
          from a first gathering to a group that runs itself, read{' '}
          <a
            className="text-primary-strong font-semibold hover:underline"
            href="/how-to-build-community"
          >
            how to build community
          </a>
          .
        </Body>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Button href="/the-community">
            See how Circles work <ArrowRight className="h-5 w-5" />
          </Button>
          <Button href="/discover" variant="secondary">
            Find a Circle near you
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
        heading="The town you wish you lived in starts with one room you hold."
        body="Frequency hands you the format, the rhythm, and a place to gather a few people on repeat. Join the Beta and start your Circle."
      />
    </>
  )
}
