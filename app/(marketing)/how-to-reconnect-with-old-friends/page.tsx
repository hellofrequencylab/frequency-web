// SEO pillar (Seeker track, CONTENT-VOICE §7a): how to reconnect with old
// friends you have lost touch with, how to message an old friend without it
// being weird, how to rebuild a friendship that drifted. Answer-first,
// relational register, no health claims.
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
import { howToSchema, faqSchema, breadcrumbSchema } from '@/lib/jsonld'

export const revalidate = 3600

const TITLE = 'How to reconnect with old friends'
const DESCRIPTION =
  'You drifted, not fell out. To reconnect with an old friend, send one short, warm message that names a real memory, keep it light, and offer one easy, low-pressure plan to actually see them.'

// Real-gathering photos double as the multimodal AIO signal (CONTENT-VOICE §8b)
// and the E-E-A-T proof (§8e). Fed into the HowTo schema below so answer engines
// see the page as illustrated content.
const HERO_IMAGE = '/images/site/community-dinner.jpg'
const REACH_IMAGE = '/images/site/group-of-friends.jpg'
const TABLE_IMAGE = '/images/site/outdoor-group.jpg'

export function generateMetadata(): Metadata {
  return {
    title: TITLE,
    description: DESCRIPTION,
    alternates: { canonical: '/how-to-reconnect-with-old-friends' },
    openGraph: {
      title: 'How to reconnect with old friends · Frequency',
      description:
        'You drifted, not fell out. Send one short, warm message that names a real memory, keep it light, and offer one easy plan to actually see them.',
      url: '/how-to-reconnect-with-old-friends',
      images: [{ url: HERO_IMAGE }],
    },
  }
}

// The ordered "how to" the HowTo schema is built from. Kept in one place so the
// on-page Steps and the structured data never drift apart.
const HOW_TO_STEPS = [
  {
    name: 'Let go of the guilt first',
    text: 'Most friendships do not end in a fight. They drift because life got loud. Whoever reaches out is not the one who failed, they are the one being brave. Drop the story that too much time has passed to be allowed to text. It has not.',
  },
  {
    name: 'Send one short, warm message',
    text: 'Keep it light and specific. Name a real memory or something that reminded you of them. "Walked past our old coffee spot and thought of you. How are you?" beats a long apology. You are opening a door, not writing an essay.',
  },
  {
    name: 'Do not over-explain the silence',
    text: 'Resist the urge to account for every month you were quiet. A breezy "I am bad at this and I have missed you" lands warmer than a guilt-soaked timeline. The gap matters far less to them than the fact that you reached out at all.',
  },
  {
    name: 'Offer one easy, concrete plan',
    text: 'A vague "we should catch up" dies in the drafts of both your lives. Offer something small and real: a walk Saturday, a coffee next week, a call on Sunday. One specific, low-pressure invitation is what turns a nice message into an actual reunion.',
  },
  {
    name: 'Pick up where you are, not where you left off',
    text: 'You are both different people now. Do not try to resurrect the exact old friendship. Be curious about who they have become, share who you are now, and let a new, current version of the friendship grow from the first hangout.',
  },
]

// Answer-first FAQ: relational register only, no health claims. Each answer fully
// resolves the question in its first sentence or two. Fed into the FAQPage schema
// below verbatim.
const FAQ = [
  {
    q: 'How do I reconnect with an old friend?',
    a: 'Send one short, warm message that names a real memory or moment that reminded you of them, keep it light instead of apologetic, and offer one easy, specific plan to actually see them. You do not need a reason or a perfect opening line. A simple "I was thinking about you, how are you?" reopens most doors.',
  },
  {
    q: 'Is it weird to message a friend I have not spoken to in years?',
    a: 'No. It feels weirder in your head than it lands in their inbox. Most people are quietly glad to hear from someone they drifted from, because they assumed the same friction you did. A short, friendly message about a shared memory almost never reads as strange. It reads as someone who still cares.',
  },
  {
    q: 'What do I say to an old friend after a long time?',
    a: 'Lead with warmth and something specific. "This song came on and I thought of that road trip, how have you been?" works better than a generic hello or a long apology. Name the memory, ask how they are, and keep it short. You are starting a conversation, not closing an account.',
  },
  {
    q: 'Should I apologize for losing touch?',
    a: 'A light, honest "sorry I went quiet, life got loud" is plenty. A long, guilt-heavy apology puts the weight on them to reassure you, which makes reconnecting feel like work. Acknowledge the gap in a sentence, then move straight to the warm part: that you have missed them and would love to catch up.',
  },
  {
    q: 'What if they do not reply?',
    a: 'Give it time before reading it as a no. People miss messages, get busy, or mean to reply and forget. One gentle nudge a couple of weeks later is fair. If it is still quiet, let it rest without making it mean something about you. You reached out with warmth, and that was the brave and generous part regardless of the reply.',
  },
  {
    q: 'How do we move past the awkwardness when we meet up?',
    a: 'Pick a low-key setting and let an activity carry it: a walk, a coffee, a shared task. Movement and a simple thing to do together take the pressure off filling every silence. Be curious about who they are now rather than trying to recreate the old dynamic, and the awkwardness usually melts within the first ten minutes.',
  },
]

export default function HowToReconnectWithOldFriendsPage() {
  return (
    <>
      <JsonLd
        data={[
          howToSchema({
            name: TITLE,
            description: DESCRIPTION,
            image: [HERO_IMAGE, REACH_IMAGE, TABLE_IMAGE],
            steps: HOW_TO_STEPS.map((s) => ({
              name: s.name,
              text: s.text,
              url: '/how-to-reconnect-with-old-friends',
            })),
          }),
          faqSchema(FAQ.map((f) => ({ q: f.q, a: f.a }))),
          breadcrumbSchema([
            {
              name: 'How to reconnect with old friends',
              path: '/how-to-reconnect-with-old-friends',
            },
          ]),
        ]}
      />

      <PhotoHero
        image={HERO_IMAGE}
        alt="A group of old friends gathered around a table, laughing together"
        focal="object-center"
        eyebrow="For the one who drifted"
        title="How to reconnect with old friends"
        subtitle="You did not fall out. Life just got loud and the messages got fewer until they stopped. The good news: drifted friendships are some of the easiest to rebuild. Here is how to reach back."
      >
        <Button href="/the-community">
          See how Frequency works <ArrowRight className="w-5 h-5" />
        </Button>
      </PhotoHero>

      {/* Answer-first opening: the direct answer in the first two sentences. */}
      <Section tone="canvas" pad="pt-16 pb-16 sm:pt-20 sm:pb-20">
        <Lead>
          To reconnect with an old friend, send one short, warm message that names
          a real memory, keep it light instead of apologetic, and offer one easy
          plan to actually see them. You do not need a reason or a perfect line.
        </Lead>
        <Body>
          The thing that keeps most people stuck is not the friend, it is the story
          that too much time has passed to be allowed to text. It has not. The
          person on the other end almost certainly misses the same easy thing you
          do, and is waiting for someone to be the first to reach back. Be that
          someone, keep it small, and let the rest follow.
        </Body>
      </Section>

      <PullQuote tone="surface">
        You did not lose the friendship.{' '}
        <span className="text-primary">You just stopped sending the text.</span>
      </PullQuote>

      {/* One concept per section. Question H2 in the reader's words, answer first. */}
      <Section tone="surface">
        <h2 className="font-display uppercase text-text text-3xl sm:text-4xl mb-5">
          Is it weird to message a friend I have not spoken to in years?
        </h2>
        <Lead>
          No. It feels far weirder in your head than it lands in their inbox. Most
          people are quietly glad to hear from someone they drifted from.
        </Lead>
        <Body>
          You are running a worst-case script that they are not. They probably
          assumed the same friction you did, felt the same low-grade guilt, and
          would love an excuse to drop it. A short, friendly message about a shared
          memory almost never reads as strange. It reads as someone who still
          cares enough to reach across the gap.
        </Body>
      </Section>

      {/* Illustrated supporting beat: the mechanism, with a real gathering photo. */}
      <ZigZag
        img={REACH_IMAGE}
        alt="A small group of friends standing close together outdoors, talking and smiling"
        eyebrow="What actually works"
        title="Warm and specific, not long and sorry."
        imgAspect="landscape"
        tone="canvas"
      >
        <p>
          The instinct is to write a careful apology that accounts for every silent
          month. Skip it. A long, guilt-heavy message puts the weight on them to
          reassure you, which turns a happy surprise into homework.
        </p>
        <p>
          Lead with the warm, specific thing instead: a memory, a song, a place
          that reminded you of them. Name it, ask how they are, and keep it short.
          You are opening a door, not settling an account, and an open door is easy
          to walk through.
        </p>
      </ZigZag>

      {/* Answer-first how-to, then the concrete steps (mirrored into HowTo schema). */}
      <Section tone="surface">
        <h2 className="font-display uppercase text-text text-3xl sm:text-4xl mb-5">
          What are the steps to reconnect with an old friend?
        </h2>
        <Lead>
          Drop the guilt, send one warm message, do not over-explain, offer one
          concrete plan, and pick up where you both are now. Five plain steps:
        </Lead>
        <div className="mt-8">
          <Steps steps={HOW_TO_STEPS.map((s) => ({ title: s.name, body: s.text }))} />
        </div>
      </Section>

      <Statement tone="canvas">
        You do not have to explain the silence.{' '}
        <span className="text-primary">You have to send one warm line.</span>
      </Statement>

      {/* One concept per section: the failure mode named plainly. */}
      <Section tone="surface">
        <h2 className="font-display uppercase text-text text-3xl sm:text-4xl mb-5">
          Why do reconnections fizzle before you even meet up?
        </h2>
        <Lead>
          Because the conversation stays vague. &ldquo;We should catch up&rdquo; feels friendly
          but commits to nothing, so it quietly dies in two busy lives.
        </Lead>
        <Body>
          A nice exchange of messages is not a reunion. The thing that turns it into
          one is a single, specific, low-pressure plan: a walk on Saturday, a coffee
          next week, a call on Sunday morning. Name a real time and a small thing to
          do, and the friendship gets a place to land instead of floating off into
          good intentions.
        </Body>
        <div className="mt-8">
          <Button href="/the-quest" variant="secondary">
            See the path we hand new members
          </Button>
        </div>
      </Section>

      {/* Illustrated beat that hands off to the product. */}
      <ZigZag
        img={TABLE_IMAGE}
        alt="Friends gathered outdoors in a relaxed group, enjoying time together"
        eyebrow="Where this lands"
        title="Reconnecting is easier with a standing room."
        imgAspect="landscape"
        reverse
        tone="surface"
        cta={{ label: 'See how the community works', href: '/the-community' }}
      >
        <p>
          The reason old friendships drift is that nothing held the time. Once the
          shared class, team, or neighborhood ended, the friendship had no rhythm to
          rest on, so it slowly thinned out.
        </p>
        <p>
          Frequency gives a friendship somewhere to keep happening: a small standing
          Circle that meets on repeat around something you both like. Reach out to
          your old friend, then bring them into a room that meets again, so you never
          have to rebuild from zero a second time.
        </p>
      </ZigZag>

      {/* Soft CTA into the product. Two honest doors. */}
      <Section tone="canvas">
        <h2 className="font-display uppercase text-text text-3xl sm:text-4xl mb-5">
          Where to start
        </h2>
        <Body>
          Pick one person you have been meaning to text, and send the short, warm
          message today. Then, if you want the kind of friendships that do not
          quietly drift again, find a standing Circle near you and become a regular,
          so showing up is built into your week instead of left to memory.
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
        heading="Old friends drift when nothing holds the time. Build a room that does."
        body="Frequency gives your friendships a standing place to keep happening, a small Circle that meets on repeat. Reach out today, then join the Beta."
      />
    </>
  )
}
