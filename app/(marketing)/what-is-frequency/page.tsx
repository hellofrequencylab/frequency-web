// Core story page: "What is Frequency?" — the answer-first explainer of the
// movement and vision. Distinct from /about (the founding NARRATIVE): this page
// directly answers the question "what is Frequency?" in the first two sentences,
// then resolves the follow-on questions a newcomer actually asks. Answer-first,
// on-brand, Article + FAQ schema for AEO/AIO eligibility (CONTENT-VOICE §8).
import type { Metadata } from 'next'
import { ArrowRight } from 'lucide-react'
import {
  PhotoHero,
  Section,
  Lead,
  Body,
  PullQuote,
  Statement,
  ZigZag,
  Steps,
  FaqList,
  BetaCTA,
  Button,
} from '@/components/marketing/marketing-ui'
import { FOUNDING_PLACE } from '@/lib/site'
import { JsonLd } from '@/components/json-ld'
import { articleSchema, faqSchema, breadcrumbSchema } from '@/lib/jsonld'

export const revalidate = 3600

const TITLE = 'What is Frequency?'
const DESCRIPTION =
  "Frequency rebuilds the third place: small local Circles, nearby Events, and a physical space to gather, connecting neighborhoods into real-world community. Here's what it is, how it works, and why it exists."

// The hero photo, fed to the Article schema for richer-result eligibility.
const HERO_IMAGE = '/images/site/community-1.jpg'

export function generateMetadata(): Metadata {
  return {
    title: TITLE,
    description: DESCRIPTION,
    alternates: { canonical: '/what-is-frequency' },
    openGraph: {
      title: 'What is Frequency? · Frequency',
      description:
        'Frequency rebuilds the third place: small local Circles, nearby Events, and a real space to gather. What it is, how it works, and why it exists.',
      url: '/what-is-frequency',
    },
  }
}

// Answer-first FAQ. Each answer fully resolves the question in its first sentence
// or two, in the locked voice and naming (Circles, Events, The Lab, The Quest).
// The same pairs feed the FAQPage schema below.
const FAQ = [
  {
    q: 'What is Frequency?',
    a: 'Frequency is a movement to rebuild the third place: the spaces that are not home and not work where you are known by name. It connects neighborhoods into real-world community through small local Circles, nearby Events, and a physical space to gather, so connection happens in person instead of on a feed.',
  },
  {
    q: 'How does Frequency work?',
    a: 'You find your people by what you care about, join a Circle (a small standing local group that meets on a set rhythm), and show up to Events near you. The same handful of faces keep ending up in the same room, which is how strangers slowly become regulars and regulars become friends.',
  },
  {
    q: 'What is a Circle?',
    a: 'A Circle is a small group around a shared interest that meets on a regular rhythm: a walk, a supper table, a breathwork sit, a book. It is leaderful, not leader-dependent, so it holds itself together instead of depending on one person to keep it alive.',
  },
  {
    q: 'What is The Lab?',
    a: 'The Lab is the physical third space the community gathers in: movement studios, a thermal circuit, a cold pool, a connection bar, and an events floor. The app is the thread that brings people together; the Lab is the room it lands in. The first one is taking root in ' + FOUNDING_PLACE + '.',
  },
  {
    q: 'Is Frequency a social media app?',
    a: 'No. Frequency is the opposite of a feed. There is no scroll to perform belonging for and no follower count to chase. It uses a light app only to get the same few people into the same real room on a regular rhythm, then gets out of the way.',
  },
  {
    q: 'How much does Frequency cost?',
    a: 'Membership is free to join during the beta. The model is pay-it-forward: people who can give more keep the doors open for people who cannot, so nobody is priced out of belonging.',
  },
  {
    q: 'Where is Frequency available?',
    a: 'Frequency is taking root in ' + FOUNDING_PLACE + ', where the first Circles are forming and the first Lab is being built. It spreads the only way real community ever has: person to person, circle to circle, following the people who start them, one city at a time.',
  },
]

// The three steps, mirrored from the locked "how it fits together" model
// (Pillars > Channels > Circles; show up to Events; gather at The Lab).
const STEPS = [
  {
    title: 'Find your people',
    body: 'Pick what you care about and we point you at a few people near you who care about the same thing. No cold rooms, no starting from scratch.',
  },
  {
    title: 'Join a Circle',
    body: 'A small standing group that meets on a set rhythm. Show up once, then show up again. Familiarity does the slow work that effort cannot.',
  },
  {
    title: 'Gather in person',
    body: 'Events near you, and a physical space to land in. The connection happens face to face, in a real room, not in a feed.',
  },
] as const

export default function WhatIsFrequencyPage() {
  return (
    <>
      <JsonLd
        data={[
          articleSchema({
            title: TITLE,
            description: DESCRIPTION,
            path: '/what-is-frequency',
            published: '2026-06-29',
            updated: '2026-06-29',
            image: HERO_IMAGE,
          }),
          faqSchema(FAQ.map((f) => ({ q: f.q, a: f.a }))),
          breadcrumbSchema([{ name: 'What is Frequency', path: '/what-is-frequency' }]),
        ]}
      />

      <PhotoHero
        image={HERO_IMAGE}
        alt="A small group sitting together on a sunlit lawn, settled into easy conversation"
        focal="object-center"
        eyebrow="The short version"
        title="What is Frequency?"
        subtitle="Frequency is a movement to rebuild the third place: small local Circles, nearby Events, and a real space to gather. Connection in person, with the same few faces, instead of one more feed."
      >
        <Button href="/discover">
          See what&apos;s happening near you <ArrowRight className="h-5 w-5" />
        </Button>
      </PhotoHero>

      {/* Answer-first: the direct answer in the first two sentences. */}
      <Section tone="canvas" pad="pt-14 pb-16 sm:pt-16 sm:pb-20">
        <Lead>
          Frequency is a movement to rebuild the third place: the spaces that are
          not home and not work where you are known by name and missed when you
          do not show up. It connects neighborhoods into real-world community.
        </Lead>
        <Body>
          The corner cafe, the town square, the standing table: we traded them
          for feeds and followers and ended up surrounded yet unseen. Frequency
          is the deliberate rebuild. You find a few people near you, join a small
          group that meets on a rhythm, and show up in person. The app is only
          the thread that gets you into the room.
        </Body>
      </Section>

      <PullQuote tone="surface">
        Not a following to perform for.{' '}
        <span className="text-primary">A few people who expect you on Thursday.</span>
      </PullQuote>

      {/* How it works, at a glance. */}
      <Section tone="surface">
        <h2 className="font-display uppercase text-text text-3xl sm:text-4xl mb-9">
          How does Frequency work?
        </h2>
        <Steps steps={STEPS} />
      </Section>

      {/* One concept per section. Question H2s in the reader's words. */}
      <Section tone="canvas">
        <h2 className="font-display uppercase text-text text-3xl sm:text-4xl mb-5">
          What is a Circle?
        </h2>
        <Lead>
          A Circle is a small group around something you care about that meets on
          a set rhythm, so the same handful of people keep ending up in the same
          room.
        </Lead>
        <Body>
          A walk, a supper table, a breathwork sit, a book. It is leaderful, not
          leader-dependent: everyone holds a piece of it, so it does not collapse
          the moment one person gets tired. You do not have to build a community
          from scratch. You set out the chairs for one Circle, and we hand you
          the format, the rhythm, and the first-night script.
        </Body>
      </Section>

      <Section tone="surface">
        <h2 className="font-display uppercase text-text text-3xl sm:text-4xl mb-5">
          What is The Lab?
        </h2>
        <Lead>
          The Lab is the physical third space the community gathers in: a real
          place you can walk into, not another tab to open.
        </Lead>
        <Body>
          Movement studios, a thermal circuit, a cold pool, a connection bar, and
          an events floor, tuned to bring you back to yourself and then back to
          each other. A feed can keep people warm between meetings; it cannot
          hold a sound bath or the hour after when nobody wants to leave. The
          first Lab is taking root in {FOUNDING_PLACE}.
        </Body>
      </Section>

      <Section tone="canvas">
        <h2 className="font-display uppercase text-text text-3xl sm:text-4xl mb-5">
          Is Frequency a social media app?
        </h2>
        <Lead>
          No. Frequency is the opposite of a feed. There is no scroll to perform
          belonging for and no follower count to chase.
        </Lead>
        <Body>
          The whole point is to get the same few people into the same real room on
          a regular rhythm, then get out of the way. The app does the quiet
          logistics, who is meeting, where, and when, so the connection can happen
          face to face. Success looks like you closing the app and walking into a
          room, not opening it again.
        </Body>
      </Section>

      <PullQuote tone="surface">
        We don&apos;t want to be{' '}
        <span className="text-primary">followed</span>. We want to be{' '}
        <span className="text-primary">joined</span>.
      </PullQuote>

      {/* Why it exists — the mission, said plainly, once. */}
      <Section tone="surface">
        <h2 className="font-display uppercase text-text text-3xl sm:text-4xl mb-5">
          Why does Frequency exist?
        </h2>
        <Lead>
          Because the answer to the loneliest era in history is a folding chair
          with your name on it.
        </Lead>
        <Body>
          Frequency exists to rebuild the third place: a community designed to
          last, real physical homes for connection, and a model that keeps the
          door open to anyone regardless of what they can pay. It is built
          guru-free and pay-it-forward, to outlast any one person. We are not
          building a following. We are building infrastructure, the kind of thing
          you can lean your whole weight on.
        </Body>
      </Section>

      <Statement tone="canvas">
        We&apos;re not building a following. We&apos;re building{' '}
        <span className="text-primary">infrastructure</span>.
      </Statement>

      {/* How it begins, with a real photo and an internal link into the cluster. */}
      <ZigZag
        img="/images/site/community-dinner.jpg"
        alt="A backyard dinner at night, friends gathered around a long table under string lights"
        imgPosition="center"
        imgAspect="landscape"
        eyebrow="Where it begins"
        title="It starts with one Circle"
        kicker="The way real community has always spread: person to person, one room at a time."
        cta={{ label: 'See how the community works', href: '/the-community' }}
      >
        <p>
          You do not have to be interesting or outgoing, and you do not have to
          arrive with friends. You pick what you practice, find a few people near
          you, and come back. The second time is when a stranger becomes a
          familiar face; the fifth time is when a familiar face becomes a friend.
        </p>
        <p>
          It is taking root in {FOUNDING_PLACE} first, the way it always has:
          following the people who start it, one Circle and one city at a time.
        </p>
      </ZigZag>

      {/* FAQ: answer-first pairs, mirrored into FAQPage schema above. */}
      <Section tone="surface">
        <h2 className="font-display uppercase text-text text-3xl sm:text-4xl mb-7">
          Common questions
        </h2>
        <FaqList items={FAQ} />
      </Section>

      <BetaCTA
        heading="Come see what it actually is."
        body="The fastest way to understand Frequency is to walk into one room. Join the Beta and we'll point you at the first move."
      />
    </>
  )
}
