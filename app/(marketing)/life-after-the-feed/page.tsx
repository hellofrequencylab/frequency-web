import type { Metadata } from 'next'
import { ArrowRight } from 'lucide-react'
import {
  PhotoHero,
  Section,
  Lead,
  Body,
  PullQuote,
  ZigZag,
  FaqList,
  BetaCTA,
  Button,
} from '@/components/marketing/marketing-ui'
import { JsonLd } from '@/components/json-ld'
import { articleSchema, faqSchema, breadcrumbSchema } from '@/lib/jsonld'

export const revalidate = 3600

const TITLE = 'How to quit doomscrolling: replace the feed, do not just delete it'
const DESCRIPTION =
  'You quit doomscrolling by replacing the feed with somewhere to be, not by deleting the app and hoping willpower holds. Here is why deleting it never sticks, and the small, real thing to reach for instead.'

// Hero photo doubles as the Article image (AI Overviews are multimodal, §8b).
const HERO_IMAGE = '/images/site/22a51611-07f6-4c39-8a26-1c996295b6d3.jpg'

export function generateMetadata(): Metadata {
  return {
    title: TITLE,
    description: DESCRIPTION,
    alternates: { canonical: '/life-after-the-feed' },
    openGraph: {
      title: 'How to quit doomscrolling · Frequency',
      description:
        'Deleting the app rarely sticks, because the feed is filling a real gap. You beat the feed by replacing it with somewhere to be.',
      url: '/life-after-the-feed',
    },
  }
}

// Answer-first FAQ. Relational/behavioral register only: no "dopamine detox"
// health claims, no medical language. Mirrored into FAQPage schema below.
const FAQ = [
  {
    q: 'How do I stop doomscrolling?',
    a: 'Replace the feed instead of trying to resist it. Pick one real thing to reach for when you would normally open the app, and aim for the kind that has other people in it: a standing weekly meetup, a walking group, a Circle. You quit a habit by swapping it for something better, not by white-knuckling an empty evening.',
  },
  {
    q: 'Why is it so hard to put my phone down?',
    a: 'Because the feed is filling a real gap, usually boredom, stress, or the quiet of an empty evening, and the phone is the easiest thing in reach. Until something real is easier to reach for, willpower keeps losing to an app built to be hard to close. The fix is a better thing to reach for, not more discipline.',
  },
  {
    q: 'Does deleting social media apps actually work?',
    a: 'Deleting an app helps for a few days and then usually slips, because nothing took its place. The version that sticks pairs removing the app with adding a real thing to do instead, ideally one with people in it who notice when you do not show up. Subtraction without replacement snaps back.',
  },
  {
    q: 'What should I do instead of scrolling?',
    a: 'Start small and real: a five-minute walk, a few pages, a text to a friend, ten minutes outside. Then add the bigger fix, a standing time to be around the same people each week, so the empty evening that sends you to the feed has somewhere else to go.',
  },
  {
    q: 'What is a real-life replacement for social media?',
    a: 'A standing, in-person thing that meets on a rhythm: a weekly walk, a supper club, a Circle. The feed gives you contact without anyone noticing you. A room that meets every week gives you the opposite, the same faces who clock when you are gone. That is the part scrolling never delivers.',
  },
  {
    q: 'How long does it take to break the scrolling habit?',
    a: 'You usually feel a difference within a week of swapping the habit rather than just cutting it. The first few days are the hardest. Once you have a real place to be, reaching for it becomes the default and the pull of the feed quietly loses its grip.',
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
            image: HERO_IMAGE,
          }),
          faqSchema(FAQ.map((f) => ({ q: f.q, a: f.a }))),
          breadcrumbSchema([
            { name: 'Life after the feed', path: '/life-after-the-feed' },
          ]),
        ]}
      />

      <PhotoHero
        image={HERO_IMAGE}
        alt="People dancing together at a real-life gathering"
        eyebrow="Life after the feed"
        title="How to quit doomscrolling: replace the feed, do not just delete it"
        subtitle="You already know the scroll is not good for you. Deleting the app and white-knuckling it rarely sticks. The thing that works is having somewhere to be."
        focal="object-center"
      />

      {/* Answer-first opening. */}
      <Section tone="canvas" pad="pt-16 pb-16 sm:pt-20 sm:pb-20">
        <Lead>
          You quit doomscrolling by replacing the feed, not by deleting it. The
          feed is filling a real gap, so the way out is to put something real in
          that gap: a small thing to reach for in the moment, and somewhere to be
          that actually misses you when you skip it.
        </Lead>
        <Body>
          Willpower loses to a feed built to be hard to close. More discipline is
          not the answer; an easier, better alternative is. Swap the empty evening
          for a standing time with real people, and the swap does the work
          resistance never could. The rest of this page is how.
        </Body>
      </Section>

      <PullQuote tone="surface">
        You will not out-willpower the feed.{' '}
        <span className="text-primary">You replace it with somewhere to be.</span>
      </PullQuote>

      {/* One concept per section. */}
      <Section tone="surface">
        <h2 className="font-display uppercase text-text text-3xl sm:text-4xl mb-5">
          Why can&rsquo;t I stop doomscrolling?
        </h2>
        <Lead>
          Because the feed is filling a real gap, and it is the easiest thing in
          reach. The phone answers boredom, stress, and the quiet of an empty
          evening in one tap.
        </Lead>
        <Body>
          The apps are built to never quite end, so there is no natural stopping
          point and the next thing is always one swipe away. Blaming yourself
          misses the point. You are not weak. You are up against software made by
          teams whose whole job is to keep you scrolling. The way to win is to make
          the real thing easier to reach for than the app, not to try harder
          against it.
        </Body>
      </Section>

      <ZigZag
        img="/images/site/PHOTO-2020-09-09-16-38-27.jpeg"
        alt="A large group of people gathered together on a lawn"
        imgAspect="landscape"
        imgPosition="center"
        eyebrow="What you are actually missing"
        title="The feed gives you contact. It just never gives you a room."
        kicker="A thousand faces a day, and not one that notices when you are gone."
        tone="canvas"
      >
        <p>
          The scroll hands you endless people and zero presence. You can watch a
          hundred lives go by and still close the app feeling like nobody clocked
          you were there. That is the trade the feed makes: contact without
          belonging.
        </p>
        <p>
          A room is the opposite. Show up to the same handful of people every week
          and your absence starts to leave a hole. That is the thing the scroll
          cannot fake, and the thing that finally makes the phone easy to put down.
        </p>
      </ZigZag>

      <Section tone="surface">
        <h2 className="font-display uppercase text-text text-3xl sm:text-4xl mb-5">
          Why doesn&rsquo;t deleting the app work?
        </h2>
        <Lead>
          Because nothing takes its place. Subtraction without replacement snaps
          back within days.
        </Lead>
        <Body>
          Delete the app and the gap it was filling is still there: the same idle
          minutes, the same wired evenings, now with nothing to reach for. So you
          reinstall it, or you find another feed. The version that lasts pairs
          taking the app away with adding a real thing to do, ideally one with
          people in it. The habit needs somewhere to go.
        </Body>
      </Section>

      <Section tone="canvas">
        <h2 className="font-display uppercase text-text text-3xl sm:text-4xl mb-5">
          What should I do instead of scrolling?
        </h2>
        <Lead>
          Start small and real, then add a standing time with people. A
          five-minute walk in the moment, and a weekly thing to be part of over
          time.
        </Lead>
        <Body>
          For the urge itself, keep the bar low: a short walk, a few pages, a text
          to a friend, ten minutes outside. Have one easy alternative ready before
          the urge hits. But the real fix is bigger than any single moment. The
          evenings that send you to the feed are the ones with nothing in them. Put
          a standing plan in one of them, the same people, the same time each week,
          and the empty hours that fed the scroll quietly fill up on their own.
        </Body>
      </Section>

      <PullQuote tone="surface">
        Five real minutes beats an hour of the scroll.{' '}
        <span className="text-primary">A standing Thursday beats them both.</span>
      </PullQuote>

      <ZigZag
        img="/images/site/sunset.jpg"
        alt="A calm beach at sunset"
        imgAspect="landscape"
        imgPosition="center"
        eyebrow="What it looks like to replace it"
        title="What does a real week look like instead?"
        kicker="One standing time, a few faces, and a reason to put the phone down."
        tone="surface"
        reverse
      >
        <p>
          A Circle is a small group around something you care about that meets on a
          set rhythm. A walk, a sit, a supper table, a book. Same handful of people,
          same time each week. You do not have to be interesting or outgoing. You
          have to keep turning up.
        </p>
        <p>
          That is the whole replacement. Instead of the phone filling the quiet,
          there is a Thursday with your name on it. You can browse the Circles and
          events already meeting, or read how the community actually works first.
        </p>
      </ZigZag>

      {/* Soft CTA into the product. */}
      <Section tone="canvas">
        <h2 className="font-display uppercase text-text text-3xl sm:text-4xl mb-5">
          Where do I start?
        </h2>
        <Body>
          You do not have to swear off your phone today. Start by giving one empty
          evening somewhere better to go. Find a Circle near you, or read how
          Frequency works before you jump in. The feed will still be there. So will
          you, just somewhere real.
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

      {/* FAQ. */}
      <Section tone="surface">
        <h2 className="font-display uppercase text-text text-3xl sm:text-4xl mb-7">
          Common questions
        </h2>
        <FaqList items={FAQ} />
      </Section>

      <BetaCTA
        heading="Trade the scroll for somewhere to be."
        body="A Circle is a few neighbors and a standing time, so the empty evening that fed the feed has somewhere else to go. Join the Beta and find yours."
      />
    </>
  )
}
