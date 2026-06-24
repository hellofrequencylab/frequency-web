import type { Metadata } from 'next'
import { ArrowRight } from 'lucide-react'
import {
  PageHero,
  Section,
  Lead,
  Body,
  Steps,
  PullQuote,
  FaqList,
  BetaCTA,
  Button,
} from '@/components/marketing/marketing-ui'
import { Illustration } from '@/components/marketing/illustrations'
import { JsonLd } from '@/components/json-ld'
import {
  articleSchema,
  faqSchema,
  howToSchema,
  breadcrumbSchema,
} from '@/lib/jsonld'
import { SITE_URL } from '@/lib/site'

export const revalidate = 3600

const TITLE = 'How to start a community group (and keep it going)'
const DESCRIPTION =
  'How to start a community group: pick one thing, set a regular time and place, keep it small, and meet again. A simple, repeatable way to build community without doing it alone.'

export function generateMetadata(): Metadata {
  return {
    title: TITLE,
    description: DESCRIPTION,
    alternates: { canonical: '/how-to-build-community' },
    openGraph: {
      title: 'How to start a community group · Frequency',
      description:
        'You do not have to build a whole community. Host one small group, on a regular rhythm, with a format that already works. Here is how.',
      url: '/how-to-build-community',
    },
  }
}

// The four-step plan, also emitted as HowTo schema so answer engines can lift it
// step by step. Plain steps; the magic lives in the structure, not adjectives.
const STEPS = [
  {
    title: 'Pick one thing',
    body: 'Choose a single shared interest: a walk, a book, a meal, a craft. Narrow beats broad. People join a thing, not a vague idea of community.',
  },
  {
    title: 'Set a time and place',
    body: 'Same day, same spot, on a repeat. A standing rhythm is what lets a stranger become a regular. One-off events do not compound; a weekly slot does.',
  },
  {
    title: 'Keep it small',
    body: 'Five to ten people is plenty. Small groups feel safe and let everyone actually talk. You can always grow later; you cannot un-overwhelm a first night.',
  },
  {
    title: 'Meet again',
    body: 'The whole game is the second meeting, and the fifth. Familiarity does the work. Protect the rhythm even when it is small, and it will fill in over time.',
  },
] as const

const FAQ = [
  {
    q: 'How do I start a community group from scratch?',
    a: 'Pick one shared interest, set a regular time and place, keep the first group small, and commit to meeting again. You do not need a venue, a budget, or a big audience. You need one thing, a standing rhythm, and the willingness to host the same small group more than once.',
  },
  {
    q: 'How many people do I need to start?',
    a: 'You can start with three or four. Small is a feature, not a failure: a handful of people who keep coming back beats a big launch that never meets again. Protect the rhythm at small numbers and the group fills in over time.',
  },
  {
    q: 'What if I host something and nobody comes back?',
    a: 'That usually means the format had no rhythm, not that you failed. People come back to a standing plan, not a one-off. Set the same day and place every week, keep it simple, and invite the people who showed up to the next one before they leave.',
  },
  {
    q: 'Do I need a venue or a budget to build community?',
    a: 'No. A living room, a park, a coffee shop, or a video call all work. The thing that matters is that the same people can find the same spot on a regular rhythm. Cost and venue are details; consistency is the whole point.',
  },
  {
    q: 'How do I keep a community group going long-term?',
    a: 'Keep the rhythm steady and the format light, and do not carry it alone. Hand out small roles, let the regulars help, and lean on a structure that already works instead of reinventing the night every time. Groups die from chaos and burnout, not from low numbers.',
  },
]

export default function HowToBuildCommunityPage() {
  return (
    <>
      <JsonLd
        data={[
          articleSchema({
            title: TITLE,
            description: DESCRIPTION,
            path: '/how-to-build-community',
            published: '2026-06-24',
            updated: '2026-06-24',
          }),
          howToSchema({
            name: 'How to start a community group',
            description:
              'A simple, repeatable way to start and sustain a small community group.',
            steps: STEPS.map((s) => ({
              name: s.title,
              text: s.body,
              url: `${SITE_URL}/how-to-build-community`,
            })),
          }),
          faqSchema(FAQ.map((f) => ({ q: f.q, a: f.a }))),
          breadcrumbSchema([
            { name: 'How to build community', path: '/how-to-build-community' },
          ]),
        ]}
      />

      <PageHero
        eyebrow="Build"
        title="How to start a community group (and keep it going)"
        subtitle="You do not have to build a whole community. You have to host one small group, on a regular rhythm, and keep showing up. Here is the short version."
      />

      {/* Answer-first opening. */}
      <Section tone="canvas" pad="pt-4 pb-16 sm:pt-6 sm:pb-20">
        <Lead>
          To start a community group: pick one thing, set a regular time and place,
          keep it small, and meet again. That is the whole recipe, and it works
          whether you have done this before or never tried.
        </Lead>
        <Body>
          The mistake almost everyone makes is starting too big: a grand vision, a
          packed launch, a name and a logo before the first hello. Skip all of it.
          A community is just a small group that meets again, then again, until the
          people in it would notice if it stopped.
        </Body>
        <div className="mx-auto mt-4 max-w-sm">
          <Illustration name="lead" className="h-40" />
        </div>
      </Section>

      <PullQuote tone="surface">
        You do not have to build a community.{' '}
        <span className="text-primary">Host one small group, more than once.</span>
      </PullQuote>

      {/* The plan, as numbered steps (mirrors the HowTo schema). */}
      <Section tone="surface">
        <h2 className="font-display uppercase text-text text-3xl sm:text-4xl mb-8">
          How do I actually start one?
        </h2>
        <Steps steps={STEPS} />
      </Section>

      {/* One concept per section. */}
      <Section tone="canvas">
        <h2 className="font-display uppercase text-text text-3xl sm:text-4xl mb-5">
          Why do most groups fizzle out?
        </h2>
        <Lead>
          Because they lean on charisma and energy instead of structure. The host
          burns out, the rhythm slips, and the group quietly stops.
        </Lead>
        <Body>
          Groups do not usually die from low numbers. They die from chaos and
          burnout: a night that has to be reinvented every time, one person
          carrying all of it, no clear next date. The fix is boring and reliable: a
          format that repeats, small roles spread around, and a standing slot on the
          calendar that nobody has to decide on again.
        </Body>
      </Section>

      <Section tone="surface">
        <h2 className="font-display uppercase text-text text-3xl sm:text-4xl mb-5">
          Do I have to do this alone?
        </h2>
        <Lead>
          No, and you should not. The point of a framework is that you are not
          starting from a blank page or carrying the night by yourself.
        </Lead>
        <Body>
          A Circle on Frequency comes with the rails: a format, a first-night
          script, a regular rhythm, and backup when you need it. You bring the
          people and the willingness to host; the structure handles the rest. You do
          not need to be a natural leader. You need to set out the chairs and be the
          reason your people have somewhere to go.
        </Body>
        <div className="mx-auto mt-2 max-w-sm">
          <Illustration name="circle" className="h-40" />
        </div>
      </Section>

      <PullQuote tone="surface">
        Groups do not die from low numbers.{' '}
        <span className="text-primary">They die from chaos and burnout.</span>
      </PullQuote>

      {/* Soft CTA into the product (Build pillar). */}
      <Section tone="surface">
        <h2 className="font-display uppercase text-text text-3xl sm:text-4xl mb-5">
          Where to start
        </h2>
        <Body>
          Frequency hands community builders the format, the first-night script, and
          the rails, so hosting one Circle is a clear next step instead of a blank
          page. Set out the chairs once, and you are the reason your people have
          somewhere to go.
        </Body>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Button href="/build">
            Host your first Circle <ArrowRight className="h-5 w-5" />
          </Button>
          <Button href="/discover" variant="secondary">
            See how Circles work
          </Button>
        </div>
      </Section>

      {/* FAQ. */}
      <Section tone="canvas">
        <h2 className="font-display uppercase text-text text-3xl sm:text-4xl mb-7">
          Common questions
        </h2>
        <FaqList items={FAQ} />
      </Section>

      <BetaCTA
        heading="Be the reason your people have somewhere to go."
        body="We hand you the format and the script, so you are never building it alone. Join the Beta and start one Circle."
      />
    </>
  )
}
