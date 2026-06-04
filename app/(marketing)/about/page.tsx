import type { Metadata } from 'next'
import { ArrowRight, Compass, Users, HandHeart, Home } from 'lucide-react'
import { Render } from '@measured/puck/rsc'
import {
  PhotoHero,
  Section,
  SectionHeading,
  Lead,
  Body,
  ZigZag,
  Statement,
  PullQuote,
  Stat,
  BetaCTA,
  Button,
  Card,
} from '@/components/marketing/marketing-ui'
import { BETA_CTA_LABEL, BETA_CTA_HREF, FOUNDING_PLACE } from '@/lib/site'
import { config } from '@/lib/page-editor/config'
import { getPublishedData } from '@/lib/page-editor/data'

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

export default async function AboutPage() {
  const data = await getPublishedData('about')
  if (data && Array.isArray(data.content) && data.content.length > 0) {
    return <Render config={config} data={data} />
  }
  return <LegacyAbout />
}

function LegacyAbout() {
  return (
    <>
      {/* ── Hero ───────────────────────────────────────────────────────────── */}
      <PhotoHero
        image="/images/site/moonlight-1.jpg"
        alt="People embracing at sunrise on the bluffs above Moonlight Beach, where Frequency began"
        eyebrow="Our story"
        title="We’re building the place we wished existed."
        subtitle="It started on a cliff at dawn in 2020: no guru, no brand, just a thousand strangers who turned into each other’s people. This is how that morning became a blueprint for doing it right."
        focal="object-top"
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
          quietly disappeared while no one was looking.
        </Lead>
        <Body>
          The corner café, the town square, the gathering ground: the third
          spaces that aren&apos;t home and aren&apos;t work, where you&apos;re
          known by name and missed when you don&apos;t show up. One by one they
          closed, or went quiet, or got priced out, and we replaced them with
          feeds and followers. We ended up surrounded yet unseen, scrolling past
          a thousand faces and recognizing none of them. We felt the loss long
          before we had a word for it.
        </Body>
        <Body>
          You can have a thousand followers and no one to call when the day goes
          sideways. That is the gap. It is quiet, it is everywhere, and it is the
          whole reason we are here. Frequency is our answer to it, and it began
          the only honest way it could: not in a boardroom or a brand deck, but
          with a handful of people on a cliff at first light, deciding to keep
          showing up for each other.
        </Body>
      </Section>

      {/* ── 2020 — the beginning ───────────────────────────────────────────── */}
      <ZigZag
        img="/images/site/moonlight-2.jpg"
        alt="A woman dancing barefoot on the sand at sunrise as the morning gathering breaks open"
        eyebrow="2020 · Moonlight Beach"
        title="It started on a cliff at dawn."
        imgAspect="portrait"
        imgPosition="center"
        reverse
        tone="canvas"
      >
        <p>
          In a season when everyone felt cut off, a few people in North County
          San Diego started meeting on the bluffs above Moonlight Beach. Before
          the cafés opened, before the inboxes filled, while the sky was still
          going from grey to gold and the only sound was the surf below. Just
          breath, cold air off the water, and each other. No membership, no
          marketing, no one in charge.
        </p>
        <p>
          You would arrive half awake and a little guarded, hands in your
          sleeves against the chill. Then somewhere between the first cold inhale
          and the light breaking gold over the Pacific, the guard would drop. A
          stranger would catch your eye and you&apos;d both just grin. Strangers
          became a circle. The circle became the reason to set an alarm in the
          dark.
        </p>
        <p>
          Word got out the way real things do, never advertised, only carried,
          one person bringing the friend they couldn&apos;t stop telling. Over
          time close to a thousand people came through, drawn by nothing but a
          hunger for something real that none of them could quite put a name to.
        </p>
      </ZigZag>

      {/* ── The ritual (sensory beat) ──────────────────────────────────────── */}
      <ZigZag
        img="/images/site/PHOTO-2020-09-09-16-38-27.jpeg"
        alt="Dozens of people moving through a morning practice together on the grass above the beach"
        eyebrow="The ritual"
        title="Every morning, for years."
        imgAspect="natural"
        imgPosition="center"
        tone="surface"
      >
        <p>
          It was not a one-off retreat or a viral weekend. It was a standing
          time and a standing place, held more than five hundred mornings in a
          row. Rain, fog, June gloom, hangovers, heartbreak, it did not matter.
          The mats came out on the wet grass and somebody was always there,
          steam rising off shoulders in the cold, waiting with the kettle and a
          spot saved next to them.
        </p>
        <p>
          That is the part the numbers miss. A practice you can count on rewires
          you. You stop asking whether you feel like going and start ordering
          your week around the people who will notice the empty mat if you
          don&apos;t. Showing up stops being a plan you keep and becomes a person
          you are.
        </p>
      </ZigZag>

      {/* ── Proof in numbers ───────────────────────────────────────────────── */}
      <Section tone="canvas">
        <SectionHeading
          eyebrow="The proof"
          title="The hunger is enormous."
          kicker="No budget, no brand, no one at the front. People came anyway."
        />
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-4 sm:gap-6">
          <Stat value="500+" label="Mornings in a row" />
          <Stat value="1,000+" label="People came through" />
          <Stat value="0" label="Gurus on a stage" />
          <Stat value="$0" label="Spent on marketing" />
        </div>
      </Section>

      {/* ── The circle grows ───────────────────────────────────────────────── */}
      <ZigZag
        img="/images/site/PHOTO-2020-10-17-13-49-14.jpeg"
        alt="A music circle gathered on the cliffside above the ocean at golden hour"
        eyebrow="What it felt like"
        title="No stage. No followers. Just a circle."
        imgAspect="natural"
        imgPosition="center"
        reverse
        tone="surface"
      >
        <p>
          There was no guru on a stage and no audience in rows. People sat in a
          ring on the bluff with the ocean at their backs, passed a guitar and a
          drum around, sang a little off-key, moved and breathed and actually
          talked. Whoever needed to be held that morning ended up in the middle.
          The point was never to watch someone perform belonging. It was to
          practice it, on each other, until it was real.
        </p>
        <p>
          That shape mattered more than we understood at the time. A leader you
          follow can leave, burn out, or let you down, and the whole thing goes
          with them. A circle has no front and no exit. It holds itself. What we
          had stumbled into wasn&apos;t a following at all. It was a community
          that could carry its own weight.
        </p>
      </ZigZag>

      {/* ── The hard part ──────────────────────────────────────────────────── */}
      <ZigZag
        img="/images/site/971634cd-1d52-4b3a-a0ab-5713d395d58a.jpg"
        alt="People in a quiet moment of breathwork together outdoors at golden hour"
        eyebrow="The hard part"
        title="And then it fell apart."
        imgAspect="landscape"
        imgPosition="center"
        tone="canvas"
      >
        <p>
          A thousand people, and nowhere to put them. No home, no
          infrastructure, no way to hold what had been built. It ran entirely on
          a few people&apos;s energy, and energy runs out. When it faded it faded
          fast, the way a fire does once no one is left to feed it. One morning
          there were fifty of us, and then there were the few, and then the
          bluff was just a bluff again. The ache of losing it was sharper than
          the ache that had started it. We had finally found each other, and we
          watched it slip through our hands for want of a roof and a plan.
        </p>
        <p>
          But it left something behind: a painfully clear picture of exactly
          what to build so that next time, it could last. Not more hype. Not a
          bigger personality at the front. A real home with a door that locks and
          opens, a model that doesn&apos;t depend on anyone&apos;s stamina, and a
          way to stay open to everyone who needs it.
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
          anyone regardless of what they can pay. A place you walk into tired and
          walk out of lighter, where the barista knows your order and someone
          waves you over before you&apos;ve found a seat.
        </p>
        <p>
          We&apos;re not building a following. We&apos;re building
          infrastructure: the kind of thing you can lean your whole weight on and
          trust to still be standing next year. A place where showing up is easy,
          being known is the default, and nobody, ever, gets left at the door.
        </p>
      </ZigZag>

      {/* ── A place to be human (sensory beat) ─────────────────────────────── */}
      <ZigZag
        img="/images/site/PHOTO-2020-10-07-14-38-02.jpeg"
        alt="People laughing and lifting a friend into the air, dancing barefoot on the beach at golden hour"
        eyebrow="What it’s for"
        title="Somewhere to be fully yourself."
        imgAspect="landscape"
        imgPosition="center"
        reverse
        tone="surface"
      >
        <p>
          Picture the last time you laughed so hard your face hurt, surrounded by
          people who were laughing with you, not at a screen. Barefoot in the
          sand, somebody lifted off their feet, the whole circle whooping. No
          performance, no posting it, no version of you to maintain. Just being
          here, loud and unguarded and held.
        </p>
        <p>
          That feeling is not a luxury and it is not rare by nature. We have just
          run out of places that make it easy. Frequency is built to make it easy
          again, on an ordinary Tuesday, within walking distance of your door.
        </p>
      </ZigZag>

      {/* ── Pull-quote ─────────────────────────────────────────────────────── */}
      <PullQuote tone="canvas" cite="The Frequency founding circle">
        &ldquo;We don&apos;t want to be{' '}
        <span className="text-primary">followed</span>. We want to be{' '}
        <span className="text-primary">joined</span>.&rdquo;
      </PullQuote>

      {/* ── Timeline ───────────────────────────────────────────────────────── */}
      <Section tone="surface">
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
        imgPosition="center"
        reverse
        tone="canvas"
      >
        <p>
          The mistake we never want to repeat is letting it ride on a few
          people&apos;s energy. So everything about Frequency is designed to keep
          standing on its own: the spaces, the model, the way circles form and
          carry themselves. No single founder it can&apos;t survive, no hero at
          the front who has to never get tired. The first morning proved the
          fire. This time we&apos;re building the hearth to keep it in.
        </p>
        <p>
          That&apos;s the whole point of starting again, deliberately, in{' '}
          {FOUNDING_PLACE}. Not to recreate a moment, but to give it the
          foundations the first one never had, and to keep real connection within
          reach for everyone, not just the few who can afford it.
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
