// SEO pillar (Labs track): "how to run a community space", "how to run a community
// hub / group space". The operator playbook. Answer-first, HowTo schema, a Steps
// block. Speaks to the Latent Leader / operator running the room (CONTENT-VOICE
// §2b), not the Seeker. Relational register, no health claims. Single-pillar Labs.
import type { Metadata } from 'next'
import { ArrowRight } from 'lucide-react'
import {
  PhotoHero,
  Section,
  Lead,
  Body,
  Steps,
  PullQuote,
  ZigZag,
  Statement,
  FaqList,
  BetaCTA,
  Button,
} from '@/components/marketing/marketing-ui'
import { JsonLd } from '@/components/json-ld'
import { howToSchema, faqSchema, breadcrumbSchema } from '@/lib/jsonld'

export const revalidate = 3600

const TITLE = 'How to run a community space'
const DESCRIPTION =
  'Running a community space takes four plain things: a standing rhythm, a room you can get, a few regulars, and light tooling so it does not ride on you. Here is the operator playbook for keeping one alive.'

// Real-gathering photos double as the multimodal AIO signal (CONTENT-VOICE §8b)
// and the E-E-A-T proof (§8e). Fed into the HowTo schema below.
const HERO_IMAGE = '/images/site/outdoor-group.jpg'
const CORE_IMAGE = '/images/site/mens-group.jpg'
const RAILS_IMAGE = '/images/site/breathwork-circle-friends.jpg'

export function generateMetadata(): Metadata {
  return {
    title: TITLE,
    description: DESCRIPTION,
    alternates: { canonical: '/how-to-run-a-community-space' },
    openGraph: {
      title: 'How to run a community space · Frequency',
      description:
        'The operator playbook: a standing rhythm, a room you can get, a few regulars, and light tooling. What running a community space actually takes.',
      url: '/how-to-run-a-community-space',
      images: [{ url: HERO_IMAGE }],
    },
  }
}

// The ordered playbook the HowTo schema is built from. Kept in one place so the
// on-page Steps and the structured data never drift apart.
const HOW_TO_STEPS = [
  {
    name: 'Set one standing rhythm',
    text: 'Pick a day and time and repeat it without asking. The same Tuesday, weekly or every other week. A community space lives or dies on whether the rhythm holds, because people can only build a habit around a time that does not move.',
  },
  {
    name: 'Lock a room you can actually get',
    text: 'Find one spot you can reliably use on that rhythm: a park, a hall, a back corner, a living room. It does not need to be yours or impressive. It needs to be the same place enough weeks in a row that people stop asking where.',
  },
  {
    name: 'Grow a core of regulars',
    text: 'Aim for a handful who come back, not a crowd who came once. Three or four reliable regulars are the spine of a community space. Learn their names, notice when they miss, and let the room grow from the people who keep returning.',
  },
  {
    name: 'Hand out real roles',
    text: 'The moment you have a core, share the load. Someone brings the coffee, someone opens up, someone messages newcomers. A space that rides on one person ends the first hard month. Roles turn a room you run into a room a group holds.',
  },
  {
    name: 'Keep the format light and repeatable',
    text: 'Open the same way, do the thing, close the same way. A simple, repeatable shape lets people relax into the room instead of guessing what happens next, and it means you are not reinventing the night every time you show up.',
  },
  {
    name: 'Use light tooling so it does not ride on you',
    text: 'Put the rhythm somewhere people can find it, send the reminder every time, and keep a simple record of who comes. A little tooling carries the admin that otherwise eats the host, so your energy goes to the room, not the logistics.',
  },
]

// Answer-first FAQ: relational register only, no health claims. Each answer fully
// resolves the question in its first sentence or two. Fed into the FAQPage schema
// below verbatim.
const FAQ = [
  {
    q: 'What does it take to run a community space?',
    a: 'Four plain things: a standing rhythm, a room you can reliably get, a few regulars who come back, and light tooling so the admin does not fall on one person. Notice that none of them is charisma or a big budget. A community space is held together by consistency and a simple format, not by a magnetic host or a fancy venue.',
  },
  {
    q: 'How do I keep a community space from fizzling out?',
    a: 'Keep the time fixed, keep the format simple, and share the roles before you burn out. Spaces die from inconsistency and from one person carrying everything, not from a quiet night. When the rhythm never moves and three or four people own pieces of it, the room survives an off week and outlasts the founder having a hard month.',
  },
  {
    q: 'How many people do I need to run a community space?',
    a: 'A core of three or four who reliably show up is enough to start. A small room that fills feels warm; a big one that half-empties feels like a flop even when good people came. Build from the regulars who return, not from the size of your first invite, and let the space grow at the speed people actually stick.',
  },
  {
    q: 'Do I need to own a building to run a community space?',
    a: 'No. Most community spaces run in a room someone borrows: a park, a hall, a cafe corner, a living room. What makes it a community space is the standing rhythm and the regulars, not the lease. Start with a time and a spot you can get every week, and worry about walls much later, if ever.',
  },
  {
    q: 'What tools do I need to run a community space?',
    a: 'Enough to hold the rhythm without it living in your head: a place people can see when you meet, a reminder that goes out every time, a way to message the group, and a simple record of who comes. Frequency bundles these into a Space so you are not stitching together four apps to run one room.',
  },
  {
    q: 'How much time does running a community space take?',
    a: 'Less than people fear, once the format is set and the roles are shared. The heavy lift is the first few months of holding the rhythm and building a core. After that, a repeatable format and a couple of helpers mean the week to week is mostly showing up and sending the reminder, not reinventing the night.',
  },
]

export default function HowToRunACommunitySpacePage() {
  return (
    <>
      <JsonLd
        data={[
          howToSchema({
            name: TITLE,
            description: DESCRIPTION,
            image: [HERO_IMAGE, CORE_IMAGE, RAILS_IMAGE],
            steps: HOW_TO_STEPS.map((s) => ({
              name: s.name,
              text: s.text,
              url: '/how-to-run-a-community-space',
            })),
          }),
          faqSchema(FAQ.map((f) => ({ q: f.q, a: f.a }))),
          breadcrumbSchema([
            { name: 'How to run a community space', path: '/how-to-run-a-community-space' },
          ]),
        ]}
      />

      <PhotoHero
        image={HERO_IMAGE}
        alt="A group gathered together outdoors, mid-conversation in the afternoon light"
        focal="object-center"
        eyebrow="The operator playbook"
        title="How to run a community space"
        subtitle="A rhythm, a room, a few regulars, and light tooling. That is the whole job. Not charisma, not a big budget. Here is the playbook for running one that keeps happening."
      >
        <Button href="/spaces">
          Run yours as a Space <ArrowRight className="w-5 h-5" />
        </Button>
      </PhotoHero>

      {/* Answer-first opening: the direct answer in the first two sentences. */}
      <Section tone="canvas" pad="pt-16 pb-16 sm:pt-20 sm:pb-20">
        <Lead>
          Running a community space takes four plain things: a standing rhythm, a
          room you can reliably get, a few regulars who come back, and light tooling
          so the admin does not all fall on you.
        </Lead>
        <Body>
          Notice what is not on that list. No magnetic personality, no lease, no
          launch event. The rooms that last are held together by consistency and a
          simple format, and both of those are things you can set up on purpose. The
          rest of this page is the playbook, step by step.
        </Body>
      </Section>

      <PullQuote tone="surface">
        A community space is not run on charisma.{' '}
        <span className="text-primary">It is run on a rhythm that never moves.</span>
      </PullQuote>

      {/* One concept per section: the failure mode named plainly, answer first. */}
      <Section tone="surface">
        <h2 className="font-display uppercase text-text text-3xl sm:text-4xl mb-5">
          Why do community spaces fizzle out?
        </h2>
        <Lead>
          Because they lean on one person&apos;s energy instead of a structure
          anyone can keep. Spaces die from inconsistency and burnout, not from a
          quiet night.
        </Lead>
        <Body>
          When the whole thing rides on the host being on every week, it ends the
          first time they are tired, traveling, or having a hard month. Fix the time
          so it never moves, keep the format simple enough to repeat, and share the
          roles before you run out. Build those rails first and the room can outlast
          your worst week.
        </Body>
      </Section>

      {/* Illustrated supporting beat: the core, with a real gathering photo. */}
      <ZigZag
        img={CORE_IMAGE}
        alt="A small group of men sitting in a circle outdoors, talking"
        eyebrow="What actually holds it"
        title="A few regulars beat a big crowd."
        imgAspect="landscape"
        tone="canvas"
      >
        <p>
          The spine of a community space is not the turnout on the good night. It is
          the three or four people who come back whether it is raining or not. Learn
          their names, notice when they miss, and treat them like the co-owners they
          are becoming.
        </p>
        <p>
          Once you have that core, hand out roles. Someone brings the coffee, someone
          opens up, someone welcomes the newcomers. A room one person runs is fragile.
          A room a small group holds is hard to kill.
        </p>
      </ZigZag>

      {/* Answer-first how-to, then the concrete steps (mirrored into HowTo schema). */}
      <Section tone="surface">
        <h2 className="font-display uppercase text-text text-3xl sm:text-4xl mb-5">
          What are the steps to run a community space?
        </h2>
        <Lead>
          Set a rhythm, lock a room, grow a core, hand out roles, keep the format
          light, and let tooling carry the admin. Six plain steps:
        </Lead>
        <div className="mt-8">
          <Steps steps={HOW_TO_STEPS.map((s) => ({ title: s.name, body: s.text }))} />
        </div>
      </Section>

      <Statement tone="canvas">
        You do not have to run it alone.{' '}
        <span className="text-primary">You have to build the rails once.</span>
      </Statement>

      {/* Hand off to the product: Frequency as the tooling that carries the admin. */}
      <ZigZag
        img={RAILS_IMAGE}
        alt="A circle of friends sitting close together outdoors during a shared practice"
        eyebrow="How Frequency helps"
        title="Light tooling, so the room outlasts you."
        imgAspect="landscape"
        reverse
        tone="surface"
        cta={{ label: 'The community builder toolkit', href: '/tools-for-community-builders' }}
      >
        <p>
          Run your community as a Space and the admin stops living in your head. You
          get a front door in Discover so new people find the rhythm, the format for
          Circles and Runs so a group lasts, Dispatch to send the reminder every
          time, and a path from Member to Crew to Host so your regulars can step up.
        </p>
        <p>
          You keep your voice and your room. Frequency carries the logistics that
          usually eat the host, so your energy goes into the people in front of you
          instead of the spreadsheet behind them.
        </p>
      </ZigZag>

      {/* Soft CTA into the product. Two honest doors: run it, or see the venue. */}
      <Section tone="canvas">
        <h2 className="font-display uppercase text-text text-3xl sm:text-4xl mb-5">
          Where to start
        </h2>
        <Body>
          The fastest way to run a community space is to claim a Space: set your
          rhythm, host your first small room, and let the format carry the rest. If
          you want to see what a purpose-built community space looks like with the
          doors on, tour The Lab. Both are the same idea at different sizes.
        </Body>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Button href="/spaces">
            Run yours as a Space <ArrowRight className="h-5 w-5" />
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
        heading="Run the room your neighborhood keeps wishing for."
        body="Frequency hands you the front door, the format, and the tooling to hold a rhythm without carrying it alone. Join the Beta and run your Space."
      />
    </>
  )
}
