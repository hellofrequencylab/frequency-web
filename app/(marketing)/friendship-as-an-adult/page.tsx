import type { Metadata } from 'next'
import { ArrowRight } from 'lucide-react'
import {
  PageHero,
  Section,
  Lead,
  Body,
  PullQuote,
  FaqList,
  BetaCTA,
  Button,
} from '@/components/marketing/marketing-ui'
import { Illustration } from '@/components/marketing/illustrations'
import { JsonLd } from '@/components/json-ld'
import { articleSchema, faqSchema, breadcrumbSchema } from '@/lib/jsonld'

export const revalidate = 3600

const TITLE = 'Why is it so hard to make friends after 30?'
const DESCRIPTION =
  'Making friends as an adult is hard because the built-in ways we used to meet people are gone. Here is why it happens, and a simple, repeatable way to make real friends after 30.'

export function generateMetadata(): Metadata {
  return {
    title: TITLE,
    description: DESCRIPTION,
    alternates: { canonical: '/friendship-as-an-adult' },
    openGraph: {
      title: 'How to make friends as an adult · Frequency',
      description:
        'Why friendship gets harder after 30, and the boring, repeatable thing that actually works: show up to the same room, more than once.',
      url: '/friendship-as-an-adult',
    },
  }
}

// Answer-first FAQ: relational register only, no health claims. Fed into the
// FAQPage schema below verbatim.
const FAQ = [
  {
    q: 'Why is it so hard to make friends after 30?',
    a: 'Because the built-in ways we used to meet people are gone. School, college, and early jobs handed you the same faces every day, so friendships formed without effort. After 30 you have to build that proximity on purpose, and most people never learned how.',
  },
  {
    q: 'How do adults actually make friends?',
    a: 'By showing up to the same place on a regular rhythm and going back more than once. Adult friendships form from repeated, low-pressure run-ins with the same people, not from one great conversation. Pick something that meets on a schedule and keep coming back.',
  },
  {
    q: 'How long does it take to make a real friend as an adult?',
    a: 'It usually takes many hours of shared time, spread over weeks, before an acquaintance becomes a friend. That is why one-off events rarely work and a standing weekly thing does. The repetition is the point, not the icebreakers.',
  },
  {
    q: 'Is it normal to have no close friends as an adult?',
    a: 'Yes, it is far more common than people admit. Plenty of capable, well-liked adults have a full contact list and no one to call on a Tuesday. It is not a character flaw; it is what happens when the easy ways to meet people disappear.',
  },
  {
    q: 'What if I am too shy or too busy to make friends?',
    a: 'You do not have to be outgoing, you have to be consistent. A group that meets on a set schedule does the hard part for you: you just attend. Shy people make great regulars, because being a familiar face matters more than being the life of the party.',
  },
]

export default function FriendshipPage() {
  return (
    <>
      <JsonLd
        data={[
          articleSchema({
            title: TITLE,
            description: DESCRIPTION,
            path: '/friendship-as-an-adult',
            published: '2026-06-24',
            updated: '2026-06-24',
          }),
          faqSchema(FAQ.map((f) => ({ q: f.q, a: f.a }))),
          breadcrumbSchema([
            { name: 'Adult friendship', path: '/friendship-as-an-adult' },
          ]),
        ]}
      />

      <PageHero
        eyebrow="Adult friendship"
        title="Why is it so hard to make friends after 30?"
        subtitle="You used to make friends without trying. Now it feels like a second job. Here is what changed, and the small, repeatable thing that actually works."
      />

      {/* Answer-first opening. */}
      <Section tone="canvas" pad="pt-4 pb-16 sm:pt-6 sm:pb-20">
        <Lead>
          Making friends after 30 is hard because the built-in ways we used to
          meet people are gone. School, college, and your first jobs handed you the
          same faces every single day, so friendships formed on their own.
        </Lead>
        <Body>
          Take that away and nothing replaces it by default. You move, you partner
          up, the old crew scatters, and your week fills with people you work with
          but would not call on a Saturday. The skill nobody taught us is how to
          rebuild that proximity on purpose. The good news: it is a skill, which
          means it is learnable, and it is simpler than it sounds.
        </Body>
        <div className="mx-auto mt-4 max-w-sm">
          <Illustration name="community" className="h-40" />
        </div>
      </Section>

      <PullQuote tone="surface">
        You did not get worse at friendship.{' '}
        <span className="text-primary">The easy ways to meet people disappeared.</span>
      </PullQuote>

      {/* One concept per section. */}
      <Section tone="surface">
        <h2 className="font-display uppercase text-text text-3xl sm:text-4xl mb-5">
          Why does this get so much harder with age?
        </h2>
        <Lead>
          Because friendship used to be a side effect, and now it has to be a
          choice. Proximity used to be free; now you have to build it.
        </Lead>
        <Body>
          Every easy friendship you have ever made probably came from being stuck
          in the same place as someone, over and over: a hallway, a dorm, a first
          job. You did not network. You just kept running into the same people. By
          your thirties, that constant exposure is gone, replaced by a calendar
          full of obligations and a commute that ends at your own front door.
        </Body>
      </Section>

      <Section tone="canvas">
        <h2 className="font-display uppercase text-text text-3xl sm:text-4xl mb-5">
          So how do adults actually make friends?
        </h2>
        <Lead>
          By showing up to the same place on a regular rhythm and going back more
          than once. That is the entire mechanism.
        </Lead>
        <Body>
          The myth is that you make a friend in one magic conversation. The reality
          is that friendship is built from repetition: the same faces, the same
          room, enough times that small talk wears a groove into something real. A
          one-off mixer almost never produces a friend. A thing that meets every
          Thursday eventually does, almost without you noticing.
        </Body>
        <div className="mx-auto mt-2 max-w-sm">
          <Illustration name="circle" className="h-40" />
        </div>
      </Section>

      <Section tone="surface">
        <h2 className="font-display uppercase text-text text-3xl sm:text-4xl mb-5">
          What if I am too shy or too busy?
        </h2>
        <Lead>
          Then a standing schedule is your friend. You do not need to be charming;
          you need to keep turning up.
        </Lead>
        <Body>
          Shy people make excellent regulars. When a group meets on a set rhythm,
          the pressure to perform drops away, because nobody is trying to win the
          room in one night. You just become the person who is always there, and
          being reliably present is what turns a stranger into a familiar face and a
          familiar face into a friend. Busy is the same problem: one recurring slot
          beats ten good intentions you never act on.
        </Body>
      </Section>

      <PullQuote tone="surface">
        The secret is not better small talk.{' '}
        <span className="text-primary">It is the same room, more than once.</span>
      </PullQuote>

      {/* Soft CTA into the product. */}
      <Section tone="surface">
        <h2 className="font-display uppercase text-text text-3xl sm:text-4xl mb-5">
          Where to start
        </h2>
        <Body>
          A Circle is a small group around something you care about that meets on a
          set rhythm, so the same handful of people keep ending up in the same room.
          That is the repetition that makes friends. You can browse the Circles and
          events already happening, or warm up with a few simple practices on your
          own first.
        </Body>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Button href="/discover">
            Find a Circle near you <ArrowRight className="h-5 w-5" />
          </Button>
          <Button href="/practice" variant="secondary">
            Start with a practice today
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
        heading="Friendship is just a standing plan you keep."
        body="Frequency hands you a room that meets on a rhythm, so the same people keep showing up. Join the Beta and find yours."
      />
    </>
  )
}
