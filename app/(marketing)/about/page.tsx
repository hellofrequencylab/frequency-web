import type { Metadata } from 'next'
import { ArrowRight, Compass, Users, HandHeart, Home } from 'lucide-react'
import { BlockRender } from '@/lib/page-editor/block-render'
import {
  PhotoHero,
  Section,
  SectionHeading,
  Lead,
  Body,
  ZigZag,
  Statement,
  PullQuote,
  Button,
  Card,
} from '@/components/marketing/marketing-ui'
import { config } from '@/lib/page-editor/config'
import { getPublishedData } from '@/lib/page-editor/data'
import { getTemplate, isRenderable } from '@/lib/page-editor/templates'
import { createAdminClient } from '@/lib/supabase/admin'
import { getLiveData } from '@/lib/page-editor/live-data'
import { BETA_CTA_LABEL, BETA_CTA_HREF, FOUNDING_PLACE } from '@/lib/site'
import { JsonLd } from '@/components/json-ld'
import { breadcrumbSchema } from '@/lib/jsonld'

export const revalidate = 3600

export function generateMetadata(): Metadata {
  return {
    title: 'About',
    description:
      'The story behind Frequency, born on a cliff at Moonlight Beach in 2020. We hand ordinary people the tools to rebuild the third place where they live. Guru-free, leaderful, pay-it-forward, built to outlast any one person.',
    alternates: { canonical: '/about' },
    openGraph: {
      title: 'About Frequency',
      description: 'The third place is gone. We hand ordinary people the tools to bring it back.',
      url: '/about',
    },
  }
}

// getPublishedData -> getTemplate -> legacy, mirroring every other marketing route.
// The (marketing) layout supplies the header/footer chrome, so a Puck document drops
// straight in. The coded story below is the last-resort legacy fallback: a thousand
// people proved the hunger is real, we learned what to build so it lasts, and now we
// hand the tools to the people who start the next one. One rationed movement line;
// guru-free throughout.
export default async function AboutPage() {
  const published = await getPublishedData('about')
  const template = getTemplate('about')
  const data = isRenderable(published) ? published : isRenderable(template) ? template : null
  const live = data ? await getLiveData(createAdminClient()).catch(() => null) : null
  return (
    <>
      <JsonLd
        data={breadcrumbSchema([{ name: 'About', path: '/about' }])}
      />
      {data ? <BlockRender config={config} data={data} metadata={live ? { live } : {}} /> : <LegacyAbout />}
    </>
  )
}

function LegacyAbout() {
  return (
    <>
      {/* ── Hero ───────────────────────────────────────────────────────────── */}
      <PhotoHero
        image="/images/site/moonlight-1.jpg"
        alt="People embracing at sunrise on the bluffs above Moonlight Beach, where Frequency began"
        eyebrow="Our story"
        title="The third place is gone. We hand people the tools to bring it back."
        subtitle="It started on a beach in 2020: no guru, no brand, just a thousand strangers who needed each other. We learned what it takes to make that last. Now we put it in the hands of the people who start the next one."
      >
        <Button href="/start">
          Find your way in <ArrowRight className="w-5 h-5" aria-hidden />
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
          loss long before we could explain it. No company is going to hand the
          third place back. People rebuild it, one Circle at a time, and it
          began the only honest way it could: with a handful of people on a cliff
          at dawn.
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
          In a season when everyone felt cut off, a few people in {FOUNDING_PLACE}{' '}
          started meeting on the bluffs above Moonlight Beach. Just breath, cold
          air, and each other: no membership, no marketing, no one in charge.
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
        eyebrow="What we learned"
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
          But it left something behind: a painfully clear picture of exactly what
          to build so that next time, it could last. Not more hype. Not a bigger
          personality. A format anyone can run, a model that doesn&apos;t depend
          on anyone&apos;s stamina, a way to stay open to everyone, and a real
          home to grow into.
        </p>
      </ZigZag>

      <Statement tone="ink">
        This time we build it to{' '}
        <span className="text-primary">last</span>.
      </Statement>

      {/* ── Why we rebuild it deliberately ─────────────────────────────────── */}
      <Section tone="surface">
        <SectionHeading
          eyebrow="Why the rebuild is deliberate"
          title="We&apos;re handing it back to ordinary people."
          kicker="Not recreating a moment. Building the foundations the first one never had."
        />
        <Body>
          The first time around, it took a few tireless people standing at the
          front. That doesn&apos;t scale, and it doesn&apos;t last. So this time
          we put the tools in the hands of whoever wants to start a Circle: the
          first-night script, the simple structure that keeps a group alive past
          week three, a Journey to walk together over a season, and a bench of
          people who have done it before. You don&apos;t have to build a
          community from scratch. You set out the chairs for one Circle, and we
          hand you the rest.
        </Body>
      </Section>

      {/* ── What we believe (values grid) ──────────────────────────────────── */}
      <Section tone="canvas">
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
            body="Everyone holds a piece of it. Leaders rise from the people who keep showing up. Designed to outlast any one person, so it can&apos;t collapse the moment a few people get tired."
          />
          <Value
            icon={HandHeart}
            title="Pay-it-forward"
            body="Circulation, not exclusion. People who can give more keep the doors open for people who can&apos;t. Nobody is priced out of belonging."
          />
          <Value
            icon={Home}
            title="A third place"
            body="Not home, not work: a real place to exhale, reset, and be missed when you don&apos;t show up. Built to be returned to, not scrolled past."
          />
        </div>
      </Section>

      {/* ── The human behind it (trust, kept understated) ──────────────────── */}
      <ZigZag
        img="/images/site/PHOTO-2020-09-09-16-38-27.jpeg"
        alt="Dozens of neighbors practicing yoga together on a sunlit lawn between palm trees"
        eyebrow="The people behind it"
        title="A real person started this. It&apos;s built to not need him."
        imgAspect="landscape"
        reverse
        tone="surface"
      >
        <p>
          Frequency was started by people who lived the Moonlight Beach years and
          felt it disappear. That&apos;s the honest origin, and it&apos;s also the
          one rule we hold ourselves to: no founder you have to follow. The whole
          design exists so this never rides on one person again.
        </p>
        <p>
          So we&apos;d rather be judged on what we hand you than on who we are. If
          the format works in a stranger&apos;s living room with none of us in the
          room, we&apos;ve done our job. That&apos;s the bar.
        </p>
      </ZigZag>

      {/* ── Pull-quote ─────────────────────────────────────────────────────── */}
      <PullQuote tone="canvas" cite="The Frequency founding circle">
        &ldquo;We don&apos;t want to be{' '}
        <span className="text-primary">followed</span>. We want to be{' '}
        <span className="text-primary">joined</span>.&rdquo;
      </PullQuote>

      {/* ── The mission (the one rationed movement line) ───────────────────── */}
      <Section tone="surface">
        <SectionHeading
          eyebrow="Why we exist"
          title="A place to be human."
          kicker="The mission, said plainly, once."
        />
        <Lead>
          We think the answer to the loneliest era in history is a folding chair
          with your name on it.
        </Lead>
        <Body>
          Frequency exists to rebuild the third place: a community designed to
          last, real physical homes for connection, and a model that keeps the
          door open to anyone regardless of what they can pay. We&apos;re not
          building a following. We&apos;re building infrastructure, the kind of
          thing you can lean your whole weight on and trust to still be standing
          next year.
        </Body>
      </Section>

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
            body="The blueprint becomes real: the tools handed to anyone who wants to start a Circle, a physical home taking root, and a model that keeps the doors open to everyone. The first Circles are forming."
          />
          <Milestone
            marker="Next"
            title="Coming to your city"
            body="It spreads the only way it ever has: person to person, circle to circle, city by city, following the people who start them. Pick your way in and help us choose where it seeds next."
            last
          />
        </ol>
      </Section>

      <Statement tone="surface">
        We&apos;re not building a following. We&apos;re building{' '}
        <span className="text-primary">infrastructure</span>.
      </Statement>

      {/* ── Close — one calm path into /start ──────────────────────────────── */}
      <section className="relative bg-slat px-6 py-24 sm:py-28 text-center overflow-hidden">
        <div className="light-strip absolute inset-x-0 top-0" />
        <div className="amber-glow absolute inset-0 pointer-events-none" />
        <div className="relative mx-auto max-w-2xl">
          <h2 className="font-display uppercase text-on-ink text-4xl sm:text-5xl mb-6 text-balance">
            Be one of the first.
          </h2>
          <p className="text-xl text-on-ink-muted mb-9 leading-relaxed">
            This time it gets a home, and it gets you. Pick your way in, and we&apos;ll point you at
            the first move.
          </p>
          <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button href="/start" size="lg">
              Find your way in <ArrowRight className="w-5 h-5" aria-hidden />
            </Button>
            <a
              href={BETA_CTA_HREF}
              className="text-sm font-semibold text-on-ink-muted underline-offset-4 hover:text-on-ink hover:underline"
            >
              {BETA_CTA_LABEL}
            </a>
          </div>
        </div>
      </section>
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
