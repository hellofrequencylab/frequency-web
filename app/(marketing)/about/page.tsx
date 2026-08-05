import type { Metadata } from 'next'
import { ArrowRight, Compass, Users, HandHeart, Home } from 'lucide-react'
import { BlockRender } from '@/lib/page-editor/block-render'
import { BlockDocJsonLd } from '@/lib/page-editor/block-seo'
import {
  PhotoHero,
  PhotoBeat,
  PhotoTrio,
  Section,
  SectionHeading,
  Lead,
  Body,
  Button,
  Card,
  BetaCTA,
} from '@/components/marketing/marketing-ui'
import { Reveal } from '@/components/marketing/motion'
import { config } from '@/lib/page-editor/config'
import { getPublishedData } from '@/lib/page-editor/data'
import { getTemplate, isRenderable } from '@/lib/page-editor/templates'
import { createAdminClient } from '@/lib/supabase/admin'
import { getLiveData } from '@/lib/page-editor/live-data'
import { FOUNDING_PLACE } from '@/lib/site'
import { JsonLd } from '@/components/json-ld'
import { breadcrumbSchema } from '@/lib/jsonld'

export const revalidate = 3600

export function generateMetadata(): Metadata {
  return {
    title: 'About',
    description:
      'The story behind Frequency, born on a cliff at Moonlight Beach in 2020. We hand ordinary people the tools to rebuild the third place where they live. You keep 100% of your own bookings; we earn only a small, shrinking cut on what the network sends you, and the physical Spaces are funded by a separate community-owned vehicle.',
    alternates: { canonical: '/about' },
    openGraph: {
      title: 'About Frequency',
      description: 'The third place is gone. We hand ordinary people the tools to bring it back.',
      url: '/about',
    },
    // Metadata merges per TOP-LEVEL KEY, so a page that sets only `openGraph` inherits the ROOT
    // `twitter` block verbatim and posts the generic site card. Mirror the page's own OG values.
    twitter: {
      card: 'summary_large_image',
      title: 'About Frequency',
      description: 'The third place is gone. We hand ordinary people the tools to bring it back.',
    },
  }
}

// getPublishedData -> getTemplate -> legacy, mirroring every other marketing route.
// The (marketing) layout supplies the header/footer chrome, so a Puck document drops
// straight in. The coded story below is the last-resort legacy fallback, rebuilt to
// the DAWN 2 reference grammar (design_handoff/dawn/ui_kits/marketing/about.html):
// photographic hero with the glass fact dock, rule-amber story beats on the reading
// measure, one PhotoBeat, the ink principles band, the arc-top figure row, the
// numbered asks, and the dark close. One rationed movement line; guru-free throughout.
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
      {data && <BlockDocJsonLd data={data} path="/about" />}
      {data ? <BlockRender config={config} data={data} metadata={live ? { live } : {}} /> : <LegacyAbout />}
    </>
  )
}

// The story beats: display heading + prose on the reading measure, separated by the
// warm hairline rather than cards. Prose deserves a rule, not a box (DAWN about.html).
const STORY_BEATS: readonly { title: string; paragraphs: readonly string[] }[] = [
  {
    title: 'A hunger nobody could name.',
    paragraphs: [
      "We didn't set out to start a company. We set out to find each other, and discovered that the places built to hold people had quietly disappeared.",
      "The corner café, the town square, the gathering ground: the third spaces that aren't home and aren't work, where you're known by name and missed when you don't show up. We traded them for feeds and followers, ended up surrounded yet unseen, and felt the loss long before we could explain it. No company is going to hand the third place back. People rebuild it, one Circle at a time, and it began the only honest way it could: with a handful of people on a cliff at dawn.",
    ],
  },
  {
    title: 'It started on a cliff at dawn.',
    paragraphs: [
      `In a season when everyone felt cut off, a few people in ${FOUNDING_PLACE} started meeting on the bluffs above Moonlight Beach. Just breath, cold air, and each other: no membership, no marketing, no one in charge.`,
      'Word got out the way real things do: one person bringing another. Within eighteen months, close to a thousand people were showing up to breathe together at sunrise, drawn by nothing but a hunger for something real that none of them could quite name.',
    ],
  },
  {
    title: 'No stage. No followers. Just a circle.',
    paragraphs: [
      'There was no guru on a stage and no audience in rows. People sat in a circle on the grass, passed instruments around, moved and breathed and actually talked. The point was never to watch someone perform belonging. It was to practice it together.',
      "That shape mattered more than we understood at the time. A leader you follow can leave, burn out, or let you down. A circle holds itself. The thing we'd stumbled into wasn't a following at all. It was a community that could carry its own weight.",
    ],
  },
  {
    title: 'And then it fell apart.',
    paragraphs: [
      "A thousand people, and nowhere to put them. No home, no infrastructure, no way to hold what had been built. It ran entirely on a few people's energy, and energy runs out. When it faded, it faded fast.",
      "But it left something behind: a painfully clear picture of exactly what to build so that next time, it could last. Not more hype. Not a bigger personality. A format anyone can run, a model that doesn't depend on anyone's stamina, a way to stay open to everyone, and a real home to grow into.",
    ],
  },
]

function LegacyAbout() {
  return (
    <>
      {/* ── Hero — photographic, with the glass fact dock overhanging the seam ── */}
      <PhotoHero
        image="/images/site/moonlight-1.jpg"
        alt="People embracing at sunrise on the bluffs above Moonlight Beach, where Frequency began"
        eyebrow="Our story"
        title="The third place is gone. We hand people the tools to bring it back."
        subtitle="It started on a beach in 2020: no guru, no brand, just a thousand strangers who needed each other. We learned what it takes to make that last. Now we put it in the hands of the people who start the next one."
        facts={[
          ['2020', 'A cliff at dawn'],
          ['1,000', 'Strangers at sunrise'],
          ['0%', 'On your own bookings'],
        ]}
      >
        <Button href="/start">
          Find your way in <ArrowRight className="w-5 h-5" aria-hidden />
        </Button>
      </PhotoHero>

      {/* ── The story, told in beats separated by the warm hairline ────────────── */}
      <Section tone="canvas" role="cont">
        {STORY_BEATS.map((beat, i) => (
          <Reveal key={beat.title}>
            {/* .rule-amber is unlayered CSS carrying margin: 0, so it would beat a my-* utility;
                the rhythm lives on this wrapper instead. */}
            {i > 0 && (
              <div className="my-10">
                <hr className="rule-amber" />
              </div>
            )}
            <SectionHeading
              eyebrow={i === 0 ? 'Where it comes from' : undefined}
              title={beat.title}
              kicker={
                i === 0 ? 'Most of a generation feels it. Almost nobody has a word for it.' : undefined
              }
            />
            {beat.paragraphs.map((p, j) =>
              i === 0 && j === 0 ? <Lead key={j}>{p}</Lead> : <Body key={j}>{p}</Body>,
            )}
          </Reveal>
        ))}
      </Section>

      {/* ── The mission, carried by a photograph. The one rationed movement line. ── */}
      <PhotoBeat
        image="/images/site/adult-playground-parachute.jpg"
        alt="Adults holding the edges of a parachute together on a sunny lawn"
        eyebrow="Why we exist"
        line={
          <>
            Somewhere to belong, <span className="text-primary">near you</span>.
          </>
        }
        note="We think the answer to the loneliest era in history is a folding chair with your name on it. We're not building a following. We're building infrastructure."
      />

      {/* ── What we believe — the principles, on the ink band ──────────────────── */}
      <Section tone="ink" width="wide" className="spot relative overflow-hidden">
        <div className="relative z-10">
          <SectionHeading
            tone="ink"
            align="center"
            eyebrow="What we believe"
            title="The principles we won't trade away."
            kicker="Four hard rules, learned the hard way."
          />
          <div className="stagger mt-10 grid gap-4 sm:grid-cols-2">
            <Value
              icon={Compass}
              title="Guru-free"
              body="No charismatic founder to follow, no one to put on a pedestal. The community is the point, not any single voice at the front of the room. A real person started this, and it's built to not need him."
            />
            <Value
              icon={Users}
              title="Leaderful, not leader-dependent"
              body="Everyone holds a piece of it. Leaders rise from the people who keep showing up. Designed to outlast any one person, so it can't collapse the moment a few people get tired."
            />
            <Value
              icon={HandHeart}
              title="One honest price"
              body="Zero percent on your own bookings, always, and taking money is never behind a plan. We earn only a small, shrinking cut on the business the network sends you. One price, no surprise invoices, and your data leaves with you any month you want."
            />
            <Value
              icon={Home}
              title="A third place"
              body="Not home, not work: a real place to exhale, reset, and be missed when you don't show up. Built to be returned to, not scrolled past."
            />
          </div>
        </div>
      </Section>

      {/* ── The arc — cream rises back out of the ink on the shoulder ──────────── */}
      <Section
        tone="surface"
        width="wide"
        className="arc-top dot-grid mk-arc relative -mt-px overflow-hidden"
      >
        <div className="relative z-10">
          <SectionHeading
            align="center"
            eyebrow="The arc"
            title="From a beach to your city."
            kicker="One circle at a time, the way it always spread."
          />
          <PhotoTrio
            items={[
              {
                img: '/images/site/moonlight-2.jpg',
                alt: 'A gathering on the bluffs at Moonlight Beach at sunrise',
                title: '2020 · A cliff at Moonlight Beach',
                caption:
                  'A handful of people start meeting at dawn to breathe and reconnect. No brand, no plan, just a standing time and a place to be.',
              },
              {
                img: '/images/site/971634cd-1d52-4b3a-a0ab-5713d395d58a.jpg',
                alt: 'People in a quiet moment of breathwork together outdoors at golden hour',
                title: '2021 · A thousand people, no home',
                caption:
                  "Word of mouth carries it to nearly a thousand. It proves the hunger is real, and proves that without a home, even the most beautiful thing can't hold.",
              },
              {
                img: '/images/site/lab-storefront.jpg',
                alt: 'The storefront of the first Frequency Lab taking shape',
                title: `Today · Founding in ${FOUNDING_PLACE}`,
                caption:
                  'The blueprint becomes real: the tools handed to anyone who wants to start a Circle, a physical home taking root, and a model that keeps the doors open to everyone. The first Circles are forming.',
              },
            ]}
          />
          <Reveal>
            <p className="mx-auto mt-9 max-w-2xl text-center text-body leading-relaxed text-muted">
              Next, it spreads the only way it ever has: person to person, circle to circle, city by
              city, following the people who start them.
            </p>
          </Reveal>
        </div>
      </Section>

      {/* ── What we hand you — the rebuild, said as three plain things ─────────── */}
      <Section tone="canvas" width="wide" pad="mk-cont-soft">
        <SectionHeading
          align="center"
          eyebrow="Why the rebuild is deliberate"
          title="We're handing it back to ordinary people."
          kicker="Not recreating a moment. Building the foundations the first one never had."
        />
        <div className="stagger mt-10 grid gap-5 sm:grid-cols-3">
          <Ask
            n="01"
            title="The first-night script"
            body="You don't have to build a community from scratch. You set out the chairs for one Circle, and we hand you the rest."
          />
          <Ask
            n="02"
            title="A structure past week three"
            body="The simple structure that keeps a group alive past week three, and a model that doesn't depend on anyone's stamina."
          />
          <Ask
            n="03"
            title="A Journey and a bench"
            body="A Journey to walk together over a season, and a bench of people who have done it before."
          />
        </div>
      </Section>

      {/* ── Close — the dark beat ──────────────────────────────────────────────── */}
      <BetaCTA
        heading="Be one of the first."
        body="This time it gets a home, and it gets you. Pick your way in, and we'll point you at the first move."
      />
    </>
  )
}

// ── Local building blocks ─────────────────────────────────────────────────────

// Principle card on the ink band — icon chip, title, short rationale. Translucent
// on-ink surface with the sheen pass on hover (DAWN vows grammar).
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
    <Reveal as="article" className="sheen rounded-2xl border border-on-ink/10 bg-on-ink/5 p-6">
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-pill bg-primary/20 text-primary">
          <Icon className="h-5 w-5" aria-hidden />
        </span>
        <h3 className="text-body-lg font-bold text-on-ink">{title}</h3>
      </div>
      <p className="mt-3 text-body leading-relaxed text-on-ink-muted">{body}</p>
    </Reveal>
  )
}

// Numbered card — big display numeral over a surface card that lifts on hover.
function Ask({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <Reveal>
      <Card tone="feature" className="lift-2 h-full">
        <span className="font-display text-display-h2 leading-none text-primary-strong">
          {n}
        </span>
        <h3 className="mt-3 text-body-lg font-bold text-text">{title}</h3>
        <p className="mt-2 text-body leading-relaxed text-muted">{body}</p>
      </Card>
    </Reveal>
  )
}
