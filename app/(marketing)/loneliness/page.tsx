// SEO pillar: high-functioning loneliness, third places, belonging. Answer-first.
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

const TITLE = 'High-functioning loneliness: when you look fine but feel alone'
const DESCRIPTION =
  'High-functioning loneliness is feeling alone while your life looks fine on paper. Here is what it is, why it happens to capable adults, and a few small ways to find real-world connection again.'

export function generateMetadata(): Metadata {
  return {
    title: TITLE,
    description: DESCRIPTION,
    alternates: { canonical: '/loneliness' },
    openGraph: {
      title: 'High-functioning loneliness, explained · Frequency',
      description:
        'A hundred contacts and no one to call on a Tuesday. What high-functioning loneliness is, why it happens, and small ways back to real-world connection.',
      url: '/loneliness',
    },
  }
}

// Answer-first FAQ. Each answer fully resolves the question in its first sentence
// or two, in the relational register only (no health claims): less alone, steadier,
// real friendships. The same pairs feed the FAQPage schema below.
const FAQ = [
  {
    q: 'What is high-functioning loneliness?',
    a: 'High-functioning loneliness is feeling alone while your outer life looks fine. You have a job, plans, and a full phone, but no one you would call on a Tuesday night. The function is real and so is the loneliness; they just live side by side.',
  },
  {
    q: 'Why do I feel lonely when I have plenty of friends?',
    a: 'Because contacts are not the same as company. You can know a hundred people and still have no one who knows what your week was actually like. Loneliness tracks the depth of connection, not the count, so a full contact list and a quiet Tuesday can both be true.',
  },
  {
    q: 'What is a third place and why does it matter?',
    a: 'A third place is somewhere that is not home and not work where you see the same faces on a regular rhythm: a cafe, a court, a class, a regular table. They matter because most adult friendships form from repeated, low-pressure run-ins, and when third places disappear, so do the easy ways to make friends.',
  },
  {
    q: 'How do I stop feeling lonely as an adult?',
    a: 'Pick one thing that meets on a schedule and go back to it more than once. Loneliness eases through repeated, real-world run-ins with the same people, not through one big push. Start small, show up twice, and let familiarity do the slow work.',
  },
  {
    q: 'Is loneliness the same as being alone?',
    a: 'No. Being alone is a setting; loneliness is the gap between the connection you have and the connection you want. You can be alone and content, or surrounded and lonely. The fix is not more people in the room, it is a few people you keep coming back to.',
  },
]

export default function LonelinessPage() {
  return (
    <>
      <JsonLd
        data={[
          articleSchema({
            title: TITLE,
            description: DESCRIPTION,
            path: '/loneliness',
            published: '2026-06-24',
            updated: '2026-06-24',
          }),
          faqSchema(FAQ.map((f) => ({ q: f.q, a: f.a }))),
          breadcrumbSchema([{ name: 'Loneliness', path: '/loneliness' }]),
        ]}
      />

      <PageHero
        eyebrow="Belonging"
        title="High-functioning loneliness: when you look fine but feel alone"
        subtitle="A hundred contacts. No one to call on a Tuesday. If your life looks full and still feels empty, you are not broken and you are not alone in it."
      />

      {/* Answer-first: the direct answer in the first two sentences. */}
      <Section tone="canvas" pad="pt-4 pb-16 sm:pt-6 sm:pb-20">
        <Lead>
          High-functioning loneliness is feeling alone while your outer life
          looks fine. You hold down a job, keep plans, and answer texts, and you
          still have no one who really knows how your week went.
        </Lead>
        <Body>
          The function is real. So is the loneliness. They sit next to each other,
          which is exactly why it is so easy to miss and so hard to admit. Nothing
          on the surface says anything is wrong. The fix is not trying harder at
          your life. It is a handful of people you keep showing up for.
        </Body>
        <div className="mx-auto mt-4 max-w-sm">
          <Illustration name="belonging" className="h-40" />
        </div>
      </Section>

      <PullQuote tone="surface">
        A full phone is not the same as{' '}
        <span className="text-primary">someone to call on a Tuesday.</span>
      </PullQuote>

      {/* One concept per section. Question H2s in the reader's words. */}
      <Section tone="surface">
        <h2 className="font-display uppercase text-text text-3xl sm:text-4xl mb-5">
          What is high-functioning loneliness?
        </h2>
        <Lead>
          It is the gap between a life that works and a life that feels connected.
          You are capable, busy, and well-liked, and you still go long stretches
          without a real conversation.
        </Lead>
        <Body>
          The word &quot;high-functioning&quot; is the trap. Because you are
          managing, no one worries about you, including you. You keep the calendar
          full and the surface smooth, and the quiet part, that you have not been
          truly known in a while, never makes it into a sentence out loud.
        </Body>
      </Section>

      <Section tone="canvas">
        <h2 className="font-display uppercase text-text text-3xl sm:text-4xl mb-5">
          Why do I feel lonely when I have friends?
        </h2>
        <Lead>
          Because contacts are not company. You can know a lot of people and still
          have no one who knows what kind of week you just had.
        </Lead>
        <Body>
          Loneliness tracks depth, not count. A long contact list says you have
          met people. It says nothing about whether anyone would notice if you went
          quiet for a month. Most of us have plenty of acquaintances and a short
          list of people we would actually call when something goes sideways, and
          for a lot of adults that short list has slowly shrunk to almost no one.
        </Body>
      </Section>

      <Section tone="surface">
        <h2 className="font-display uppercase text-text text-3xl sm:text-4xl mb-5">
          What is a third place, and why does it matter?
        </h2>
        <Lead>
          A third place is somewhere that is not home and not work where you keep
          seeing the same faces: a cafe, a court, a class, a regular table.
        </Lead>
        <Body>
          They matter because most adult friendships do not start with a grand
          gesture. They start with running into the same person enough times that
          hello turns into a conversation. When the third places thin out, the easy
          on-ramps to friendship go with them, and making friends starts to feel
          like a project instead of a side effect.
        </Body>
        <div className="mx-auto mt-2 max-w-sm">
          <Illustration name="community" className="h-40" />
        </div>
      </Section>

      <Section tone="canvas">
        <h2 className="font-display uppercase text-text text-3xl sm:text-4xl mb-5">
          How do I actually feel less alone?
        </h2>
        <Lead>
          Pick one thing that meets on a schedule and go back to it more than once.
          Familiarity does the slow work that effort cannot.
        </Lead>
        <Body>
          The instinct is to fix this with a big push: download three apps, say yes
          to everything, force it. The thing that actually moves the needle is much
          smaller and much more boring. Find a group that meets on a regular rhythm,
          show up, then show up again. The second time is when a stranger starts to
          become a familiar face, and the fifth time is when a familiar face starts
          to become a friend.
        </Body>
        <Body>
          That is the whole idea behind a Circle: a small group around something you
          care about, meeting on a set rhythm, so the same handful of people keep
          ending up in the same room. You do not have to be interesting or
          outgoing. You have to come back.
        </Body>
      </Section>

      <PullQuote tone="surface">
        You do not need more people in the room.{' '}
        <span className="text-primary">You need a few you keep coming back to.</span>
      </PullQuote>

      {/* Soft CTA into the product. Two honest doors: do something today (Practice)
          or look around first (Discover). */}
      <Section tone="surface">
        <h2 className="font-display uppercase text-text text-3xl sm:text-4xl mb-5">
          Where to start
        </h2>
        <Body>
          Frequency is built around exactly this: small groups that meet in person
          on a regular rhythm, plus simple practices you can do on your own in the
          meantime. You can start today, alone, in five minutes, or browse what is
          already happening and find a room to walk into.
        </Body>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Button href="/practice">
            Start a practice today <ArrowRight className="h-5 w-5" />
          </Button>
          <Button href="/discover" variant="secondary">
            See what&apos;s happening near you
          </Button>
        </div>
      </Section>

      {/* FAQ: answer-first pairs, mirrored into FAQPage schema above. */}
      <Section tone="canvas">
        <h2 className="font-display uppercase text-text text-3xl sm:text-4xl mb-7">
          Common questions
        </h2>
        <FaqList items={FAQ} />
      </Section>

      <BetaCTA
        heading="The opposite of lonely is a standing plan."
        body="Frequency turns a screen full of strangers into a few people who expect you on Thursday. Join the Beta and find your room."
      />
    </>
  )
}
