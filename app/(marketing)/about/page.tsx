import type { Metadata } from 'next'
import { ArrowRight, Compass, Users, HandHeart, Home } from 'lucide-react'
import {
  PhotoHero,
  Section,
  SectionHeading,
  Lead,
  Body,
  ZigZag,
  Statement,
  PullQuote,
  BetaCTA,
  Button,
  Card,
} from '@/components/marketing/marketing-ui'
import { BETA_CTA_LABEL, BETA_CTA_HREF, FOUNDING_PLACE } from '@/lib/site'

export const revalidate = 3600

export const metadata: Metadata = {
  title: 'About',
  description:
    'The story behind Frequency, born on a cliff at Moonlight Beach in 2020. Guru-free, pay-it-forward, a place to be human, built to outlast any one person.',
  alternates: { canonical: '/about' },
  openGraph: {
    title: 'About Frequency',
    description: 'We’re building the place we wished existed.',
    url: '/about',
  },
}

// Code-locked (like the splash): the coded story is the single source of truth, so
// no published page-editor draft can shadow it with duplicated/garbled blocks.
export default function AboutPage() {
  return (
    <>
      {/* ── Hero ───────────────────────────────────────────────────────────── */}
      <PhotoHero
        image="/images/site/moonlight-1.jpg"
        alt="People embracing at sunrise on the bluffs above Moonlight Beach, where Frequency began"
        eyebrow="Our story"
        title="We’re building the place we wished existed."
        subtitle="It started on a beach in 2020: no guru, no brand, just a thousand strangers who needed each other. This is how it became a blueprint for doing it right."
      >
        <Button href={BETA_CTA_HREF}>
          {BETA_CTA_LABEL} <ArrowRight className="w-5 h-5" aria-hidden />
        </Button>
      </PhotoHero>

      {/* ── The hunger (intro lead) ────────────────────────────────────────── */}
      <Section tone="surface">
        <SectionHeading
          eyebrow="Where it comes from"
          title="A hunger nobody could name."
          kicker="Most of a generation feels it. Almost nobody has a word for it."
        />
        <Lead>
          We didn&apos;t set out to start a company. We set out to find each
          other, and discovered that the places built to hold people had
          quietly disappeared.
        </Lead>
        <Body>
          The corner café, the town square, the gathering ground: the third
          spaces that aren&apos;t home and aren&apos;t work, where you&apos;re
          known by name and missed when you don&apos;t show up. We traded them
          for feeds and followers, ended up surrounded yet unseen, and felt the
          loss long before we could explain it. Frequency is our answer to that
          ache, and it began the only honest way it could: with a handful of
          people on a cliff at dawn.
        </Body>
      </Section>

      {/* ── 2020 — the beginning ───────────────────────────────────────────── */}
      <ZigZag
        img="/images/site/moonlight-2.jpg"
        alt="A gathering on the bluffs at Moonlight Beach at sunrise"
        eyebrow="2020 · Moonlight Beach"
        title="It started on a cliff at dawn."
        imgAspect="portrait"
        imgPosition="top"
        reverse
        tone="canvas"
      >
        <p>
          In a season when everyone felt cut off, a few people in North County
          San Diego started meeting on the bluffs above Moonlight Beach. Just
          breath, cold air, and each other: no membership, no marketing, no one
          in charge.
        </p>
        <p>
          Word got out the way real things do: one person bringing another.
          Within eighteen months, close to a thousand people were showing up to
          breathe together at sunrise, drawn by nothing but a hunger for
          something real that none of them could quite name.
        </p>
      </ZigZag>

      <Statement tone="surface">
        It proved the hunger is{' '}
        <span className="text-primary">enormous</span>.
      </Statement>

      {/* ── The circle grows ───────────────────────────────────────────────── */}
      <ZigZag
        img="/images/site/PHOTO-2020-10-17-13-49-14.jpeg"
        alt="A music circle gathered on the cliffside above the ocean at golden hour"
        eyebrow="What it felt like"
        title="No stage. No followers. Just a circle."
        imgAspect="landscape"
      >
        <p>
          There was no guru on a stage and no audience in rows. People sat in a
          circle on the grass, passed instruments around, moved and breathed and
          actually talked. The point was never to watch someone perform
          belonging. It was to practice it together.
        </p>
        <p>
          That shape mattered more than we understood at the time. A leader you
          follow can leave, burn out, or let you down. A circle holds itself.
          The thing we&apos;d stumbled into wasn&apos;t a following at all. It
          was a community that could carry its own weight.
        </p>
      </ZigZag>

      {/* ── The hard part ──────────────────────────────────────────────────── */}
      <ZigZag
        img="/images/site/971634cd-1d52-4b3a-a0ab-5713d395d58a.jpg"
        alt="People in a quiet moment of breathwork together outdoors at golden hour"
        eyebrow="The hard part"
        title="And then it fell apart."
        imgAspect="landscape"
        reverse
        tone="canvas"
      >
        <p>
          A thousand people, and nowhere to put them. No home, no
          infrastructure, no way to hold what had been built. It ran entirely on
          a few people&apos;s energy, and energy runs out. When it faded, it
          faded fast.
        </p>
        <p>
          But it left something behind: a painfully clear picture of exactly
          what to build so that next time, it could last. Not more hype. Not a
          bigger personality. A real home, a model that doesn&apos;t depend on
          anyone&apos;s stamina, and a way to stay open to everyone.
        </p>
      </ZigZag>

      <Statement tone="ink">
        This time it gets a{' '}
        <span className="text-primary">home</span>.
      </Statement>

      {/* ── What we believe (values grid) ──────────────────────────────────── */}
      <Section tone="surface">
        <SectionHeading
          eyebrow="What we believe"
          title="The principles we won&apos;t trade away."
          kicker="Four hard rules, learned the hard way."
        />
        <div className="grid gap-5 sm:grid-cols-2">
          <Value
            icon={Compass}
            title="Guru-free"
            body="No charismatic founder to follow, no one to put on a pedestal. The community is the point, not any single voice at the front of the room."
          />
          <Value
            icon={Users}
            title="Leaderful, not leader-dependent"
            body="Everyone holds a piece of it. Designed to outlast any one person, so it can&apos;t collapse the moment a few people get tired."
          />
          <Value
            icon={HandHeart}
            title="Pay-it-forward"
            body="Circulation, not exclusion. People who can give more keep the doors open for people who can&apos;t. Nobody is priced out of belonging."
          />
          <Value
            icon={Home}
            title="A third space"
            body="Not home, not work: a real place to exhale, reset, and be missed when you don&apos;t show up. Built to be returned to, not scrolled past."
          />
        </div>
      </Section>

      {/* ── The mission ────────────────────────────────────────────────────── */}
      <ZigZag
        img="/images/site/community-1.jpg"
        alt="A Frequency community gathered together outdoors, talking and laughing"
        eyebrow="Why we exist"
        title="A place to be human."
        imgAspect="landscape"
        tone="canvas"
      >
        <p>
          Frequency exists to rebuild the third space: real physical homes for
          connection, backed by a community designed to last, and kept open to
          anyone regardless of what they can pay.
        </p>
        <p>
          We&apos;re not building a following. We&apos;re building
          infrastructure: the kind of thing you can lean your whole weight on
          and trust to still be standing next year. A place where showing up is
          easy, being known is the default, and nobody gets left at the door.
        </p>
      </ZigZag>

      {/* ── Pull-quote ─────────────────────────────────────────────────────── */}
      <PullQuote tone="surface" cite="The Frequency founding circle">
        &ldquo;We don&apos;t want to be{' '}
        <span className="text-primary">followed</span>. We want to be{' '}
        <span className="text-primary">joined</span>.&rdquo;
      </PullQuote>

      {/* ── Timeline ───────────────────────────────────────────────────────── */}
      <Section tone="canvas">
        <SectionHeading
          eyebrow="The arc"
          title="From a beach to your city."
          kicker="One circle at a time, the way it always spread."
        />
        <ol className="space-y-4">
          <Milestone
            marker="2020"
            title="A cliff at Moonlight Beach"
            body="A handful of people start meeting at dawn to breathe and reconnect. No brand, no plan, just a standing time and a place to be."
          />
          <Milestone
            marker="2021"
            title="A thousand people, no home"
            body="Word of mouth carries it to nearly a thousand. It proves the hunger is real, and proves that without a home, even the most beautiful thing can&apos;t hold."
          />
          <Milestone
            marker="Today"
            title={`Founding in ${FOUNDING_PLACE}`}
            body="The blueprint becomes real: a physical home, a community built to last, and a model that keeps the doors open to everyone. The first circles are taking root."
          />
          <Milestone
            marker="Next"
            title="Coming to your city"
            body="It spreads the only way it ever has: person to person, circle to circle, city by city. Add your name and help us choose where it seeds next."
            last
          />
        </ol>
      </Section>

      {/* ── A home for it ──────────────────────────────────────────────────── */}
      <ZigZag
        img="/images/site/22a51611-07f6-4c39-8a26-1c996295b6d3.jpg"
        alt="A Frequency community celebrating and dancing together at golden hour"
        eyebrow="What lasts"
        title="Built to outlast any one person."
        imgAspect="landscape"
        reverse
        tone="surface"
      >
        <p>
          The mistake we never want to repeat is letting it ride on a few
          people&apos;s energy. So everything about Frequency is designed to keep
          standing on its own: the spaces, the model, the way circles form and
          carry themselves.
        </p>
        <p>
          That&apos;s the whole point of starting again, deliberately, in{' '}
          {FOUNDING_PLACE}. Not to recreate a moment, but to give it the
          foundations the first one never had, and to keep real connection
          within reach for everyone, not just the few who can afford it.
        </p>
      </ZigZag>

      <Statement tone="surface">
        We&apos;re not building a following. We&apos;re building{' '}
        <span className="text-primary">infrastructure</span>.
      </Statement>

      {/* ── Close ──────────────────────────────────────────────────────────── */}
      <BetaCTA
        heading="Be one of the first."
        body="This time it gets a home. Add your name and help us build it right: a Circle to call yours, and a place to be human, together."
      />
    </>
  )
}

// ── Local building blocks ─────────────────────────────────────────────────────

// Values grid card — icon-led principle with a short rationale.
function Value({
  icon: Icon,
  title,
  body,
}: {
  icon: typeof Compass
  title: string
  body: string
}) {
  return (
    <Card tone="feature" className="flex flex-col">
      <span className="mb-5 flex h-11 w-11 items-center justify-center rounded-2xl bg-primary-bg text-primary-strong">
        <Icon className="h-5 w-5" aria-hidden />
      </span>
      <h3 className="text-lg font-bold text-text mb-2">{title}</h3>
      <p className="text-base text-muted leading-relaxed">{body}</p>
    </Card>
  )
}

// Timeline milestone — a marker chip and a dated beat in the story.
function Milestone({
  marker,
  title,
  body,
  last = false,
}: {
  marker: string
  title: React.ReactNode
  body: React.ReactNode
  last?: boolean
}) {
  return (
    <li className="relative flex gap-5 pl-1">
      <div className="flex flex-col items-center">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary-bg font-display text-base uppercase tracking-wide text-primary-strong">
          {marker}
        </span>
        {!last && <span className="mt-2 w-px flex-1 bg-border" aria-hidden />}
      </div>
      <div className={last ? '' : 'pb-2'}>
        <h3 className="text-lg font-bold text-text mb-1.5">{title}</h3>
        <p className="text-base text-muted leading-relaxed">{body}</p>
      </div>
    </li>
  )
}
