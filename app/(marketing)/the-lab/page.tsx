import type { Metadata } from 'next'
import { ArrowRight } from 'lucide-react'
import { BlockRender } from '@/lib/page-editor/block-render'
import { BlockDocJsonLd } from '@/lib/page-editor/block-seo'
import {
  PhotoHero,
  PhotoTrio,
  Section,
  SectionHeading,
  Statement,
  PillarNav,
  BetaCTA,
  Button,
  Card,
} from '@/components/marketing/marketing-ui'
import { Reveal } from '@/components/marketing/motion'
import { SiteImage } from '@/components/marketing/site-image'
import { FOUNDING_PLACE } from '@/lib/site'
import { config } from '@/lib/page-editor/config'
import { getPublishedData } from '@/lib/page-editor/data'
import { getTemplate, isRenderable } from '@/lib/page-editor/templates'
import { createAdminClient } from '@/lib/supabase/admin'
import { getLiveData } from '@/lib/page-editor/live-data'
import { JsonLd } from '@/components/json-ld'
import { breadcrumbSchema, faqSchema } from '@/lib/jsonld'

export const revalidate = 3600

export const metadata: Metadata = {
  title: 'The Lab: a third space, planned for 2028',
  description:
    'The Lab is the third space the Frequency community is building: a sauna, a cold plunge, and rooms to gather in person. The first is planned for 2028 in North County San Diego. Nothing is bookable yet.',
  alternates: { canonical: '/the-lab' },
  openGraph: {
    title: 'The Lab · Frequency',
    description:
      'A vision for 2028: a sauna, a cold plunge, and rooms to gather in person. Nothing is bookable yet. The first Lab is planned for North County San Diego.',
    url: '/the-lab',
  },
}

// Answer-first FAQ schema that matches the honest present: The Lab is a vision
// page for 2028, not a live venue (design_handoff/CHANGES.md). Kept in lockstep
// with the visible copy below (CONTENT-VOICE §8b: schema must not out-claim the
// page): no rates, nothing bookable, the Now → 2027 → 2028 build plan stated
// plainly. "Third space" keyword carried in the first answer; the answers forward
// to /discover (the live community).
const THE_LAB_FAQ = [
  {
    q: 'What is The Lab?',
    a: `The Lab is a third space the Frequency community is building: not home, not work, a real room to move, warm up in the sauna, cool down in the plunge, and switch off in person. The first one is planned for 2028 in ${FOUNDING_PLACE}. It is not open yet.`,
  },
  {
    q: 'Can I visit The Lab yet?',
    a: 'Not yet, and nothing at The Lab is bookable. The first Lab is planned to open in 2028. Until then the community meets in rooms we borrow: parks, living rooms, and rented studios. You can join a Circle near you today.',
  },
  {
    q: 'What will be inside The Lab?',
    a: 'Movement studios, a cedar thermal circuit, a cold plunge pool, a no-alcohol connection bar, and a flexible events floor. One building, tuned room by room.',
  },
  {
    q: 'When will The Lab open?',
    a: 'The plan on the page is dated: Circles meeting in borrowed rooms now, a site and permits through 2027, and the first Lab opening in 2028. There are no membership rates published because there is nothing to sell yet.',
  },
  {
    q: 'Where will the first Lab be?',
    a: `The first Lab is planned for ${FOUNDING_PLACE}, where the founding community is already meeting, and it is built to repeat in other cities once the community is there.`,
  },
]

// ── The three rooms, as intended (DAWN lab.html ROOMS) ────────────────────────
// Body copy is the site's existing Lab copy verbatim (the old INSIDE grid); the
// numbered treatment and the "Reference, not our room" label come from the
// reference. Concept photography only, so every alt says what it really is.
const ROOMS = [
  {
    n: '01',
    title: 'The thermal circuit',
    img: '/images/site/lab-thermal.jpg',
    alt: 'Reference photograph: low amber light across a cedar sauna',
    body: 'Cedar sauna and steam, hot enough to quiet the mind. The first half of the loop that resets you to baseline.',
  },
  {
    n: '02',
    title: 'The cold pool',
    img: '/images/site/lab-pool.jpg',
    alt: 'Reference photograph: a cold plunge pool, still water under low light',
    body: 'A plunge that shocks everything loose. Do it alone and it’s a habit; do it with your Circle and it’s a ritual.',
  },
  {
    n: '03',
    title: 'Movement studios',
    img: '/images/site/lab-concept.jpg',
    alt: 'Reference photograph: a warm, plant-filled movement studio lit for an evening class',
    body: 'Breathwork at sunrise, ecstatic dance after dark, strength in between. Programmed to help you calm down, not to chase a mirror.',
  },
] as const

// ── The build, said plainly (DAWN lab.html BUILD) ─────────────────────────────
// Now → 2027 → 2028 replaces anything rate-card-like: the page sells belief in
// the destination, not a day pass. Stage labels only; no counts we can't stand
// behind, no address beyond the founding area the site already names.
const BUILD = [
  {
    when: 'Now',
    title: 'Circles, in borrowed rooms',
    body: 'Circles are meeting weekly in parks, living rooms, and rented studios. The community is real; the building is not.',
  },
  {
    when: '2027',
    title: 'Site and permits',
    body: `A shortlist in ${FOUNDING_PLACE}, then the slow unglamorous part: a site, zoning, and the plumbing a sauna and a cold pool need.`,
  },
  {
    when: '2028',
    title: 'The first Lab opens',
    body: 'One building, built from day one to be repeatable. If the first room works, the second is a template instead of an experiment.',
  },
] as const

export default async function TheLabPage() {
  // getPublishedData -> getTemplate -> legacy: prefer the operator-published doc,
  // else the designed git template (so the designed page is live without a DB
  // publish), with the hardcoded legacy component as a last resort.
  const published = await getPublishedData('the-lab')
  const template = getTemplate('the-lab')
  const data = isRenderable(published) ? published : isRenderable(template) ? template : null
  const live = data ? await getLiveData(createAdminClient()).catch(() => null) : null
  return (
    <>
      <JsonLd data={breadcrumbSchema([{ name: 'The Lab', path: '/the-lab' }])} />
      {data ? (
        // No FAQPage on this rung: the template contains no Accordion, so THE_LAB_FAQ
        // describes copy that is not rendered. Scoped to the legacy body, which does.
        <BlockDocJsonLd data={data} path="/the-lab" />
      ) : (
        <JsonLd data={faqSchema(THE_LAB_FAQ)} />
      )}
      {data ? <BlockRender config={config} data={data} metadata={live ? { live } : {}} /> : <LegacyTheLab />}
    </>
  )
}

// The 2028 vision page, rebuilt to the DAWN 2 reference grammar
// (design_handoff/dawn/ui_kits/marketing/lab.html): a dark photographic hero that
// carries an intention rather than an offer, the three intended rooms on the ink
// band with concept imagery labelled "Reference, not our room", the cream plan
// band with the Now → 2027 → 2028 build timeline where rate cards would sit, and
// the "in the meantime" trio pointing at the community that already exists.
// Nothing on this page is bookable and no rates appear anywhere (CHANGES.md,
// "The Lab is a vision page for 2028").
function LegacyTheLab() {
  return (
    <>
      {/* ── Hero: the intention, and the honest disclaimer under the CTAs ────── */}
      <PhotoHero
        image="/images/site/lab-thermal.jpg"
        alt="Reference photograph for the feeling of The Lab: low amber light glowing across a cedar sauna"
        focal="object-center"
        eyebrow="The Lab · A vision for 2028"
        title={
          <>
            Heat then cold
            <br />
            <span className="text-primary">with other people</span>
          </>
        }
        subtitle="Calm isn't something you can download. The body of this community is a room with a sauna, a cold plunge, and somebody counting you down. We haven't built it yet."
        footer={
          <p className="mx-auto mt-7 max-w-xl text-body-sm leading-relaxed text-on-ink/60">
            Nothing here is bookable. The first Lab is planned to open in 2028. Until then the
            community meets in rooms we borrow, and this page is the plan, not the place.
          </p>
        }
      >
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Button href="/subscribe">
            Follow the build <ArrowRight className="w-5 h-5" aria-hidden />
          </Button>
          <Button href="/discover" variant="secondary">
            Find a Circle now
          </Button>
        </div>
      </PhotoHero>

      {/* ── The rooms: raised dark panels on the ink band, still in the dark ──── */}
      <Section tone="ink" width="wide" className="spot relative overflow-hidden">
        <div className="relative z-10">
          <SectionHeading
            tone="ink"
            align="center"
            eyebrow="Three rooms, intended"
            title="What we mean to build."
            kicker="A specification we're working to, not a facility you can visit."
          />
          <div className="stagger grid gap-5 sm:grid-cols-3">
            {ROOMS.map((room) => (
              <Room key={room.n} {...room} />
            ))}
          </div>
        </div>
      </Section>

      {/* ── The plan band: where a venue page would put rate cards, this page
          puts the dated build. dot-grid is the schematic texture on cream. ────── */}
      <Section tone="canvas" width="wide" className="dot-grid relative overflow-hidden">
        <div className="relative z-10">
          <Reveal>
            <SectionHeading
              align="center"
              eyebrow="Where this actually is"
              title="Community first, building second."
              kicker="Most third places sign a lease, then go looking for the people. We're doing it the other way round."
            />
            <p className="mx-auto max-w-2xl text-center text-body-lg leading-relaxed text-muted">
              A feed can keep people warm between meetings. It can&apos;t hold a sound bath, a
              cold plunge, or the hour after when nobody wants to leave. The Lab is the room
              those things happen in: a place built to be felt, not scrolled.
            </p>
          </Reveal>
          <div className="stagger mt-10 grid gap-5 sm:grid-cols-3">
            {BUILD.map((step, i) => (
              <BuildStep key={step.when} {...step} final={i === BUILD.length - 1} />
            ))}
          </div>
          <div className="mx-auto mt-10 max-w-2xl">
            <hr className="rule-amber" />
            <p className="mt-6 text-center text-body-sm leading-relaxed text-subtle">
              There are no membership rates on this page because there&apos;s nothing to sell
              yet. When there is, the price will be published here before anybody is asked for
              a card.
            </p>
          </div>
        </div>
      </Section>

      <Statement tone="canvas">
        The community comes first.{' '}
        <span className="text-primary-strong">The Lab is where it gets a body.</span>
      </Statement>

      {/* ── In the meantime: the thing that already exists, on the shoulder ───── */}
      <Section tone="surface" width="wide" className="arc-top mk-arc relative -mt-px overflow-hidden">
        <div className="relative z-10">
          <SectionHeading
            align="center"
            eyebrow="In the meantime"
            title="The community is here."
            kicker="The building is the sequel."
          />
          <p className="mx-auto max-w-2xl text-center text-body-lg leading-relaxed text-muted">
            Everything the Lab is meant to hold is already happening in borrowed rooms. You
            don&apos;t have to wait for 2028 to be part of it.
          </p>
          <PhotoTrio
            items={[
              {
                img: '/images/site/breathwork-circle.jpg',
                alt: 'A Circle sitting together for breathwork outdoors',
                title: 'Circles, weekly',
                caption: 'Small standing groups meeting on a fixed day, mostly outdoors, mostly free.',
              },
              {
                img: '/images/site/yoga-in-the-grass.jpg',
                alt: 'People practicing yoga on a public lawn in the morning',
                title: 'Practice, anywhere',
                caption:
                  "The breathwork and movement the Lab's floor is being designed for, on a public lawn at sunrise.",
              },
              {
                img: '/images/site/adult-playground-parachute.jpg',
                alt: 'Adults holding the edges of a parachute together on a sunny lawn',
                title: 'The ridiculous parts',
                caption: 'A parachute on the grass. No facility required, which is rather the point.',
              },
            ]}
          />
          <Reveal>
            <p className="mx-auto mt-9 max-w-2xl text-center text-body leading-relaxed text-muted">
              The room follows the people, never the other way around. See{' '}
              <a href="/loneliness" className="font-semibold text-primary-strong hover:underline">
                what a third space is
              </a>
              , or meet the live community on{' '}
              <a href="/discover" className="font-semibold text-primary-strong hover:underline">
                Discover
              </a>
              .
            </p>
          </Reveal>
        </div>
      </Section>

      <PillarNav current="/the-lab" tone="surface" />

      <BetaCTA
        heading="Be part of building the first one."
        body="The community is how the Lab begins. Join the Beta and help shape the room before the doors open."
      />
    </>
  )
}

// ── Local building blocks ─────────────────────────────────────────────────────

// One intended room: a raised dark panel with concept photography, the haloed
// numeral overlapping the image edge, and the "Reference, not our room" label
// that keeps the photograph honest (DAWN lab.html room card).
function Room({
  n,
  title,
  img,
  alt,
  body,
}: {
  n: string
  title: string
  img: string
  alt: string
  body: string
}) {
  return (
    <Reveal
      as="article"
      className="lift-2 h-full overflow-hidden rounded-2xl border border-on-ink/10 bg-on-ink/5"
    >
      <div className="relative">
        <SiteImage src={img} alt={alt} aspect="16/10" sizes="(min-width: 640px) 22rem, 100vw" />
        <span
          aria-hidden
          className="absolute -bottom-4 left-5 flex h-9 w-9 items-center justify-center rounded-pill bg-primary font-display text-body-sm text-on-primary"
        >
          {n}
        </span>
      </div>
      <div className="p-6 pt-8">
        <p className="text-3xs font-bold uppercase tracking-eyebrow text-on-ink-subtle">
          Reference, not our room
        </p>
        <h3 className="mt-2 font-display uppercase text-page-title text-on-ink">{title}</h3>
        <p className="mt-2 text-body leading-relaxed text-on-ink-muted">{body}</p>
      </div>
    </Reveal>
  )
}

// One stage of the build. The 2028 card is the chosen one, so it wears the
// highlight tone (the one CHOSEN card in a set) rather than a hand-tuned border.
function BuildStep({
  when,
  title,
  body,
  final,
}: {
  when: string
  title: string
  body: string
  final: boolean
}) {
  return (
    <Reveal>
      <Card tone={final ? 'highlight' : 'feature'} className="lift-2 h-full">
        <span
          className={`font-display text-4xl leading-none ${final ? 'text-primary-strong' : 'text-text'}`}
        >
          {when}
        </span>
        <h3 className="mt-3 text-body-lg font-bold text-text">{title}</h3>
        <p className="mt-2 text-body leading-relaxed text-muted">{body}</p>
      </Card>
    </Reveal>
  )
}
