// SEO PILLAR (umbrella): high-functioning loneliness + third places / third space
// + life after the feed (doomscrolling). This page ABSORBS two retiring guides
// (/life-after-the-feed, /what-is-a-third-space), which 301 into it, so it lifts
// their unique content + target keywords here. Answer-first, pain-first, Seeker
// voice (CONTENT-VOICE §2a). Relational register only, no health claims.
import type { Metadata } from 'next'
import { ArrowRight } from 'lucide-react'
import {
  PhotoHero,
  Section,
  Lead,
  Body,
  Steps,
  PullQuote,
  Statement,
  ZigZag,
  FaqList,
  BetaCTA,
  Button,
} from '@/components/marketing/marketing-ui'
import { JsonLd } from '@/components/json-ld'
import { articleSchema, faqSchema, howToSchema, breadcrumbSchema } from '@/lib/jsonld'

export const revalidate = 3600

const TITLE = 'High-functioning loneliness: lonely but not alone'
const DESCRIPTION =
  'High-functioning loneliness is feeling alone while your life looks fine. What it is, why third places vanished, how to quit doomscrolling, and small ways back to real connection.'

// Real-gathering photos double as the multimodal AIO signal (CONTENT-VOICE §8b)
// and the E-E-A-T proof (§8e). Fed into the Article schema for richer results.
const HERO_IMAGE = '/images/site/sunset-surf.jpg'
const PLACE_IMAGE = '/images/site/outdoor-group.jpg'
const FEED_IMAGE = '/images/site/PHOTO-2020-09-09-16-38-27.jpeg'
const BUILD_IMAGE = '/images/site/community-1.jpg'
const TABLE_IMAGE = '/images/site/community-dinner.jpg'

export function generateMetadata(): Metadata {
  return {
    title: TITLE,
    description: DESCRIPTION,
    alternates: { canonical: '/loneliness' },
    openGraph: {
      title: 'High-functioning loneliness, explained · Frequency',
      description:
        'A hundred contacts and no one to call on a Tuesday. What high-functioning loneliness is, why third places got rare, how to beat the feed, and small ways back to real connection.',
      url: '/loneliness',
      images: [{ url: HERO_IMAGE }],
    },
  }
}

// The visible "how to feel less lonely" steps, lifted straight into HowTo schema
// below so the structured data can never assert a step the page does not show.
const HOWTO_STEPS = [
  {
    title: 'Pick one thing that repeats',
    body: 'Choose one group, class, court, table, or Circle that meets on a set rhythm near you. Not five. One.',
  },
  {
    title: 'Show up twice',
    body: 'The first visit is a stranger in a room. The second is when a stranger starts to become a familiar face.',
  },
  {
    title: 'Trade the feed for the room',
    body: 'When the empty evening pulls you to scroll, reach for the standing plan instead. Same time, same faces, next week.',
  },
] as const

// Answer-first FAQ, merged from all three pillars this page now carries: the
// loneliness cluster, the third-place cluster, and the doomscrolling cluster.
// Relational register only (no health claims). Each answer resolves the question
// in its first sentence or two. The same pairs feed the FAQPage schema below.
const FAQ = [
  {
    q: 'What is high-functioning loneliness?',
    a: 'High-functioning loneliness is feeling alone while your outer life looks fine. You have a job, plans, and a full phone, but no one you would call on a Tuesday night. The function is real and so is the loneliness; they just live side by side.',
  },
  {
    q: 'Can you be lonely but not alone?',
    a: 'Yes. You can be surrounded all day and still feel unseen, because loneliness is about being known, not about how many people are in the room. A packed calendar and a quiet ache can be true at the same time. That gap is the whole experience of being lonely but not alone.',
  },
  {
    q: 'Why do I feel lonely when I have plenty of friends?',
    a: 'Because contacts are not the same as company. You can know a hundred people and still have no one who knows what your week was actually like. Loneliness tracks the depth of connection, not the count, so a full contact list and a quiet Tuesday can both be true.',
  },
  {
    q: 'What is a third place, and why does it matter?',
    a: 'A third place is somewhere that is not home and not work where you see the same faces on a regular rhythm: a cafe, a court, a class, a regular table. The sociologist Ray Oldenburg named these "third places," the anchors of community life outside the house (the first place) and the job (the second). They matter because most adult friendships form from repeated, low-pressure run-ins, and when third places disappear, so do the easy ways to make friends.',
  },
  {
    q: 'What is the difference between a third place and a third space?',
    a: 'There is no real difference. "Third place" is the original term from Ray Oldenburg, and "third space" is the way most people say it now. Both mean the same thing: a neutral, welcoming spot outside home and work where the same people gather on a regular rhythm.',
  },
  {
    q: 'What are examples of third places?',
    a: 'The corner cafe, the barbershop, the neighborhood pub, the library, the gym, the church hall, the park bench, the regular run club. A third place is any spot where you can show up alone, be known by name, and stay a while without buying your way in. The key is not the building, it is that the same people keep coming back.',
  },
  {
    q: 'Why have third places disappeared?',
    a: 'They got squeezed out by cost, cars, and screens. Rent pushed out the cheap corner spots that let people linger, sprawl put everything too far to walk to, and a phone started standing in for the hangout. What thinned out was not the buildings so much as the standing, low-pressure reasons to keep seeing the same faces.',
  },
  {
    q: 'How do I quit doomscrolling?',
    a: 'Replace the feed instead of trying to resist it. Pick one real thing to reach for when you would normally open the app, and aim for the kind that has other people in it: a standing weekly meetup, a walking group, a Circle. You quit a habit by swapping it for something better, not by white-knuckling an empty evening.',
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
            updated: '2026-07-24',
            image: [HERO_IMAGE, PLACE_IMAGE, FEED_IMAGE],
          }),
          howToSchema({
            name: 'How to feel less lonely as an adult',
            description:
              'Loneliness eases through repeated, real-world run-ins with the same people. Three small steps to trade a full phone for a standing plan.',
            image: PLACE_IMAGE,
            steps: HOWTO_STEPS.map((s) => ({
              name: s.title,
              text: s.body,
              url: '/loneliness#how-to-feel-less-alone',
            })),
          }),
          faqSchema(FAQ.map((f) => ({ q: f.q, a: f.a }))),
          breadcrumbSchema([{ name: 'Loneliness', path: '/loneliness' }]),
        ]}
      />

      <PhotoHero
        image={HERO_IMAGE}
        alt="Two friends standing at a railing at dusk, watching a pink sunset over the ocean"
        focal="object-center"
        eyebrow="Belonging"
        title="Lonely but not alone"
        subtitle="A hundred contacts. No one to call on a Tuesday. If your life looks full and still feels empty, you are not broken and you are not the only one."
      >
        <Button href="/discover">
          See what&apos;s happening near you <ArrowRight className="h-5 w-5" />
        </Button>
      </PhotoHero>

      {/* Answer-first: the direct answer in the first two sentences. */}
      <Section tone="canvas" pad="pt-14 pb-16 sm:pt-16 sm:pb-20">
        <Lead>
          High-functioning loneliness is feeling alone while your outer life
          looks fine. You hold down a job, keep plans, and answer texts, and you
          still have no one who really knows how your week went.
        </Lead>
        <Body>
          The function is real. So is the loneliness. They sit next to each other,
          which is exactly why it is so easy to miss and so hard to say out loud.
          Nothing on the surface looks wrong. The fix is not trying harder at your
          life. It is a few people you keep showing up for, in a place you keep
          coming back to. This page covers all of it: what the feeling is, why the
          old third places thinned out, why the feed makes it worse, and the small,
          real thing to reach for instead.
        </Body>
      </Section>

      <PullQuote tone="surface">
        A full phone is not the same as{' '}
        <span className="text-primary">someone to call on a Tuesday.</span>
      </PullQuote>

      {/* One concept per section. Question H2s in the reader's words, answer first. */}
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
          Can you be lonely but not alone?
        </h2>
        <Lead>
          Yes. You can be surrounded all day and still feel unseen, because
          loneliness is about being known, not about how full the room is.
        </Lead>
        <Body>
          This is the part that makes people feel a little crazy. By every visible
          measure you are connected: coworkers, group chats, a busy weekend. And
          the ache is still there, because none of it adds up to one person who
          knows the unedited version of your week. Being lonely in a crowd is not a
          contradiction. It is the most common kind there is.
        </Body>
      </Section>

      <Section tone="surface">
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
          If that is where you are, the{' '}
          <a href="/friendship-as-an-adult" className="text-primary underline underline-offset-4">
            adult-friendship guide
          </a>{' '}
          goes deeper on how those short lists rebuild.
        </Body>
      </Section>

      {/* ── Absorbed: what-is-a-third-space ──────────────────────────────────── */}
      <Section tone="canvas">
        <h2 className="font-display uppercase text-text text-3xl sm:text-4xl mb-5">
          What is a third place, and why does it matter?
        </h2>
        <Lead>
          A third place is somewhere that is not home and not work where you keep
          seeing the same faces: a cafe, a court, a class, a regular table. The
          sociologist Ray Oldenburg named these the &quot;third places.&quot;
        </Lead>
        <Body>
          Home is the first place, work is the second, and the third is everything
          in between where the informal life of a neighborhood actually happens.
          &quot;Third place&quot; is Oldenburg&apos;s original term and &quot;third
          space&quot; is the way most people say it now; they mean the same thing.
          They matter because most adult friendships do not start with a grand
          gesture. They start with running into the same person enough times that
          hello turns into a conversation. When the third places thin out, the easy
          on-ramps to friendship go with them, and making friends starts to feel
          like a project instead of a side effect.
        </Body>
      </Section>

      <Section tone="surface">
        <h2 className="font-display uppercase text-text text-3xl sm:text-4xl mb-5">
          What counts as a third place?
        </h2>
        <Lead>
          The corner cafe, the barbershop, the library, the gym, the church hall,
          the run club, the park bench with the same dog-walkers. Any spot where
          you can show up alone and be known.
        </Lead>
        <Body>
          Oldenburg&apos;s test is simple: it is neutral ground, it is easy to get
          to, the same regulars turn up, and you can stay a while without buying
          your way in. The building matters far less than the rhythm. A back corner
          of a coffee shop where the same six people read on Sunday mornings is more
          of a third place than a huge venue nobody returns to.
        </Body>
      </Section>

      <ZigZag
        img={PLACE_IMAGE}
        alt="A small group sitting together outdoors in the late afternoon, settled into easy talk"
        imgPosition="center"
        imgAspect="landscape"
        eyebrow="Why they got rare"
        title="Cost, cars, and screens squeezed the third places out"
        kicker="What thinned out was not the buildings. It was the standing reasons to keep seeing the same faces."
        tone="surface"
      >
        <p>
          Rent pushed out the cheap corner spots that let people linger. Sprawl put
          everything too far apart to walk to, so the casual run-in turned into a
          drive you have to plan. And a phone started standing in for the hangout,
          filling the same idle minutes a stoop or a counter used to.
        </p>
        <p>
          The good news is that the missing piece is a rhythm, and a rhythm is
          something a town can rebuild. You do not have to wait for the old corner
          store to come back. You can find a standing time that already exists, or
          hold one of your own.
        </p>
      </ZigZag>

      <Statement tone="canvas">
        The third places did not just vanish.{' '}
        <span className="text-primary">The rhythms stopped getting held.</span>
      </Statement>

      {/* ── Absorbed: life-after-the-feed (doomscrolling) ────────────────────── */}
      <Section tone="surface">
        <h2 className="font-display uppercase text-text text-3xl sm:text-4xl mb-5">
          How do I quit doomscrolling?
        </h2>
        <Lead>
          You quit doomscrolling by replacing the feed, not by deleting it. The
          feed is filling a real gap, so the way out is to put something real in
          that gap: a small thing to reach for in the moment, and somewhere to be
          that actually misses you when you skip it.
        </Lead>
        <Body>
          Willpower loses to a feed built to be hard to close. The apps never quite
          end, so there is no natural stopping point and the next thing is always
          one swipe away. Blaming yourself misses the point; you are up against
          software made by teams whose whole job is to keep you scrolling. The way
          to win is to make the real thing easier to reach for than the app.
        </Body>
      </Section>

      <ZigZag
        img={FEED_IMAGE}
        alt="A large group of people gathered together on a lawn"
        imgAspect="landscape"
        imgPosition="center"
        eyebrow="What the feed can't fake"
        title="The feed gives you contact. It never gives you a room."
        kicker="A thousand faces a day, and not one that notices when you are gone."
        tone="canvas"
        reverse
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
          cannot copy, and the thing that finally makes the phone easy to put down.
        </p>
      </ZigZag>

      <Section tone="surface">
        <h2 className="font-display uppercase text-text text-3xl sm:text-4xl mb-5">
          Does deleting the app work?
        </h2>
        <Lead>
          Not on its own. Subtraction without replacement snaps back within days,
          because nothing takes the feed&apos;s place.
        </Lead>
        <Body>
          Delete the app and the gap it was filling is still there: the same idle
          minutes, the same wired evenings, now with nothing to reach for. So you
          reinstall it, or you find another feed. The version that lasts pairs
          taking the app away with adding a real thing to do, ideally one with
          people in it. For the urge in the moment, keep the bar low: a short walk,
          a few pages, a text to a friend, ten minutes outside. For the evenings
          that send you scrolling, the real fix is bigger than any single moment,
          and it looks like a standing plan.
        </Body>
      </Section>

      <PullQuote tone="canvas">
        You will not out-willpower the feed.{' '}
        <span className="text-primary">You replace it with somewhere to be.</span>
      </PullQuote>

      {/* ── The answer: how to feel less alone (steps → HowTo schema) ─────────── */}
      <Section tone="surface" pad="pt-16 pb-8 sm:pt-20 sm:pb-10">
        <h2
          id="how-to-feel-less-alone"
          className="font-display uppercase text-text text-3xl sm:text-4xl mb-5"
        >
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
      </Section>
      <Section tone="surface" pad="pt-0 pb-16 sm:pb-20">
        <Steps steps={HOWTO_STEPS} tone="surface" />
      </Section>

      <PullQuote tone="canvas">
        You do not need more people in the room.{' '}
        <span className="text-primary">You need a few you keep coming back to.</span>
      </PullQuote>

      {/* How Frequency helps. The answer made concrete, with a real photo and an
          internal link into the community pillar (SEO clustering). */}
      <ZigZag
        img={BUILD_IMAGE}
        alt="A small group sitting together on a sunlit lawn, settled into easy conversation"
        imgPosition="center"
        imgAspect="landscape"
        eyebrow="How Frequency helps"
        title="A few real people, a standing time"
        kicker="The opposite of lonely is not a crowd. It is a standing plan with the same faces."
        tone="surface"
        cta={{ label: 'See how the community works', href: '/the-community' }}
      >
        <p>
          Frequency is a Community Collective, built to help every community effort
          near you succeed. A Circle is a small group around something you care
          about that meets on a set rhythm, so the same handful of people keep
          ending up in the same room. A walk, a supper table, a book, a sit. That
          regular run-in is the thing that turns strangers into regulars, and it is
          a modern third place you do not have to own a building to have.
        </p>
        <p>
          You do not have to be interesting or outgoing. You do not have to arrive
          with friends. You pick what you practice, find a few people near you, and
          come back. Joining is free, and Frequency never takes a cut of your own
          bookings; you can see exactly how that works on the{' '}
          <a href="/pricing" className="text-primary underline underline-offset-4">
            pricing page
          </a>
          .
        </p>
      </ZigZag>

      {/* Soft CTA into the product. Two honest doors: look around first (Discover)
          or read how the community works (the-community). Both link within the
          cluster. */}
      <ZigZag
        img={TABLE_IMAGE}
        alt="A backyard dinner at night, friends gathered around a long table under string lights"
        imgPosition="center"
        imgAspect="landscape"
        reverse
        tone="canvas"
        eyebrow="Where to start"
        title="Start small, then show up twice"
        kicker="You do not have to fix your whole life this week. You have to walk into one room."
      >
        <p>
          The easiest first step is to look at what is already happening near you:
          the Circles meeting this week, the events you could just walk into. Pick
          one that meets again, go once, and go back. Nothing more than that.
        </p>
        <p>
          New to town and starting from zero? The{' '}
          <a href="/friendship-as-an-adult" className="text-primary underline underline-offset-4">
            new-city guide
          </a>{' '}
          is the same idea aimed at week one. Always wired and can&apos;t switch
          off? Start with{' '}
          <a href="/calm-down-fast" className="text-primary underline underline-offset-4">
            a few ways to calm down fast
          </a>
          .
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Button href="/discover">
            See what&apos;s happening near you <ArrowRight className="h-5 w-5" />
          </Button>
          <Button href="/the-community" variant="secondary">
            How the community works
          </Button>
        </div>
      </ZigZag>

      {/* FAQ: answer-first pairs, mirrored into FAQPage schema above. */}
      <Section tone="surface">
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
