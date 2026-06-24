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

const TITLE = 'How to quit doomscrolling: replace the feed, do not just delete it'
const DESCRIPTION =
  'The trick to quitting doomscrolling is replacing the feed with something real, not just deleting the app. Here is why willpower fails, and a small, repeatable thing to reach for instead.'

export function generateMetadata(): Metadata {
  return {
    title: TITLE,
    description: DESCRIPTION,
    alternates: { canonical: '/life-after-the-feed' },
    openGraph: {
      title: 'How to quit doomscrolling · Frequency',
      description:
        'Deleting the app rarely sticks because the feed is filling a real gap. Replace the scroll with five real minutes, and it gets easier.',
      url: '/life-after-the-feed',
    },
  }
}

// Answer-first FAQ. Relational/behavioral register only: no "dopamine detox"
// health claims, no medical language. Mirrored into FAQPage schema below.
const FAQ = [
  {
    q: 'How do I stop doomscrolling?',
    a: 'Replace the scroll instead of just trying to resist it. Pick one small real-world thing to reach for when you would normally open the app, like a five-minute walk or a short sit, and put it where the phone used to be. You quit a habit by swapping it, not by white-knuckling it.',
  },
  {
    q: 'Why is it so hard to put my phone down?',
    a: 'Because the feed is filling a real gap, usually boredom, stress, or the quiet of an empty evening. The phone is the easiest thing in reach. Until something real is easier to reach for, willpower alone keeps losing to the app that was designed to be hard to close.',
  },
  {
    q: 'Does deleting social media apps actually work?',
    a: 'Deleting an app helps for a few days and then usually slips, because nothing took its place. The version that sticks pairs removing the app with adding a small, real thing to do instead. Subtraction without replacement tends to snap back.',
  },
  {
    q: 'What should I do instead of scrolling?',
    a: 'Something small, real, and close at hand: a short walk, a five-minute sit, a few pages of a book, a text to a real friend, ten minutes outside. The bar is low on purpose. The point is to have an easy alternative ready before the urge hits.',
  },
  {
    q: 'How long does it take to break the scrolling habit?',
    a: 'It varies, but you usually feel a difference within a week of swapping the habit rather than just cutting it. The first few days are the hardest; once reaching for the real thing becomes the default, the pull of the feed quietly loses its grip.',
  },
]

export default function LifeAfterTheFeedPage() {
  return (
    <>
      <JsonLd
        data={[
          articleSchema({
            title: TITLE,
            description: DESCRIPTION,
            path: '/life-after-the-feed',
            published: '2026-06-24',
            updated: '2026-06-24',
          }),
          faqSchema(FAQ.map((f) => ({ q: f.q, a: f.a }))),
          breadcrumbSchema([
            { name: 'Life after the feed', path: '/life-after-the-feed' },
          ]),
        ]}
      />

      <PageHero
        eyebrow="Life after the feed"
        title="How to quit doomscrolling: replace the feed, do not just delete it"
        subtitle="You already know the scroll is not good for you. Deleting the app and white-knuckling it rarely sticks. Here is what works instead."
      />

      {/* Answer-first opening. */}
      <Section tone="canvas" pad="pt-4 pb-16 sm:pt-6 sm:pb-20">
        <Lead>
          The trick to quitting doomscrolling is to replace the feed, not just
          delete it. Pick one small real thing to reach for when you would normally
          open the app, and put it where the phone used to be.
        </Lead>
        <Body>
          Willpower loses to a feed built to be hard to close. The way out is not
          more discipline; it is an easier alternative sitting right there when the
          urge shows up. Subtract the app and add a real five minutes, and the swap
          does the work resistance never could.
        </Body>
        <div className="mx-auto mt-4 max-w-sm">
          <Illustration name="feed" className="h-40" />
        </div>
      </Section>

      <PullQuote tone="surface">
        You will not out-willpower the feed.{' '}
        <span className="text-primary">You replace it with something real.</span>
      </PullQuote>

      {/* One concept per section. */}
      <Section tone="surface">
        <h2 className="font-display uppercase text-text text-3xl sm:text-4xl mb-5">
          Why is the feed so hard to put down?
        </h2>
        <Lead>
          Because it is filling a real gap, and it is the easiest thing in reach.
          The phone answers boredom, stress, and the quiet of an empty evening in
          one tap.
        </Lead>
        <Body>
          The apps are designed to never quite end, so there is no natural stopping
          point and the next thing is always one swipe away. Blaming yourself misses
          the point. You are not weak; you are up against software built by teams
          whose whole job is to keep you scrolling. The way to win is to make the
          real thing easier than the app, not to try harder against it.
        </Body>
      </Section>

      <Section tone="canvas">
        <h2 className="font-display uppercase text-text text-3xl sm:text-4xl mb-5">
          Why does deleting the app not stick?
        </h2>
        <Lead>
          Because nothing takes its place. Subtraction without replacement snaps
          back within days.
        </Lead>
        <Body>
          Delete the app and the gap it was filling is still there: the same idle
          minutes, the same wired evenings, now with nothing to reach for. So you
          reinstall it, or you find another feed. The version that lasts pairs taking
          the app away with adding a small, real thing in the exact moments you used
          to scroll. The habit needs somewhere to go.
        </Body>
        <div className="mx-auto mt-2 max-w-sm">
          <Illustration name="mindless" className="h-40" />
        </div>
      </Section>

      <Section tone="surface">
        <h2 className="font-display uppercase text-text text-3xl sm:text-4xl mb-5">
          What should I reach for instead?
        </h2>
        <Lead>
          Something small, real, and close at hand: a five-minute walk, a short sit,
          a few pages, a text to a real friend, ten minutes outside.
        </Lead>
        <Body>
          Keep the bar low on purpose. The goal is not a perfect new routine; it is
          one easy alternative ready before the urge hits. That is what the Mindless
          timer is for: open it, set five minutes, and do one plain thing instead of
          scrolling. Get out of your head and into your life, one short stretch at a
          time, until reaching for the real thing becomes the default.
        </Body>
      </Section>

      <PullQuote tone="surface">
        Five real minutes beats an hour of the scroll.{' '}
        <span className="text-primary">Put it where the phone used to be.</span>
      </PullQuote>

      {/* Soft CTA into the product (Practice: Mindless + Practices). */}
      <Section tone="surface">
        <h2 className="font-display uppercase text-text text-3xl sm:text-4xl mb-5">
          Where to start
        </h2>
        <Body>
          Frequency gives you the small real thing to reach for: the Mindless timer
          for a five-minute sit or walk, and a library of simple Practices you can do
          on your own before your coffee. Start today, in five minutes, and let the
          swap do the work.
        </Body>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Button href="/practice">
            Try a five-minute practice <ArrowRight className="h-5 w-5" />
          </Button>
          <Button href="/discover" variant="secondary">
            Browse the Practices
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
        heading="Trade the scroll for five real minutes."
        body="The Mindless timer and a shelf of simple Practices give the habit somewhere to go. Join the Beta and start today."
      />
    </>
  )
}
