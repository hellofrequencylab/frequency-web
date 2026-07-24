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
import { articleSchema, faqSchema, howToSchema, breadcrumbSchema } from '@/lib/jsonld'

export const revalidate = 3600

const TITLE = 'What is Frequency and how does it work?'
// META_DESCRIPTION is trimmed to ~155 chars for the SERP snippet and carries the
// primary keywords. The longer DESCRIPTION feeds the Article schema, where length
// is not penalized and the fuller Community Collective framing aids AIO citation.
const META_DESCRIPTION =
  'Frequency is a Community Collective: small local Circles, nearby Events, and a real space to gather. What it is, how it works, and what it costs.'
const DESCRIPTION =
  'Frequency is a Community Collective: small local Circles, nearby Events, and a real space to gather, plus the tools creators and businesses need to grow together. You keep 100% of your own bookings. Here is what it is, how it works, and what it costs.'

// The hero photo, fed to the Article schema for richer-result eligibility.
const HERO_IMAGE = '/images/site/community-1.jpg'

export function generateMetadata(): Metadata {
  return {
    title: TITLE,
    description: META_DESCRIPTION,
    alternates: { canonical: '/what-is-frequency' },
    openGraph: {
      title: 'What is Frequency and how does it work? · Frequency',
      description:
        'Frequency is a Community Collective: small local Circles, nearby Events, a real space to gather, and the tools to grow together. What it is, how it works, and what it costs.',
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
    a: 'Frequency is a Community Collective built to rebuild the third place: the spaces that are not home and not work where you are known by name. It gives a neighborhood everything it needs to gather in one place through small local Circles, nearby Events, and a physical space to meet, and gives the creators, coaches, and businesses who host them the tools to grow together, while everyone keeps 100% of their own bookings.',
  },
  {
    q: 'How does Frequency work?',
    a: 'Three steps. You pick what you practice (a Channel inside one of the four Pillars: Mind, Body, Spirit, Expression), join a Circle (a small standing local group that meets on a set rhythm), and show up to Events near you. The same handful of faces keep ending up in the same room, which is how strangers slowly become regulars and regulars become friends. The app handles the quiet logistics of who is meeting, where, and when, then gets out of the way.',
  },
  {
    q: 'What is a Circle?',
    a: 'A Circle is a small group around a shared interest that meets on a regular rhythm: a walk, a supper table, a breathwork sit, a book. It is leaderful, not leader-dependent, so it holds itself together instead of depending on one person to keep it alive.',
  },
  {
    q: 'What are the four Pillars?',
    a: 'The four Pillars are Mind, Body, Spirit, and Expression, the parts a whole life moves through. You start in the one calling you right now. Inside each Pillar are Channels, and inside each Channel are Circles near you.',
  },
  {
    q: 'What is a Channel?',
    a: 'A Channel is what you practice: a topic inside a Pillar, like breathwork, strength, supper clubs, or human relating. It connects you to people everywhere who care about the same thing, and it is the thread that leads you to a Circle near you.',
  },
  {
    q: 'How does a Circle grow?',
    a: 'Circles are built to divide, not to keep a waitlist. When one fills up it seeds a new Circle, led by someone ready to step up. A few neighboring Circles become a neighborhood, neighborhoods become a whole local community, and none of it is appointed from above.',
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
    a: 'Frequency keeps 0% of your own bookings, always. You keep 100% of what your own clients and classes earn you. We make our money only on the business the network sends you, a small network-only take-rate that shrinks as your plan rises: Business 5%, Collective 3%, Non Profit 0%, Independent 0%. Plans run Member (free), Crew ($9), Business ($29, beta $19), Collective ($79, beta $49), Non Profit ($39), and Independent ($249). See the full ladder at /pricing.',
  },
  {
    q: 'How does Frequency make money?',
    a: 'Only on the business the network sends you, never on the work you bring yourself. Your own bookings, clients, and classes are 0%, always. When the network refers a client or sells your work to someone you would not have reached alone, we take a small network-only slice that shrinks as your plan rises: Business 5%, Collective 3%, Non Profit 0%, Independent 0%. The physical spaces are funded separately, through a community-owned vehicle, not skimmed off your margin.',
  },
  {
    q: 'What is the Community Collective?',
    a: 'Frequency is a Community Collective: a network where independent creators, coaches, healers, and small businesses grow together, and eventually build real-world spaces together. You keep 100% of your own bookings and we earn only on what the network sends you. Four promises hold it honest: we never take a cut of your bookings, one honest price with no surprise invoices, month to month so you can leave anytime with your data, and a live readout of exactly what the network earned you.',
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

// The tier ladder, lifted for AIO so an answer engine can quote the whole shape
// in one place. Take-rate shown is network-sourced only: your own bookings are
// always 0%. Prices mirror /pricing and the FAQ; every step up buys down the rate.
const TIERS = [
  { name: 'Member', price: 'Free', take: '0% on your own bookings', who: 'Belong, be found, run a basic bookable page.' },
  { name: 'Crew', price: '$9/mo', take: '0% on your own bookings', who: 'The full game, plus author your own Circles and Journeys.' },
  { name: 'Business', price: '$29/mo (beta $19)', take: '5% network only', who: 'Run your whole practice on one honest price.' },
  { name: 'Collective', price: '$79/mo (beta $49)', take: '3% network only', who: 'Host collaborators, a shared Space, and shared Events.' },
  { name: 'Non Profit', price: '$39/mo', take: '0% network only', who: 'The full Collective toolkit, verified 501(c)(3).' },
  { name: 'Independent', price: '$249/mo', take: 'Off the network', who: 'White-label and standalone. Standard software, no network lift.' },
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
            updated: '2026-07-24',
            image: HERO_IMAGE,
          }),
          faqSchema(FAQ.map((f) => ({ q: f.q, a: f.a }))),
          // HowTo mirrors the visible three-step "How does Frequency work?"
          // section so answer engines can lift the steps directly. Derived from
          // STEPS: schema and copy never drift.
          howToSchema({
            name: 'How does Frequency work?',
            description:
              'Find your people by what you care about, join a small local Circle, and gather in person.',
            image: HERO_IMAGE,
            steps: STEPS.map((s) => ({ name: s.title, text: s.body })),
          }),
          breadcrumbSchema([{ name: 'What is Frequency', path: '/what-is-frequency' }]),
        ]}
      />

      <PhotoHero
        image={HERO_IMAGE}
        alt="A small group sitting together on a sunlit lawn, settled into easy conversation"
        focal="object-center"
        eyebrow="The short version"
        title="What is Frequency?"
        subtitle="Frequency is a Community Collective. Small local Circles, nearby Events, a real space to gather, and the tools creators and businesses need to grow together. You keep 100% of your own bookings."
      >
        <Button href="/discover">
          See what&apos;s happening near you <ArrowRight className="h-5 w-5" />
        </Button>
      </PhotoHero>

      {/* Answer-first: the direct answer in the first two sentences. */}
      <Section tone="canvas" pad="pt-14 pb-16 sm:pt-16 sm:pb-20">
        <Lead>
          Frequency is a Community Collective built to rebuild the third place:
          the spaces that are not home and not work where you are known by name.
          It gives a neighborhood everything it needs to gather in one place.
        </Lead>
        <Body>
          The corner cafe, the town square, the standing table: we traded them
          for feeds and followers and lost the room. Frequency is the deliberate
          rebuild. You find a few people near you, join a small group that meets
          on a rhythm, and show up in person. The creators, coaches, and
          businesses who host those groups get the booking, payment, and
          community tools to grow together, and keep 100% of their own bookings
          while they do. The app is only the thread that gets everyone into the
          room.
        </Body>
      </Section>

      <PullQuote tone="surface">
        Not a following to perform for.{' '}
        <span className="text-primary">A few people who expect you on Thursday.</span>
      </PullQuote>

      {/* How it works, at a glance. Three steps, then the taxonomy that carries
          them (absorbed from the retired /how-it-works explainer). */}
      <Section tone="surface">
        <h2 className="font-display uppercase text-text text-3xl sm:text-4xl mb-5">
          How does Frequency work?
        </h2>
        <Lead>
          In three steps: pick what you practice, join a Circle near you, and show
          up in person. The same handful of faces keep landing in the same room.
        </Lead>
        <div className="mt-9">
          <Steps steps={STEPS} />
        </div>
        <div className="mt-10">
          <Body>
            Underneath those steps is a simple shape: four Pillars, then Channels,
            then Circles. The four Pillars are Mind, Body, Spirit, and Expression,
            the parts a whole life moves through. Inside a Pillar are Channels
            (breathwork, strength, supper clubs, sound), and a Channel is the thread
            that leads you to a Circle near you. You do not fill out a form or wait
            to be let in. You pick two words, Pillar and Channel, and you are in the
            room. See the four Pillars and how they fit together on{' '}
            <a
              className="text-primary-strong font-semibold hover:underline"
              href="/the-community"
            >
              The Community
            </a>
            .
          </Body>
        </div>
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

      {/* How it grows: absorbed from the retired /how-it-works explainer. */}
      <Section tone="surface">
        <h2 className="font-display uppercase text-text text-3xl sm:text-4xl mb-5">
          How does Frequency grow?
        </h2>
        <Lead>
          It spreads like cells, not franchises. Circles are built to divide, so a
          full one seeds a new one instead of keeping a waitlist.
        </Lead>
        <Body>
          When a Circle fills up, someone who was ready to step up starts the next
          one. A handful of neighboring Circles becomes a neighborhood, a few
          neighborhoods become a whole local community, and none of it is handed
          down from above. That is why it is built guru-free: leaderful, not
          leader-dependent. Take the same structure away from any one person and it
          keeps running, because the practices, the places, and the people were the
          point all along.
        </Body>
      </Section>

      <Section tone="canvas">
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

      <Section tone="surface">
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

      <PullQuote tone="canvas">
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
          last, real physical homes for connection, and a business model that
          stays honest. We never take a cut of your own bookings. We earn only on
          the business the network sends you, a small take-rate that shrinks as
          your plan rises. It is built guru-free, to outlast any one person. We
          are not building a following. We are building infrastructure, the kind
          of thing you can lean your whole weight on.
        </Body>
      </Section>

      <Statement tone="canvas">
        We&apos;re not building a following. We&apos;re building{' '}
        <span className="text-primary">infrastructure</span>.
      </Statement>

      {/* The Community Collective: who it serves and how the money works. */}
      <Section tone="surface">
        <h2 className="font-display uppercase text-text text-3xl sm:text-4xl mb-5">
          Who is Frequency for?
        </h2>
        <Lead>
          Anyone who wants to belong, and everyone who brings people together: the
          creators, coaches, healers, and small businesses who host the Circles and
          run the rooms.
        </Lead>
        <Body>
          This is what makes Frequency a Community Collective. Independent hosts
          grow together instead of alone, share a Space and Events, and keep 100% of
          their own bookings. We earn only on what the network sends them. Plans
          climb from Member to Crew, Business, Collective, Non Profit, and
          Independent, and every step up lowers the small network-only take-rate
          instead of adding a bill. Four promises hold it honest: we never take a
          cut of your bookings, one honest price with no surprise invoices, month to
          month so you can leave anytime with your data, and a live readout of
          exactly what the network earned you.
        </Body>
        <Button href="/pricing" variant="secondary">
          See the plans and take-rates <ArrowRight className="h-5 w-5" />
        </Button>
      </Section>

      {/* The tier ladder, scannable, so answer engines can quote the whole shape. */}
      <Section tone="canvas">
        <h2 className="font-display uppercase text-text text-3xl sm:text-4xl mb-5">
          How much does Frequency cost?
        </h2>
        <Lead>
          Joining is free, forever, and you keep 100% of your own bookings on every
          plan. We earn only on the business the network sends you, and each step up
          the ladder buys that small rate down.
        </Lead>
        <ul className="mt-8 space-y-3">
          {TIERS.map((t) => (
            <li
              key={t.name}
              className="rounded-2xl border border-border bg-surface p-5 sm:flex sm:items-baseline sm:gap-5"
            >
              <div className="flex items-baseline gap-3 sm:w-64 sm:shrink-0">
                <span className="font-display uppercase text-text text-xl leading-none">
                  {t.name}
                </span>
                <span className="text-sm font-bold text-primary-strong">{t.price}</span>
              </div>
              <div className="mt-2 sm:mt-0 min-w-0">
                <p className="text-base text-muted leading-relaxed">{t.who}</p>
                <p className="mt-1 text-xs font-bold uppercase tracking-widest text-subtle">
                  {t.take}
                </p>
              </div>
            </li>
          ))}
        </ul>
        <div className="mt-8">
          <Button href="/pricing">
            See the full pricing <ArrowRight className="h-5 w-5" />
          </Button>
        </div>
      </Section>

      {/* Hub-and-spoke: cross-link the three sibling pillars. This page is the
          canonical explainer; the triptych goes deep on each part. */}
      <Section tone="surface">
        <h2 className="font-display uppercase text-text text-3xl sm:text-4xl mb-5">
          Where can I go deeper?
        </h2>
        <Lead>
          This page is the short answer. Three sibling pages go deep on each part of
          Frequency.
        </Lead>
        <ul className="mt-8 grid gap-4 sm:grid-cols-3">
          {[
            {
              href: '/the-community',
              label: 'The Community',
              text: 'The four Pillars, your Channels, and how Circles grow on their own.',
            },
            {
              href: '/the-lab',
              label: 'The Lab',
              text: 'The physical third space: movement studios, a thermal circuit, a cold pool.',
            },
            {
              href: '/the-quest',
              label: 'The Quest',
              text: 'The year-round game that turns practices into a rhythm you actually keep.',
            },
          ].map((p) => (
            <li key={p.href}>
              <a
                href={p.href}
                className="block h-full rounded-3xl border border-border bg-surface p-6 transition-colors hover:border-border-strong"
              >
                <p className="font-display uppercase text-text text-2xl leading-none">
                  {p.label}
                </p>
                <p className="mt-3 text-sm text-muted leading-relaxed">{p.text}</p>
                <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-primary-strong">
                  Read more <ArrowRight className="h-4 w-4" />
                </span>
              </a>
            </li>
          ))}
        </ul>
      </Section>

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
      <Section tone="canvas">
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
