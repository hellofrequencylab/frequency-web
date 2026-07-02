// SEO pillar: how to make friends as an adult, why it's hard after 30, the
// repeatable thing that works. Pain-first, answer-first, relational register only.
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

const TITLE = 'How to make friends as an adult'
const DESCRIPTION =
  'Making friends as an adult is hard because the built-in ways we used to meet people are gone. Here is why it gets harder after 30, and the simple, repeatable thing that actually works.'

// Real-gathering photos double as the multimodal AIO signal (CONTENT-VOICE §8b)
// and the E-E-A-T proof (§8e): images of real Frequency gatherings. Fed into the
// Article schema below so answer engines see the page as illustrated, dated content.
const HERO_IMAGE = '/images/site/63978107-8b40-4ce2-8eaf-01a2f6f35cb9.jpg'
const PLAY_IMAGE = '/images/site/PHOTO-2020-10-07-14-38-02.jpeg'
const HOOP_IMAGE = '/images/site/36d99363-e483-40a0-b173-7e7ee6c1b379.jpg'

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
      images: [{ url: HERO_IMAGE }],
    },
  }
}

// Answer-first FAQ: relational register only, no health claims. Each answer fully
// resolves the question in its first sentence or two. Fed into the FAQPage schema
// below verbatim.
const FAQ = [
  {
    q: 'How do you make friends as an adult?',
    a: 'You make friends as an adult by showing up to the same place on a regular rhythm and going back more than once. Adult friendships form from repeated, low-pressure run-ins with the same people, not from one great conversation. Pick something that meets on a schedule and keep coming back.',
  },
  {
    q: 'Why is it so hard to make friends after 30?',
    a: 'Because the built-in ways we used to meet people are gone. School, college, and early jobs handed you the same faces every day, so friendships formed without effort. After 30 you have to build that proximity on purpose, and most people never learned how.',
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
    q: 'How do I make friends in a new city where I do not know anyone?',
    a: 'Find one thing that meets on a set schedule near you and go back to it, week after week. A new city has no shortage of one-off events; what you need is the same room more than once, so the same faces start to recognize you. Pick a standing time and become a regular.',
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
            updated: '2026-06-25',
            image: [HERO_IMAGE, PLAY_IMAGE, HOOP_IMAGE],
          }),
          faqSchema(FAQ.map((f) => ({ q: f.q, a: f.a }))),
          breadcrumbSchema([
            { name: 'Adult friendship', path: '/friendship-as-an-adult' },
          ]),
        ]}
      />

      <PhotoHero
        image={HERO_IMAGE}
        alt="A group of friends gathered together on the beach"
        focal="object-center"
        eyebrow="Adult friendship"
        title="How to make friends as an adult"
        subtitle="You used to make friends without trying. Now it feels like a second job. Here is what changed, and the small, repeatable thing that actually works."
      >
        <Button href="/discover">
          Find a Circle near you <ArrowRight className="w-5 h-5" />
        </Button>
      </PhotoHero>

      {/* Answer-first opening: the direct answer in the first two sentences. */}
      <Section tone="canvas" pad="pt-16 pb-16 sm:pt-20 sm:pb-20">
        <Lead>
          You make friends as an adult by going back to the same place, with the
          same people, more than once. That is the whole trick, and almost nobody
          says it out loud.
        </Lead>
        <Body>
          Friendship needs repeated, unplanned time with the same faces. School,
          college, and your first jobs handed you that for free, so friendships
          formed on their own. Take it away and nothing replaces it by default. The
          part nobody taught us is how to build that proximity on purpose. The good
          news: it is a skill, which means it is learnable, and it is simpler than
          it sounds.
        </Body>
      </Section>

      <PullQuote tone="surface">
        You did not get worse at friendship.{' '}
        <span className="text-primary">The easy ways to meet people disappeared.</span>
      </PullQuote>

      {/* One concept per section. Question H2 in the reader's words, answer first. */}
      <Section tone="surface">
        <h2 className="font-display uppercase text-text text-3xl sm:text-4xl mb-5">
          Why is it so hard to make friends after 30?
        </h2>
        <Lead>
          Because friendship used to be a side effect, and now it has to be a
          choice. Proximity used to be free; now you have to build it.
        </Lead>
        <Body>
          Every easy friendship you have ever made probably came from being stuck in
          the same place as someone, over and over: a hallway, a dorm, a first job.
          You did not network. You just kept running into the same people. By your
          thirties that constant exposure is gone, replaced by a calendar full of
          obligations and a commute that ends at your own front door. You move, you
          partner up, the old crew scatters, and your week fills with people you work
          with but would not call on a Saturday.
        </Body>
      </Section>

      {/* Illustrated supporting beat: the mechanism, with a real gathering photo. */}
      <ZigZag
        img={PLAY_IMAGE}
        alt="Friends playing together on the beach"
        eyebrow="What actually builds it"
        title="Repetition, not chemistry."
        imgAspect="landscape"
        tone="canvas"
      >
        <p>
          The myth is that you make a friend in one magic conversation. The reality
          is that friendship is built from repetition: the same faces, the same
          room, enough times that small talk wears a groove into something real.
        </p>
        <p>
          A one-off mixer almost never produces a friend. A thing that meets every
          Thursday eventually does, almost without you noticing. The chemistry shows
          up after the reps, not before them.
        </p>
      </ZigZag>

      {/* Answer-first how-to, then the concrete steps so the mechanism is actionable. */}
      <Section tone="surface">
        <h2 className="font-display uppercase text-text text-3xl sm:text-4xl mb-5">
          How do adults actually make friends?
        </h2>
        <Lead>
          By showing up to the same place on a regular rhythm and going back more
          than once. That is the entire mechanism. Three plain steps:
        </Lead>
        <div className="mt-8">
          <Steps
            steps={[
              {
                title: 'Pick one standing thing',
                body: 'A class, a court, a walk, a Circle. Anything that meets on a set schedule near you.',
              },
              {
                title: 'Go back more than once',
                body: 'The second visit is when a stranger starts to become a familiar face. The fifth is when a familiar face starts to become a friend.',
              },
              {
                title: 'Let the rhythm do the work',
                body: 'You do not have to be charming. You have to be the person who is reliably there.',
              },
            ]}
          />
        </div>
      </Section>

      <Statement tone="canvas">
        The secret is not better small talk.{' '}
        <span className="text-primary">It is the same room, more than once.</span>
      </Statement>

      {/* One concept per section: the "I moved here" / "too shy or too busy" reader. */}
      <Section tone="surface">
        <h2 className="font-display uppercase text-text text-3xl sm:text-4xl mb-5">
          What if I moved here and do not know anyone?
        </h2>
        <Lead>
          Find one thing that meets on a set schedule and go back to it, week after
          week. A new city has plenty of one-off events; what you need is the same
          room more than once.
        </Lead>
        <Body>
          The instinct in a new place is to say yes to everything and meet as many
          people as possible. The thing that actually works is smaller and more
          boring: pick one standing time and become a regular. You are not trying to
          meet everyone. You are trying to keep running into the same handful of
          people until hello turns into a real conversation.
        </Body>
      </Section>

      <Section tone="canvas">
        <h2 className="font-display uppercase text-text text-3xl sm:text-4xl mb-5">
          What if I am too shy or too busy?
        </h2>
        <Lead>
          Then a standing schedule is your friend. You do not need to be charming;
          you need to keep turning up.
        </Lead>
        <Body>
          Shy people make excellent regulars. When a group meets on a set rhythm, the
          pressure to perform drops away, because nobody is trying to win the room in
          one night. You just become the person who is always there, and being
          reliably present is what turns a stranger into a familiar face and a
          familiar face into a friend. Busy is the same problem: one recurring slot
          beats ten good intentions you never act on.
        </Body>
      </Section>

      {/* Illustrated beat that hands off to the product: a Circle as the standing room. */}
      <ZigZag
        img={HOOP_IMAGE}
        alt="People hooping together next to a palm tree"
        eyebrow="Where this lands"
        title="A standing room with the same faces."
        imgAspect="landscape"
        reverse
        tone="surface"
        cta={{ label: 'See how the community works', href: '/the-community' }}
      >
        <p>
          A Circle is a small group around something you care about that meets on a
          set rhythm, so the same handful of people keep ending up in the same room.
          That is the repetition that makes friends, built in on purpose.
        </p>
        <p>
          A Channel is what the Circle is about: one of the seven topics, from
          movement to creative to human relating. You pick what you practice, and
          the standing time does the slow work of turning a room of strangers into
          your people.
        </p>
      </ZigZag>

      {/* Soft CTA into the product. Two honest doors: look around, or read more. */}
      <Section tone="canvas">
        <h2 className="font-display uppercase text-text text-3xl sm:text-4xl mb-5">
          Where to start
        </h2>
        <Body>
          You can browse the Circles and events already happening near you and find a
          room to walk into, or read how the whole thing fits together first. Either
          way, the move is the same: pick one standing time and go back more than
          once.
        </Body>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Button href="/discover">
            Find a Circle near you <ArrowRight className="h-5 w-5" />
          </Button>
          <Button href="/the-community" variant="secondary">
            See how the community works
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

      <Statement tone="canvas">
        Get people together.
        <br />
        Do things <span className="text-primary">on purpose.</span>
      </Statement>

      <BetaCTA
        heading="Friendship is just a standing plan you keep."
        body="Frequency hands you a room that meets on a rhythm, so the same people keep showing up. Join the Beta and find yours."
      />
    </>
  )
}
