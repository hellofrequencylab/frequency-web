import type { Metadata } from 'next'
import Link from 'next/link'
import { Gamepad2, Users, Trophy, Vote, Sparkles } from 'lucide-react'
import {
  PhotoHero,
  Section,
  SectionHeading,
  Statement,
  Steps,
  FaqList,
  Card,
  Lead,
  Body,
  Button,
  PullQuote,
} from '@/components/marketing/marketing-ui'
import { FounderCtaButton } from '@/components/marketing/founder-cta'
import { JsonLd } from '@/components/json-ld'
import { articleSchema, breadcrumbSchema, faqSchema } from '@/lib/jsonld'

export const metadata: Metadata = {
  title: 'The Founders Round',
  description:
    'Frequency is a city-by-city community built for showing up in person. We are seating the founding circle of 150 now. Reserve a founding spot, no card, no charge.',
  alternates: { canonical: '/founders' },
  openGraph: {
    title: 'The Founders Round · Frequency',
    description:
      'Be one of the first 150 to build a real-world community where you live. Reserve a founding spot, no charge yet.',
    url: '/founders',
  },
}

// The four pillars run through The Quest (Mind, Body, Spirit, Expression). These
// three bullets describe what Frequency IS, written plain per CONTENT-VOICE.
const WHAT_IT_IS = [
  {
    Icon: Gamepad2,
    label: 'A real-world game',
    body: 'The Quest moves through seasons of practices and gatherings across four Pillars: Mind, Body, Spirit, and Expression.',
  },
  {
    Icon: Users,
    label: 'A community you can walk into',
    body: 'Local Circles that actually meet, hosted gatherings, pop-ups, a network growing city by city.',
  },
  {
    Icon: Trophy,
    label: 'A platform that rewards showing up, not scrolling',
    body: 'Progress is real, people are local, status is earned offline.',
  },
]

const HOW_IT_WORKS = [
  {
    title: 'Join the circle',
    body: 'Claim your founding membership and your place in the first 150.',
  },
  {
    title: 'Find your people',
    body: "Join local Circles, gatherings, and the founding members' space.",
  },
  {
    title: 'Play the Quest',
    body: 'Seasonal practices and challenges, earn your way up, help shape what gets built.',
  },
]

// The rally: why this matters and why now, written plain per CONTENT-VOICE
// (campfire-honest, concrete, no hype words, no em dashes). This is the "what
// we're actually building, together" beat that turns a reader into a Founder.
const THE_RALLY = [
  {
    label: 'It only works if people show up',
    body: 'A community is the people in the room, not the app around them. The first 150 set the tone everyone who comes after inherits.',
  },
  {
    label: 'Early is the whole point',
    body: 'Being first is not a perk we tacked on. The founding members pick the first cities, the first gatherings, and what gets built next.',
  },
  {
    label: 'Small on purpose',
    body: 'We capped it at 150 so it stays a room you can actually know, not a feed you scroll. When it is full, it is full.',
  },
]

// CONTENT-VOICE: membership-not-investment framing only; no em dashes. The "(Waitlist
// mode)" answer states plainly that reserving is free and nothing charges today.
const FAQS = [
  {
    q: 'Is this an investment?',
    a: "No, it's a founding membership. You're joining and backing the community, not buying equity.",
  },
  {
    q: 'What do I get on day one?',
    a: 'Founder status, the founding cohort space, early access, and a direct line into what we build next.',
  },
  {
    q: 'When does it charge?',
    a: "Right now you're reserving your founding spot, no charge yet. Founders are charged first when checkout opens, at the locked founder price.",
  },
  {
    q: "What if I can't make gatherings yet?",
    a: 'The Quest and the community run online too. The in-person layer grows city by city.',
  },
]

export default function FoundersPage() {
  return (
    <>
      <JsonLd
        data={[
          articleSchema({
            title: 'The Founders Round',
            description:
              'Frequency is a city-by-city community built for showing up in person. We are seating the founding circle of 150 now. Reserve a founding spot, no card, no charge.',
            path: '/founders',
            published: '2026-06-29',
            updated: '2026-06-29',
            image: ['/images/site/22a51611-07f6-4c39-8a26-1c996295b6d3.jpg'],
          }),
          breadcrumbSchema([{ name: 'The Founders Round', path: '/founders' }]),
          faqSchema(FAQS.map((f) => ({ q: f.q, a: f.a }))),
        ]}
      />

      <PhotoHero
        image="/images/site/22a51611-07f6-4c39-8a26-1c996295b6d3.jpg"
        alt="A Frequency community gathered together outdoors at golden hour"
        focal="object-center"
        eyebrow="The Founders Round"
        title="Real life is the better feed."
        subtitle="Frequency is a city-by-city community built for showing up in person, a real-world game of growth, play, and belonging across Mind, Body, Spirit, and Expression. We're seating the founding circle now."
        footer={
          <p className="mt-8 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-sm text-white/60">
            <span className="font-semibold text-white/80">Free to reserve.</span>
            <span aria-hidden className="text-white/30">·</span>
            <span>No card · Founder pricing locked · Only 150 spots</span>
          </p>
        }
      >
        <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          {/* The hero CTA is flag-gated: waitlist "Claim a Founding spot" today,
              live "Become a Founder, $250" once billing_live flips on. */}
          <FounderCtaButton formHref="/founders/offer#reserve" />
          <Link
            href="#how-it-works"
            className="inline-flex items-center justify-center rounded-2xl border border-white/25 bg-white/5 px-8 py-3.5 text-base font-bold text-white hover:bg-white/10 transition-colors"
          >
            See how it works
          </Link>
        </div>
      </PhotoHero>

      {/* ── The why ──────────────────────────────────────────────────────────── */}
      <Section tone="canvas" pad="pt-20 pb-10 sm:pt-24 sm:pb-12">
        <SectionHeading
          eyebrow="The why"
          title="More connected, and lonelier than ever."
          kicker="The apps were built for our attention, not our lives."
        />
        <Lead>
          We&apos;re more connected and lonelier than ever. The apps were built for
          our attention, not our lives.
        </Lead>
        <Body>
          Frequency flips it: your phone points you toward people, places, and
          practices in your actual city, then gets out of the way.
        </Body>
      </Section>

      <Statement tone="ink">
        Your phone points you toward people, then{' '}
        <span className="text-primary">gets out of the way.</span>
      </Statement>

      {/* ── What Frequency is ────────────────────────────────────────────────── */}
      <Section tone="surface" pad="py-20 sm:py-24">
        <SectionHeading eyebrow="What Frequency is" title="Three things, in plain terms." />
        <div className="grid gap-4 sm:grid-cols-3">
          {WHAT_IT_IS.map(({ Icon, label, body }) => (
            <Card key={label} tone="feature" className="hover:border-border-strong transition-colors">
              <div className="w-11 h-11 rounded-2xl bg-primary-bg flex items-center justify-center mb-4">
                <Icon className="w-5 h-5 text-primary-strong" aria-hidden />
              </div>
              <h3 className="font-display uppercase text-text text-2xl leading-none">{label}</h3>
              <p className="mt-3 text-base text-muted leading-relaxed">{body}</p>
            </Card>
          ))}
        </div>
      </Section>

      {/* ── How it works ─────────────────────────────────────────────────────── */}
      <Section tone="canvas" pad="py-20 sm:py-24" className="scroll-mt-20">
        <div id="how-it-works" />
        <SectionHeading eyebrow="How it works" title="Three steps to belonging." />
        <Steps steps={HOW_IT_WORKS} />
      </Section>

      {/* ── The Founders Circle ──────────────────────────────────────────────── */}
      <Section tone="ink" pad="py-20 sm:py-24">
        <div className="flex items-center gap-3 mb-6">
          <Sparkles className="w-6 h-6 text-primary" aria-hidden />
          <p className="text-sm font-bold uppercase tracking-[0.25em] text-primary">
            The Founders Circle
          </p>
        </div>
        <h2 className="font-display uppercase text-on-ink text-4xl sm:text-5xl mb-6">
          We&apos;re seating the first 150.
        </h2>
        <p className="text-lg text-on-ink-muted leading-relaxed mb-5">
          We&apos;re not crowdfunding a logo. We&apos;re seating the first 150 people
          who build this with us. Founders get in at the founder price (once, locked
          for life), a permanent Founder badge, early access to everything, and a
          real vote on the roadmap.
        </p>
        <p className="text-lg text-on-ink-muted leading-relaxed mb-9">
          When the doors open, you were here first, and it shows.
        </p>
        <Button href="/founders/offer">Become a Founder</Button>
        <p className="mt-6 text-base text-on-ink-muted leading-relaxed">
          Run a business?{' '}
          <Link href="/founders/business" className="font-semibold text-primary underline-offset-4 hover:underline">
            Founding Businesses lock a founder rate and a bought-down network take-rate.
          </Link>
        </p>
      </Section>

      {/* ── The rally ────────────────────────────────────────────────────────── */}
      <PullQuote tone="canvas" cite="Why the first 150 matter">
        A community is the people who{' '}
        <span className="text-primary">show up</span>, not the app around them.
      </PullQuote>

      <Section tone="surface" pad="pt-10 pb-20 sm:pt-12 sm:pb-24">
        <SectionHeading
          eyebrow="The rally"
          title="Why now, and why you."
          kicker="Not a launch. A first room, and you help set the tone."
        />
        <Body>
          Most apps want your attention. We want your Thursday night. The founding
          round is how Frequency starts for real: 150 people who reserve a spot now,
          help pick the first cities, and show up first when the doors open.
        </Body>
        <div className="grid gap-4 sm:grid-cols-3 mt-2">
          {THE_RALLY.map(({ label, body }) => (
            <Card key={label} tone="feature" className="hover:border-border-strong transition-colors">
              <h3 className="font-display uppercase text-text text-2xl leading-none">{label}</h3>
              <p className="mt-3 text-base text-muted leading-relaxed">{body}</p>
            </Card>
          ))}
        </div>
        <p className="mt-8 text-base text-muted leading-relaxed">
          Reserving is free. No card, no charge yet. You are not buying a product,
          you are taking a seat at the start of something and locking your founder
          rate for life.
        </p>
        <div className="mt-8">
          <FounderCtaButton formHref="/founders/offer#reserve" />
        </div>
      </Section>

      {/* ── Built in public ──────────────────────────────────────────────────── */}
      <Section tone="surface" pad="py-20 sm:py-24">
        <SectionHeading eyebrow="Built in public" title="Built in the open, with you in the room." />
        <Lead>
          This is being built in the open, with the founding cohort in the room.
        </Lead>
        <Body>
          You&apos;ll see the roadmap, weigh in on it, and watch your city light up in
          real time.
        </Body>
        <p className="mt-2 inline-flex items-center gap-2 text-sm font-bold uppercase tracking-[0.2em] text-primary-strong">
          <Vote className="w-4 h-4" aria-hidden /> A real vote on the roadmap
        </p>
      </Section>

      {/* ── FAQ ──────────────────────────────────────────────────────────────── */}
      <Section tone="canvas" pad="py-20 sm:py-24">
        <SectionHeading eyebrow="Questions" title="The honest answers." />
        <FaqList items={FAQS} />
      </Section>

      {/* ── Final CTA ────────────────────────────────────────────────────────── */}
      <section className="relative bg-slat px-6 py-24 sm:py-28 text-center overflow-hidden">
        <div className="light-strip absolute inset-x-0 top-0" />
        <div className="amber-glow absolute inset-0 pointer-events-none" />
        <div className="relative max-w-2xl mx-auto">
          <h2 className="font-display uppercase text-on-ink text-4xl sm:text-5xl mb-6">
            Only 150 founding spots. Claim yours.
          </h2>
          <p className="text-xl text-on-ink-muted mb-9 leading-relaxed">
            Free to reserve. No card, no charge yet. Lock your founder rate for life.
          </p>
          <div className="flex justify-center">
            <FounderCtaButton formHref="/founders/offer#reserve" />
          </div>
        </div>
      </section>
    </>
  )
}
